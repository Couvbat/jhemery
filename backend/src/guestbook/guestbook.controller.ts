import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { GuestbookService } from './guestbook.service';
import { SignGuestbookDto } from './guestbook.dto';
import { GuestbookEntry, GuestbookList } from './guestbook.types';

@Controller('guestbook')
@UseGuards(RateLimitGuard)
export class GuestbookController {
  constructor(
    private readonly guestbook: GuestbookService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async list(): Promise<GuestbookList> {
    if (!this.guestbook.enabled) return { enabled: false };
    return { enabled: true, entries: await this.guestbook.list() };
  }

  @Post()
  @HttpCode(201)
  @RateLimit({ limit: 1, windowMs: 60_000 })
  async sign(@Body() dto: SignGuestbookDto): Promise<GuestbookEntry> {
    if (!this.guestbook.enabled) {
      throw new ForbiddenException('The guestbook is closed');
    }
    return this.guestbook.sign(dto);
  }

  /** Moderation escape hatch. Requires ADMIN_PASSWORD to be set and matched. */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id') id: string,
    @Headers('x-admin-password') password?: string,
  ): Promise<void> {
    const expected = this.config.get<string>('ADMIN_PASSWORD');
    if (!expected || password !== expected) {
      throw new ForbiddenException();
    }
    const removed = await this.guestbook.remove(id);
    if (!removed) throw new NotFoundException();
  }
}
