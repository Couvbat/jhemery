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
    const begin = () => {
      if (!res.headersSent) res.writeHead(200, SSE_HEADERS);
    };

    try {
      await this.ask.answer(
        dto,
        (delta) => {
          begin();
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        },
        abortOnDisconnect(res),
      );
    } catch (err) {
      // Nothing has been written yet, so the exception filter can still send a
      // real status code and the client can degrade before it renders anything.
      if (!res.headersSent) throw err;
      // Mid-stream: the status is long gone. End without `[DONE]` so the client
      // keeps what arrived and stops waiting for the rest.
      this.logger.warn('ask failed mid-stream — closing the response');
      res.end();
      return;
    }

    begin();
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

/** Fires when the visitor closes the tab, so a dead client frees the slot. */
function abortOnDisconnect(res: Response): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  return controller.signal;
}
