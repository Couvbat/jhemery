import { ConfigService } from '@nestjs/config';
import { LlmService } from './llm';

/**
 * The slot `ask` and the moderator share: a visitor takes it or is turned away at once; the
 * moderator waits for it, and for any detached warm-up, and never jumps a visitor.
 */
describe('LlmService', () => {
  const env: Record<string, string> = {
    LLM_BASE_URL: 'http://box.local:8080/v1/',
    LLM_MODEL: 'a-model',
    LLM_API_KEY: 'k',
  };
  const llm = () =>
    new LlmService({
      get: (key: string) => env[key],
    } as unknown as ConfigService);
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  it('gives a visitor the slot or nothing, at once', () => {
    const service = llm();
    const release = service.tryAcquire();
    expect(release).not.toBeNull();
    expect(service.tryAcquire()).toBeNull();
    release!();
    release!();
    expect(service.tryAcquire()).not.toBeNull();
  });

  it('makes a background caller wait for the slot, then for the warm-up', async () => {
    const service = llm();
    const visitor = service.tryAcquire()!;
    let finishWarmUp!: () => void;
    service.warmingUntil(
      new Promise<void>((resolve) => (finishWarmUp = resolve)),
    );

    let got = false;
    const waiting = service.acquire({ background: true }).then((release) => {
      got = true;
      return release;
    });
    await settle();
    expect(got).toBe(false);

    visitor();
    await settle();
    // The slot is free, but a load is still finishing: still waiting.
    expect(got).toBe(false);

    finishWarmUp();
    const release = await waiting;
    expect(got).toBe(true);
    // Held by the moderator now: a visitor is turned away until it gives it back.
    expect(service.tryAcquire()).toBeNull();
    release();
    expect(service.tryAcquire()).not.toBeNull();
  });

  it('stops waiting on its signal', async () => {
    const service = llm();
    service.tryAcquire();
    const controller = new AbortController();
    const waiting = service.acquire({ background: true }, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toThrow('aborted');
  });

  it('reads one whole answer, with the model, the key and no thinking', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: { content: '<think>hmm</think> {"verdict":"publish"}' },
            },
          ],
        }),
    });
    global.fetch = fetchMock;

    const text = await llm().complete({ max_tokens: 60, messages: [] });

    expect(text).toBe('{"verdict":"publish"}');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://box.local:8080/v1/chat/completions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer k' });
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'a-model',
      stream: false,
      reasoning_effort: 'none',
      max_tokens: 60,
    });
  });
});
