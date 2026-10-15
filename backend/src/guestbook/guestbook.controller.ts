import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard } from '../common/admin.guard';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { GuestbookService, publicEntry } from './guestbook.service';
import { SignGuestbookDto } from './guestbook.dto';
import {
  EntryStatus,
  GuestbookEntry,
  GuestbookList,
  HeldEntry,
} from './guestbook.types';

@Controller('guestbook')
@UseGuards(RateLimitGuard)
export class GuestbookController {
  constructor(private readonly guestbook: GuestbookService) {}

  @Get()
  async list(): Promise<GuestbookList> {
    if (!this.guestbook.enabled) return { enabled: false };
    return { enabled: true, entries: await this.guestbook.list() };
  }

  /**
   * With moderation off, `201` and the entry, as it always was. With it on, `202` and
   * `{ id, status: 'pending' }`: the entry waits for the model. The frontend reads both,
   * since the two apps deploy in no fixed order.
   */
  @Post()
  @HttpCode(201)
  @RateLimit({ limit: 1, windowMs: 60_000 })
  async sign(
    @Body() dto: SignGuestbookDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GuestbookEntry | { id: string; status: 'pending' }> {
    if (!this.guestbook.enabled) {
      throw new ForbiddenException('The guestbook is closed');
    }
    const entry = await this.guestbook.sign(dto);
    if (entry.status === 'pending') {
      res.status(202);
      return { id: entry.id, status: 'pending' };
    }
    return publicEntry(entry);
  }

  /**
   * The owner's list of what isn't up: pending and held, with reason and age. Declared
   * before `:id/status`, though the two can't meet: one segment against two.
   */
  @Get('held')
  @UseGuards(AdminGuard)
  held(): Promise<HeldEntry[]> {
    return this.guestbook.held();
  }

  /**
   * The signer's poll: only `{ status }`. The id is a random UUID the signer already
   * holds; the limit keeps it from being a way to probe for others'.
   */
  @Get(':id/status')
  @RateLimit({ limit: 30, windowMs: 60_000 })
  async status(@Param('id') id: string): Promise<{ status: EntryStatus }> {
    const status = await this.guestbook.status(id);
    if (!status) throw new NotFoundException();
    return { status };
  }

  @Post(':id/approve')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  async approve(@Param('id') id: string): Promise<void> {
    if (!(await this.guestbook.approve(id))) throw new NotFoundException();
  }

  /**
   * Moderation, on any entry, held ones included. Behind `AdminGuard` now: the inline
   * check this replaced compared the password with `!==`, which isn't constant-time.
   */
  @Delete(':id')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  async remove(@Param('id') id: string): Promise<void> {
    if (!(await this.guestbook.remove(id))) throw new NotFoundException();
  }

  @Delete(':id/reply')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  async clearReply(@Param('id') id: string): Promise<void> {
    if (!(await this.guestbook.clearReply(id))) throw new NotFoundException();
  }
}
