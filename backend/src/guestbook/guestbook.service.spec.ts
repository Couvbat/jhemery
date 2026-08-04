import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GuestbookService } from './guestbook.service';
import { GuestbookEntry } from './guestbook.types';

/**
 * A publicly writable text field on a personal site is a spam magnet, and the
 * sanitiser is the only thing between it and the rendered page. These cover the
 * file-storage path — MONGODB_URI is left unset, so `getModel()` returns null and
 * the service falls back to JSON under DATA_DIR, which is what a default deploy
 * actually runs.
 */
describe('GuestbookService', () => {
  let dataDir: string;
  let service: GuestbookService;

  function build(env: Record<string, string> = {}): GuestbookService {
    const config = {
      get: (key: string) => ({ DATA_DIR: dataDir, ...env })[key],
    } as unknown as ConfigService;
    return new GuestbookService(config);
  }

  async function storedEntries(): Promise<GuestbookEntry[]> {
    return JSON.parse(
      await readFile(join(dataDir, 'guestbook.json'), 'utf8'),
    ) as GuestbookEntry[];
  }

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'guestbook-test-'));
    service = build();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    await rm(dataDir, { recursive: true, force: true });
  });

  describe('enabled', () => {
    it('is off unless GUESTBOOK_ENABLED is exactly "true"', () => {
      expect(build().enabled).toBe(false);
      expect(build({ GUESTBOOK_ENABLED: 'false' }).enabled).toBe(false);
      expect(build({ GUESTBOOK_ENABLED: '1' }).enabled).toBe(false);
      expect(build({ GUESTBOOK_ENABLED: 'TRUE' }).enabled).toBe(false);
      expect(build({ GUESTBOOK_ENABLED: 'true' }).enabled).toBe(true);
    });
  });

  describe('sign', () => {
    it('stores a valid entry', async () => {
      const entry = await service.sign({ name: 'Ada', message: 'Nice site' });

      expect(entry.name).toBe('Ada');
      expect(entry.message).toBe('Nice site');
      expect(entry.id).toHaveLength(36);
      expect(() => new Date(entry.date).toISOString()).not.toThrow();
      await expect(storedEntries()).resolves.toHaveLength(1);
    });

    it('strips angle brackets so stored text cannot carry markup', async () => {
      const entry = await service.sign({
        name: '<b>Ada</b>',
        message: '<script>alert(1)</script>ok',
      });

      expect(entry.name).toBe('bAda/b');
      expect(entry.message).not.toContain('<');
      expect(entry.message).not.toContain('>');
    });

    it('replaces control characters', async () => {
      const entry = await service.sign({
        name: 'Ada',
        message: 'line\u0000one\u001bline\u007ftwo',
      });

      expect(entry.message).toBe('line one line two');
      // eslint-disable-next-line no-control-regex
      expect(entry.message).not.toMatch(/[\u0000-\u001f\u007f]/);
    });

    it('collapses whitespace so nobody can shout with newlines', async () => {
      const entry = await service.sign({
        name: '  Ada  ',
        message: 'hello\n\n\n\n\n     world',
      });

      expect(entry.name).toBe('Ada');
      expect(entry.message).toBe('hello world');
    });

    it('truncates to the documented limits', async () => {
      const entry = await service.sign({
        name: 'a'.repeat(100),
        message: 'b'.repeat(500),
      });

      expect(entry.name).toHaveLength(40);
      expect(entry.message).toHaveLength(280);
    });

    it('rejects input that sanitises down to nothing', async () => {
      await expect(
        service.sign({ name: '<<<>>>', message: 'hi' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.sign({ name: 'Ada', message: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    describe('link spam', () => {
      it.each([
        'check https://spam.example',
        'visit http://spam.example',
        'go to www.spam.example',
        'buy at cheap-pills.com',
        'see thing.ru now',
        'deals at store.xyz',
        'HTTPS://SHOUTY.EXAMPLE',
      ])('rejects %p', async (message) => {
        await expect(
          service.sign({ name: 'Ada', message }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('rejects links hidden in the name field too', async () => {
        await expect(
          service.sign({ name: 'spam.com', message: 'hello' }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('allows ordinary prose that merely contains a dot', async () => {
        await expect(
          service.sign({ name: 'Ada', message: 'Great work. Really nice.' }),
        ).resolves.toBeDefined();
      });

      it('stores nothing when a message is rejected', async () => {
        await service.sign({ name: 'Ada', message: 'hello' });
        await expect(
          service.sign({ name: 'Spam', message: 'buy at spam.com' }),
        ).rejects.toBeInstanceOf(BadRequestException);

        await expect(storedEntries()).resolves.toHaveLength(1);
      });
    });

    it('serialises concurrent writes instead of clobbering them', async () => {
      await Promise.all(
        Array.from({ length: 25 }, (_, i) =>
          service.sign({ name: `User${i}`, message: `Message ${i}` }),
        ),
      );

      await expect(storedEntries()).resolves.toHaveLength(25);
    });
  });

  describe('list', () => {
    it('is empty before anyone signs', async () => {
      await expect(service.list()).resolves.toEqual([]);
    });

    it('returns newest first', async () => {
      await service.sign({ name: 'First', message: 'one' });
      await service.sign({ name: 'Second', message: 'two' });

      const entries = await service.list();
      expect(entries.map((e) => e.name)).toEqual(['Second', 'First']);
    });

    it('returns at most one page', async () => {
      for (let i = 0; i < 30; i++) {
        await service.sign({ name: `User${i}`, message: `Message ${i}` });
      }

      await expect(service.list()).resolves.toHaveLength(25);
    });

    it('reads entries written by an earlier process', async () => {
      await service.sign({ name: 'Ada', message: 'hello' });
      await service.onModuleDestroy();

      const reopened = build();
      await expect(reopened.list()).resolves.toHaveLength(1);
      await reopened.onModuleDestroy();
    });
  });

  describe('remove', () => {
    it('deletes a known entry', async () => {
      const entry = await service.sign({ name: 'Ada', message: 'hello' });

      await expect(service.remove(entry.id)).resolves.toBe(true);
      await expect(service.list()).resolves.toEqual([]);
    });

    it('reports an unknown id rather than silently succeeding', async () => {
      await expect(service.remove('no-such-id')).resolves.toBe(false);
    });

    it('leaves the other entries alone', async () => {
      const first = await service.sign({ name: 'First', message: 'one' });
      await service.sign({ name: 'Second', message: 'two' });

      await service.remove(first.id);

      const entries = await service.list();
      expect(entries.map((e) => e.name)).toEqual(['Second']);
    });
  });
});
