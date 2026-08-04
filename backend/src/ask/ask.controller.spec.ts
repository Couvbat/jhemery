import { BadGatewayException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AskController } from './ask.controller';
import { AskService } from './ask.service';
import { AskDto } from './ask.dto';

/**
 * The controller's whole job is deciding *when* the response starts, and every
 * interesting case is a failure: the endpoint sits behind Cloudflare, which
 * replaces any origin still silent at 100 seconds with a 524 of its own. That
 * page carries no CORS headers, so from a browser a hang is indistinguishable
 * from a misconfigured endpoint — which is how the last one was reported.
 */
describe('AskController', () => {
  const dto: AskDto = { question: 'does he know Rust?', locale: 'en' };

  /**
   * Enough of an `express` response to observe the three things that matter:
   * whether the status line went out, what was written, and whether anything
   * was written after the end.
   */
  function response(): {
    res: Response;
    body: () => string;
    status: () => number | null;
    ended: () => boolean;
  } {
    let status: number | null = null;
    let ended = false;
    const chunks: string[] = [];
    const listeners: Array<() => void> = [];

    const res = {
      get headersSent() {
        return status !== null;
      },
      writeHead(code: number) {
        status = code;
        return res;
      },
      write(chunk: string) {
        // The real thing throws ERR_STREAM_WRITE_AFTER_END here, which is the
        // failure mode a late-arriving delta would cause.
        if (ended) throw new Error('write after end');
        chunks.push(chunk);
        return true;
      },
      end() {
        ended = true;
        for (const fn of listeners) fn();
        return res;
      },
      on(event: string, fn: () => void) {
        if (event === 'close') listeners.push(fn);
        return res;
      },
    } as unknown as Response;

    return {
      res,
      body: () => chunks.join(''),
      status: () => status,
      ended: () => ended,
    };
  }

  /** An `AskService` whose `answer()` this test drives by hand. */
  function service(answer: AskService['answer']): AskService {
    return { answer } as unknown as AskService;
  }

  function controller(answer: AskService['answer']): AskController {
    return new AskController(service(answer));
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('streams deltas as SSE events and closes with [DONE]', async () => {
    const { res, body, status } = response();
    const ask = controller((_dto, onDelta) => {
      onDelta('Yes');
      onDelta(', he does.');
      return Promise.resolve();
    });

    await ask.question(dto, res);

    expect(status()).toBe(200);
    expect(body()).toBe(
      'data: {"delta":"Yes"}\n\ndata: {"delta":", he does."}\n\ndata: [DONE]\n\n',
    );
  });

  it('rethrows a failure that lands before the first token, so the status code is still ours', async () => {
    const { res, status } = response();
    const ask = controller(() =>
      Promise.reject(new BadGatewayException('The model is unavailable')),
    );

    await expect(ask.question(dto, res)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    // Never started: the exception filter owns the response, and the terminal
    // gets a real 502 to degrade on rather than a truncated stream.
    expect(status()).toBeNull();
  });

  it('ends without [DONE] when the model fails mid-answer, keeping what arrived', async () => {
    const { res, body } = response();
    const ask = controller((_dto, onDelta) => {
      onDelta('Yes, he ');
      return Promise.reject(
        new BadGatewayException('The model is unreachable'),
      );
    });

    await ask.question(dto, res);

    expect(body()).toBe('data: {"delta":"Yes, he "}\n\n');
    expect(body()).not.toContain('[DONE]');
  });

  /**
   * The regression. Before the ceiling, a service that never called back and
   * never returned left the socket silent indefinitely; Cloudflare answered for
   * us, with a 524 and no `Access-Control-Allow-Origin`.
   */
  it('answers degraded rather than staying silent long enough for a proxy to time out', async () => {
    const { res, body, status, ended } = response();
    const ask = controller(() => new Promise<void>(() => {}));

    const pending = ask.question(dto, res);
    jest.advanceTimersByTime(45_000);
    await Promise.resolve();

    expect(status()).toBe(200);
    expect(body()).toBe('data: {"error":"asleep"}\n\ndata: [DONE]\n\n');
    expect(ended()).toBe(true);
    // The handler itself is still parked on a service that never settles, which
    // is fine — the visitor has their answer and the model keeps loading.
    void pending;
  });

  it('does not write after the ceiling has ended the response', async () => {
    const { res, body } = response();
    let late!: (delta: string) => void;
    const ask = controller((_dto, onDelta) => {
      late = onDelta;
      return new Promise<void>(() => {});
    });

    const pending = ask.question(dto, res);
    jest.advanceTimersByTime(45_000);
    await Promise.resolve();

    // The detached request finishing after everyone stopped listening.
    expect(() => late('too late')).not.toThrow();
    expect(body()).not.toContain('too late');
    void pending;
  });

  it('lets a slow but working answer run past the ceiling', async () => {
    const { res, body } = response();
    let finish!: () => void;
    const ask = controller((_dto, onDelta) => {
      onDelta('Yes');
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });

    const pending = ask.question(dto, res);
    // Headers are out, so the proxy is satisfied and the ceiling has nothing to
    // rescue. Cutting the answer off here would be the bug.
    jest.advanceTimersByTime(60_000);
    await Promise.resolve();
    expect(body()).not.toContain('error');

    finish();
    await pending;
    expect(body()).toBe('data: {"delta":"Yes"}\n\ndata: [DONE]\n\n');
  });

  it('stops the ceiling firing once a normal answer is done', async () => {
    const { res, body } = response();
    const ask = controller((_dto, onDelta) => {
      onDelta('Yes');
      return Promise.resolve();
    });

    await ask.question(dto, res);
    const settled = body();

    jest.advanceTimersByTime(120_000);
    expect(body()).toBe(settled);
  });
});
