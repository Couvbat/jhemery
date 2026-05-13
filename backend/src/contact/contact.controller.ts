import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactDto } from './contact.dto';

@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @HttpCode(200)
  async send(@Body() dto: ContactDto): Promise<{ ok: boolean }> {
    await this.contactService.send(dto);
    return { ok: true };
  }
}
