import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { McpService } from './mcp.service';
import { JsonRpcResponse, RPC } from './mcp.types';

/**
 * Streamable HTTP, stateless: every request is a POST answered with JSON. A GET would
 * ask for a server-sent stream this server never offers, so it gets the 405 the
 * transport spec prescribes, as does a DELETE of a session that never existed.
 *
 * The body is taken as `unknown` on purpose: JSON-RPC is validated by `McpService`,
 * message by message, and the global whitelisting pipe must not strip its fields.
 */
@Controller('mcp')
@UseGuards(RateLimitGuard)
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @Post()
  @HttpCode(200)
  @RateLimit({ limit: 60, windowMs: 60 * 1000 })
  async post(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<JsonRpcResponse | JsonRpcResponse[] | undefined> {
    this.assertEnabled();

    if (Array.isArray(body)) {
      if (!body.length) {
        return {
          jsonrpc: '2.0',
          id: null,
          error: { code: RPC.invalidRequest, message: 'Empty batch' },
        };
      }
      const replies = (
        await Promise.all(body.map((m) => this.mcp.handle(m)))
      ).filter((r): r is JsonRpcResponse => r !== null);
      if (replies.length) return replies;
      res.status(202);
      return undefined;
    }

    const reply = await this.mcp.handle(body);
    if (reply) return reply;
    // Notifications are acknowledged, never answered.
    res.status(202);
    return undefined;
  }

  @Get()
  @HttpCode(405)
  stream(@Res({ passthrough: true }) res: Response): { message: string } {
    this.assertEnabled();
    res.setHeader('Allow', 'POST');
    return {
      message:
        'This MCP server is stateless and offers no event stream; POST JSON-RPC here.',
    };
  }

  @Delete()
  @HttpCode(405)
  endSession(@Res({ passthrough: true }) res: Response): { message: string } {
    this.assertEnabled();
    res.setHeader('Allow', 'POST');
    return { message: 'There are no sessions to end.' };
  }

  private assertEnabled(): void {
    // Off, it is not there — the same answer an unknown route gets.
    if (!this.mcp.enabled)
      throw new NotFoundException('MCP is not enabled on this server');
  }
}
