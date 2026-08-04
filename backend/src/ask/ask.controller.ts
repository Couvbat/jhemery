import { Body, Controller, Logger, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { AskDto } from './ask.dto';
import { AskService } from './ask.service';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  // Apache fronts this app and buffers proxied responses by default, which
  // would hold the whole answer back until the model finished — the opposite
  // of the point of streaming it.
  'X-Accel-Buffering': 'no',
};

/**
 * Longest this endpoint may stay silent before it answers with *something*.
 *
 * Cloudflare fronts `api.jhemery.xyz` and gives the origin 100 seconds to
 * produce response headers. Past that it discards the request and serves its
 * own 524 — a page that carries no `Access-Control-Allow-Origin`, so a browser
 * reports the timeout as a CORS failure against an endpoint that was never
 * misconfigured. That is what a hung `ask` looked like from the outside:
 *
 * ```
 * Cross-Origin Request Blocked … Reason: CORS header ‘Access-Control-Allow-Origin’
 * missing. Status code: 524.
 * ```
 *
 * `AskService` already bounds itself well inside that — 20s to the first token,
 * then it detaches — so this should never fire. But that bound is emergent: it
 * lives in a constant in another file, and the last hang got in underneath it
 * (an awaited corpus fetch that wedged on a loopback, with nothing in the
 * request path to overrule it). This makes the guarantee structural instead.
 * Whatever goes quiet upstream, the visitor gets a real response, with real
 * CORS headers, from us rather than from a proxy's error page.
 */
const SILENCE_CEILING_MS = 45_000;

@Controller('ask')
@UseGuards(RateLimitGuard)
export class AskController {
  private readonly logger = new Logger(AskController.name);

  constructor(private readonly ask: AskService) {}

  /**
   * Written straight to the response rather than through Nest's `@Sse()`
   * decorator, which is built around `Observable` and `GET`. This is a `POST`
   * with a body, so `EventSource` is out on the client side too.
   */
  @Post()
  // Five questions is a generous visit. The contact form's 3-per-10-minutes
  // window is the wrong shape for something that spends a GPU's time.
  @RateLimit({ limit: 5, windowMs: 60 * 60_000 })
  async question(@Body() dto: AskDto, @Res() res: Response): Promise<void> {
    // Set once the response is finished, by whichever of the three endings gets
    // there first. Writing past it is what would otherwise throw
    // `ERR_STREAM_WRITE_AFTER_END` when a detached answer arrives late.
    let closed = false;

    const begin = () => {
      if (!res.headersSent) res.writeHead(200, SSE_HEADERS);
    };
    const send = (payload: unknown) => {
      if (closed) return;
      begin();
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    const finish = () => {
      if (closed) return;
      closed = true;
      begin();
      res.write('data: [DONE]\n\n');
      res.end();
    };

    // Only ever fires *before* the first token: once `send()` has run the
    // headers are out, the proxy is satisfied, and an answer still streaming at
    // 45 seconds is a slow answer rather than a hang. Ending here trips the
    // `close` handler below, so the model keeps loading in the background on
    // exactly the same terms as the service's own deadline.
    const ceiling = setTimeout(() => {
      if (closed || res.headersSent) return;
      this.logger.warn(
        `ask produced nothing in ${SILENCE_CEILING_MS}ms — answering degraded rather than letting a proxy time the request out`,
      );
      send({ error: 'asleep' });
      finish();
    }, SILENCE_CEILING_MS);

    try {
      await this.ask.answer(
        dto,
        (delta) => send({ delta }),
        abortOnDisconnect(res),
      );
    } catch (err) {
      // Nothing has been written yet, so the exception filter can still send a
      // real status code and the client can degrade before it renders anything.
      if (!res.headersSent) throw err;
      // The ceiling already answered this visitor; the failure is the detached
      // request finishing badly, long after anyone was listening.
      if (closed) return;
      // Mid-stream: the status is long gone. End without `[DONE]` so the client
      // keeps what arrived and stops waiting for the rest.
      this.logger.warn('ask failed mid-stream — closing the response');
      closed = true;
      res.end();
      return;
    } finally {
      clearTimeout(ceiling);
    }

    finish();
  }
}

/** Fires when the visitor closes the tab, so a dead client frees the slot. */
function abortOnDisconnect(res: Response): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  return controller.signal;
}
