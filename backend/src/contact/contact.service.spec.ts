import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { ContactService } from './contact.service';
import { ContactDto } from './contact.dto';

jest.mock('nodemailer');

/**
 * Everything here comes out of the environment as a string, which is exactly where
 * the transport options went wrong before: `SMTP_PORT` was compared to the number
 * 465, so implicit-TLS accounts connected in the clear and the send timed out.
 */
describe('ContactService', () => {
  const sendMail = jest.fn();
  const createTransport = nodemailer.createTransport as jest.Mock;

  const dto: ContactDto = {
    name: 'Ada',
    email: 'ada@example.com',
    message: 'hello',
  };

  function service(env: Record<string, string>): ContactService {
    const config = {
      get: (key: string, fallback?: unknown) =>
        key in env ? env[key] : fallback,
    } as unknown as ConfigService;
    return new ContactService(config);
  }

  const smtp = {
    SMTP_HOST: 'smtp.example.com',
    SMTP_USER: 'me@example.com',
    SMTP_PASS: 'secret',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail.mockResolvedValue({ messageId: 'x' });
    createTransport.mockReturnValue({ sendMail });
  });

  it('enables implicit TLS on port 465', async () => {
    await service({ ...smtp, SMTP_PORT: '465' }).send(dto);

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });

  it('leaves TLS off for the STARTTLS submission port', async () => {
    await service({ ...smtp, SMTP_PORT: '587' }).send(dto);

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587, secure: false }),
    );
  });

  it('defaults to 587 when the port is missing or unparsable', async () => {
    await service(smtp).send(dto);
    await service({ ...smtp, SMTP_PORT: '' }).send(dto);

    for (const call of createTransport.mock.calls) {
      expect(call[0]).toMatchObject({ port: 587 });
    }
  });

  it('falls back to the SMTP user when CONTACT_TO is set but empty', async () => {
    await service({ ...smtp, CONTACT_TO: '' }).send(dto);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'me@example.com' }),
    );
  });

  it('prefers CONTACT_TO when it has a value', async () => {
    await service({ ...smtp, CONTACT_TO: 'inbox@example.com' }).send(dto);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'inbox@example.com' }),
    );
  });

  it('replies to the sender rather than the relay account', async () => {
    await service(smtp).send(dto);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: 'ada@example.com' }),
    );
  });

  it('logs instead of sending when SMTP is not configured', async () => {
    await expect(service({}).send(dto)).resolves.toBeUndefined();

    expect(createTransport).not.toHaveBeenCalled();
  });

  it('surfaces a transport failure to the caller', async () => {
    sendMail.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service(smtp).send(dto)).rejects.toThrow(
      'Could not send message',
    );
  });

  it('logs the transport diagnosis, since the caller only sees a generic 500', async () => {
    const failure = Object.assign(new Error('Invalid login'), {
      code: 'EAUTH',
      responseCode: 535,
      response: '535 5.7.8 Authentication credentials invalid',
    });
    sendMail.mockRejectedValue(failure);
    const logged = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    await expect(
      service({ ...smtp, SMTP_PORT: '465' }).send(dto),
    ).rejects.toThrow('Could not send message');

    const line = logged.mock.calls[0][0] as string;
    expect(line).toContain('smtp.example.com:465');
    expect(line).toContain('secure=true');
    expect(line).toContain('Invalid login');
    expect(line).toContain('code=EAUTH');
    expect(line).toContain('responseCode=535');
  });
});
