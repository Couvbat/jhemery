import {
  BadGatewayException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AskService } from './ask.service';
import { AskDto } from './ask.dto';

/**
 * `ask` is the only endpoint that spends someone's electricity and points at a
 * machine on a home network, so the interesting behaviour is all in the limits:
 * off unless opted into, one question in flight, and a failure that reads the
 * same as an unconfigured install so the terminal has one degraded path.
 */
describe('AskService', () => {
  const dto: AskDto = { question: 'does he know Rust?', locale: 'en' };

  const configured = {
    ASK_ENABLED: 'true',
    LLM_BASE_URL: 'http://box.local:8080/v1',
    LLM_MODEL: 'a-model',
  };

  let fetchMock: jest.Mock;

  function service(env: Record<string, string> = configured): AskService {
    const config = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;
    return new AskService(config);
  }

  /** An OpenAI-compatible `stream: true` body, split across arbitrary chunks. */
  function completion(...chunks: string[]): Response {
    const encoder = new TextEncoder();
    return {
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
    } as unknown as Response;
  }

  function delta(content: string): string {
    return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
  }

  const corpus = {
    ok: true,
    status: 200,
    text: () => Promise.resolve('# corpus'),
  };

  /**
   * llms.txt first, then the model — the order the service calls them in. The
   * model response is built per call because a body can only be read once.
   */
  function respond(model: () => Response) {
    fetchMock.mockImplementation((url: string | URL) =>
      String(url).includes('llms.txt')
        ? Promise.resolve(corpus as unknown as Response)
        : Promise.resolve(model()),
    );
  }

  function collect(): { deltas: string[]; onDelta: (d: string) => void } {
    const deltas: string[] = [];
    return { deltas, onDelta: (d) => deltas.push(d) };
  }

  /** Lets the background corpus refresh settle. */
  async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  /** The system prompt the model was handed on fetch call `n`. */
  function promptAt(n: number): string {
    const [, init] = fetchMock.mock.calls[n] as [string, RequestInit];
    const { messages } = JSON.parse(init.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    return messages[0].content;
  }

  /**
   * A service that has already pulled llms.txt. The first question is always
   * answered from the fallback, so a test about the real corpus has to get past
   * it first. Fetch calls afterwards: 0 = llms.txt, 1 = the throwaway model
   * call, 2+ = the test's own.
   */
  async function warmed(env?: Record<string, string>): Promise<AskService> {
    const instance = service(env);
    const { onDelta } = collect();
    await instance.answer(dto, onDelta);
    await settle();
    return instance;
  }

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('configuration', () => {
    it('is off unless ASK_ENABLED is exactly true', () => {
      expect(service({ ...configured, ASK_ENABLED: 'false' }).enabled).toBe(
        false,
      );
      expect(service({ ...configured, ASK_ENABLED: '1' }).enabled).toBe(false);
      expect(service({}).enabled).toBe(false);
      expect(service().enabled).toBe(true);
    });

    it('needs a URL and a model, not just the flag', () => {
      expect(service({ ASK_ENABLED: 'true' }).enabled).toBe(false);
      expect(
        service({ ASK_ENABLED: 'true', LLM_BASE_URL: 'http://box:8080/v1' })
          .enabled,
      ).toBe(false);
    });

    it('reads as unreachable rather than as its own failure mode', async () => {
      // The terminal renders one degraded line for "off" and "asleep" alike, so
      // an unconfigured install must not need a second code path to detect.
      const { onDelta } = collect();

      await expect(service({}).answer(dto, onDelta)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('streaming', () => {
    it('yields the content of each chunk', async () => {
      respond(() =>
        completion(delta('Yes'), delta(', he does.'), 'data: [DONE]\n\n'),
      );
      const { deltas, onDelta } = collect();

      await service().answer(dto, onDelta);

      // The text, not the chunking: the thinking filter holds a few characters
      // back at each boundary in case they open a `<think>`, so deltas do not
      // line up with the model's. The terminal accumulates and re-wraps anyway.
      expect(deltas.join('')).toBe('Yes, he does.');
      expect(deltas.length).toBeGreaterThan(1);
    });

    it('reassembles an event split across two network chunks', async () => {
      const whole = delta('Rust');
      respond(() =>
        completion(whole.slice(0, 20), whole.slice(20), 'data: [DONE]\n\n'),
      );
      const { deltas, onDelta } = collect();

      await service().answer(dto, onDelta);

      expect(deltas).toEqual(['Rust']);
    });

    it('skips a malformed chunk rather than losing the answer', async () => {
      respond(() =>
        completion('data: {not json\n\n', delta('fine'), 'data: [DONE]\n\n'),
      );
      const { deltas, onDelta } = collect();

      await service().answer(dto, onDelta);

      expect(deltas).toEqual(['fine']);
    });

    it('sends the question, the model and a bearer key upstream', async () => {
      respond(() => completion(delta('hi'), 'data: [DONE]\n\n'));
      const { onDelta } = collect();

      await service({ ...configured, LLM_API_KEY: 'k' }).answer(dto, onDelta);

      const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(url).toBe('http://box.local:8080/v1/chat/completions');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer k',
      );

      const body = JSON.parse(init.body as string) as {
        model: string;
        stream: boolean;
        max_tokens: number;
        messages: Array<{ role: string; content: string }>;
      };
      expect(body).toMatchObject({
        model: 'a-model',
        stream: true,
        max_tokens: 300,
      });
      expect(body.messages[1]).toEqual({ role: 'user', content: dto.question });
    });

    it('omits the Authorization header when no key is set', async () => {
      respond(() => completion('data: [DONE]\n\n'));
      const { onDelta } = collect();

      await service().answer(dto, onDelta);

      const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(init.headers).not.toHaveProperty('Authorization');
    });

    it('grounds the system prompt in the corpus and names the answer language', async () => {
      respond(() => completion('data: [DONE]\n\n'));
      const { onDelta } = collect();

      const instance = await warmed();
      await instance.answer({ ...dto, locale: 'fr' }, onDelta);

      expect(promptAt(2)).toContain('# corpus');
      expect(promptAt(2)).toContain('French');
      expect(promptAt(2)).toContain('CTF flag');
    });

    it('asks the model not to think', async () => {
      // A reasoning model spends the whole 300-token budget deliberating and
      // gets cut off mid-sentence — `gemma4:e4b` finishes `length`, not `stop`.
      respond(() => completion('data: [DONE]\n\n'));
      const { onDelta } = collect();

      await service().answer(dto, onDelta);

      const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as {
        reasoning_effort: string;
      };
      expect(body.reasoning_effort).toBe('none');
    });

    it('never streams a `reasoning` field to the terminal', async () => {
      // Ollama keeps chain-of-thought out of `content`, in a sibling field.
      const thinking = `data: ${JSON.stringify({
        choices: [{ delta: { content: '', reasoning: 'Let me consider…' } }],
      })}\n\n`;
      respond(() => completion(thinking, delta('Yes.'), 'data: [DONE]\n\n'));
      const { deltas, onDelta } = collect();

      await service().answer(dto, onDelta);

      expect(deltas).toEqual(['Yes.']);
    });

    it('strips a `<think>` block that arrives inline in the content', async () => {
      respond(() =>
        completion(
          delta('<think>weighing it up</think>'),
          delta('Yes.'),
          'data: [DONE]\n\n',
        ),
      );
      const { deltas, onDelta } = collect();

      await service().answer(dto, onDelta);

      expect(deltas.join('')).toBe('Yes.');
    });

    it('strips a `<think>` block split across chunks', async () => {
      // The tag boundary is exactly where a naive `replace` gives up.
      respond(() =>
        completion(
          delta('<thi'),
          delta('nk>weighing'),
          delta(' it up</thi'),
          delta('nk>Yes, he does.'),
          'data: [DONE]\n\n',
        ),
      );
      const { deltas, onDelta } = collect();

      await service().answer(dto, onDelta);

      expect(deltas.join('')).toBe('Yes, he does.');
    });

    it('holds back nothing when there is no thinking to strip', async () => {
      // The filter buffers a few characters in case they start a tag; they
      // must still come out at the end.
      respond(() => completion(delta('Yes, he does.'), 'data: [DONE]\n\n'));
      const { deltas, onDelta } = collect();

      await service().answer(dto, onDelta);

      expect(deltas.join('')).toBe('Yes, he does.');
    });

    it('treats an answer that is only thinking as no answer at all', async () => {
      // Better the terminal says the model is asleep than prints nothing.
      respond(() =>
        completion(delta('<think>still going'), 'data: [DONE]\n\n'),
      );
      const { deltas, onDelta } = collect();

      await service().answer(dto, onDelta);

      expect(deltas).toEqual([]);
    });

    it('reports an upstream error as unreachable', async () => {
      respond(() => ({ ok: false, status: 500 }) as unknown as Response);
      const { onDelta } = collect();

      await expect(service().answer(dto, onDelta)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it('reports a refused connection as unreachable', async () => {
      fetchMock.mockImplementation((url: string | URL) =>
        String(url).includes('llms.txt')
          ? Promise.resolve(corpus as unknown as Response)
          : Promise.reject(new Error('ECONNREFUSED')),
      );
      const { onDelta } = collect();

      await expect(service().answer(dto, onDelta)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });

  describe('concurrency', () => {
    /** Holds the corpus fetch open so the first request stays in flight. */
    function stall(): { release: () => void } {
      let release!: () => void;
      const held = new Promise<Response>((resolve) => {
        release = () => resolve(completion(delta('hi'), 'data: [DONE]\n\n'));
      });
      // The model, not the corpus: the corpus is off the request path now, so
      // holding it open would no longer keep anything in flight.
      fetchMock.mockImplementation((url: string | URL) =>
        String(url).includes('llms.txt')
          ? Promise.resolve(corpus as unknown as Response)
          : held,
      );
      return { release };
    }

    it('refuses a second question while one is in flight', async () => {
      const instance = service();
      const { release } = stall();
      const { onDelta } = collect();

      const first = instance.answer(dto, onDelta);
      await expect(instance.answer(dto, onDelta)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      release();
      await first;
    });

    it('frees the slot once the answer finishes', async () => {
      const instance = service();
      respond(() => completion(delta('hi'), 'data: [DONE]\n\n'));
      const { onDelta } = collect();

      await instance.answer(dto, onDelta);
      await expect(instance.answer(dto, onDelta)).resolves.toBeUndefined();
    });

    it('frees the slot after a failure too', async () => {
      // A model that 500s must not lock everyone out until a restart.
      const instance = service();
      respond(() => ({ ok: false, status: 500 }) as unknown as Response);
      const { onDelta } = collect();

      await expect(instance.answer(dto, onDelta)).rejects.toBeInstanceOf(
        BadGatewayException,
      );

      respond(() => completion(delta('hi'), 'data: [DONE]\n\n'));
      await expect(instance.answer(dto, onDelta)).resolves.toBeUndefined();
    });
  });

  describe('corpus', () => {
    it('does not make the answer wait on llms.txt', async () => {
      // The production bug: awaiting this fetch put a loopback HTTP call to the
      // frontend host on the request path, and when it hung the endpoint hung
      // with it — the model was never contacted and nothing ever came back.
      jest.useFakeTimers();
      let dialled = false;
      fetchMock.mockImplementation((url: string | URL, init?: RequestInit) =>
        String(url).includes('llms.txt')
          ? new Promise<Response>((_, reject) => {
              dialled = true;
              // A real fetch rejects when its signal fires; without that the
              // refresh would never settle and leak its abort timer.
              init?.signal?.addEventListener('abort', () =>
                reject(new Error('aborted')),
              );
            })
          : Promise.resolve(completion(delta('Yes.'), 'data: [DONE]\n\n')),
      );
      const { deltas, onDelta } = collect();

      await expect(service().answer(dto, onDelta)).resolves.toBeUndefined();

      expect(dialled).toBe(true);
      expect(deltas.join('')).toBe('Yes.');

      // Fire the 5s corpus timeout so the background refresh settles.
      jest.runOnlyPendingTimers();
      await settle();
      jest.useRealTimers();
    });

    it('answers the first question from the baked-in fallback', async () => {
      // The refresh has not landed yet, so this is the corpus every cold start
      // uses. It has to be good enough to answer from.
      respond(() => completion('data: [DONE]\n\n'));
      const { onDelta } = collect();

      await service().answer(dto, onDelta);

      expect(promptAt(1)).toContain('jhemery.xyz');
    });

    it('uses the real corpus once the background refresh lands', async () => {
      respond(() => completion('data: [DONE]\n\n'));
      const instance = await warmed();
      const { onDelta } = collect();

      await instance.answer(dto, onDelta);

      expect(promptAt(2)).toContain('# corpus');
    });

    it('fetches llms.txt once, not once per question', async () => {
      respond(() => completion('data: [DONE]\n\n'));
      const instance = await warmed();
      const { onDelta } = collect();

      await instance.answer(dto, onDelta);
      await instance.answer(dto, onDelta);

      const corpusCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('llms.txt'),
      );
      expect(corpusCalls).toHaveLength(1);
    });

    it('backs off instead of re-dialling a broken host every question', async () => {
      // A host that hangs rather than refusing would otherwise get a fresh
      // connection per visitor, forever.
      fetchMock.mockImplementation((url: string | URL) =>
        String(url).includes('llms.txt')
          ? Promise.reject(new Error('ENOTFOUND'))
          : Promise.resolve(completion('data: [DONE]\n\n')),
      );
      const instance = await warmed();
      const { onDelta } = collect();

      await instance.answer(dto, onDelta);
      await instance.answer(dto, onDelta);

      const corpusCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('llms.txt'),
      );
      expect(corpusCalls).toHaveLength(1);
    });
  });

  describe('logging', () => {
    it('records latency and outcome, never the question or the answer', async () => {
      // A transcript of what strangers asked turns a toy into a privacy obligation.
      const logged = jest.spyOn(Logger.prototype, 'log');
      respond(() => completion(delta('a private answer'), 'data: [DONE]\n\n'));
      const { onDelta } = collect();

      await service().answer(dto, onDelta);

      const lines = logged.mock.calls.map((call) => String(call[0])).join('\n');
      expect(lines).toMatch(/\d+ms/);
      expect(lines).not.toContain(dto.question);
      expect(lines).not.toContain('a private answer');
    });
  });
});
