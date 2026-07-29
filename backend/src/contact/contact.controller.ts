import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { ContactService } from './contact.service';
import { ContactDto } from './contact.dto';

@Controller('contact')
@UseGuards(RateLimitGuard)
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @HttpCode(200)
  // The terminal's `mail` command posts here too, so leaving this unlimited next to
  // a limited guestbook would just make it the weaker door.
  @RateLimit({ limit: 3, windowMs: 10 * 60_000 })
  async send(@Body() dto: ContactDto): Promise<{ ok: boolean }> {
    await this.contactService.send(dto);
    return { ok: true };
  }
}
