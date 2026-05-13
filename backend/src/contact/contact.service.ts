import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { ContactDto } from './contact.dto';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(private config: ConfigService) {}

  async send(dto: ContactDto): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST');
    const port = this.config.get<number>('SMTP_PORT', 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const to   = this.config.get<string>('CONTACT_TO', user ?? '');

    if (!host || !user || !pass) {
      this.logger.warn('SMTP not configured — logging message instead');
      this.logger.log(`Contact from ${dto.name} <${dto.email}>: ${dto.message}`);
      return;
    }

    const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });

    try {
      await transporter.sendMail({
        from: `"Portfolio Contact" <${user}>`,
        to,
        replyTo: dto.email,
        subject: dto.subject
          ? `[Portfolio] ${dto.subject}`
          : `[Portfolio] New message from ${dto.name}`,
        text: `Name: ${dto.name}\nEmail: ${dto.email}\n\n${dto.message}`,
      });
    } catch (err) {
      this.logger.error('Failed to send email', err);
      throw new InternalServerErrorException('Could not send message');
    }
  }
}
