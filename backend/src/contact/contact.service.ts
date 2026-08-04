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
    // Env vars arrive as strings, so this has to be coerced before it is compared
    // to 465 below — otherwise implicit-TLS setups silently connect in the clear.
    const port = Number(this.config.get<string>('SMTP_PORT')) || 587;
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    // An empty CONTACT_TO is present-but-useless, and `get`'s default only covers
    // a missing key, so fall back here instead.
    const to = this.config.get<string>('CONTACT_TO') || user;

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
      // The client only ever sees a generic 500, so this line is the sole record of
      // why a send failed. Nodemailer hangs its diagnosis off non-standard fields
      // (`code`, `responseCode`, `response`), which a bare Error log would drop.
      const { code, responseCode, response } = err as {
        code?: string;
        responseCode?: number;
        response?: string;
      };
      this.logger.error(
        `Failed to send email via ${host}:${port} (secure=${port === 465}) — ` +
          [
            err instanceof Error ? err.message : String(err),
            code && `code=${code}`,
            responseCode && `responseCode=${responseCode}`,
            response && `response=${response}`,
          ]
            .filter(Boolean)
            .join(' '),
        err instanceof Error ? err.stack : undefined,
      );
      throw new InternalServerErrorException('Could not send message');
    }
  }
}
