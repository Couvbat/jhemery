import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AskCorpusService } from '../ask/ask.corpus';
import type { LlmService } from '../common/llm';
import {
  GuestbookService,
  isPublished,
  MAX_WAITING,
  publicEntry,
} from './guestbook.service';
import type { StoredEntry } from './guestbook.types';
import { cleanReply, parseVerdict, REPLY_MAX } from './moderation';

/**
 * The lifecycle against a fake slot (`docs/superpowers/specs/2026-10-15-guestbook-moderation-design.md`):
 * the model can only make the guestbook stricter, never less available. Only an explicit
 * `hold` keeps an entry back; a garbled answer or a model that never answers leaves it to
 * the grace period, which publishes it anyway.
 */
describe('guestbook moderation', () => {
  let dataDir: string;
  let complete: jest.Mock;
  let acquired: number;
  let services: GuestbookService[];

  const llm = (configured = true) =>
    ({
      configured,
      acquire: () => {
        acquired += 1;
        return Promise.resolve(() => undefined);
      },
      complete,
    }) as unknown as LlmService;

  const corpus = {
    passagesFor: () => [
      {
        passage: {
          id: 'p',
          kind: 'why',
          title: 'Snake',
          text: 'x',
          target: 'why games',
        },
        score: 3,
        title: 'Games',
        text: 'Tetris and snake are in the terminal.',
      },
    ],
  } as unknown as AskCorpusService;

  function build(
    env: Record<string, string> = {},
    model: LlmService | undefined = llm(),
  ): GuestbookService {
    const values: Record<string, string> = {
      DATA_DIR: dataDir,
      GUESTBOOK_ENABLED: 'true',
      GUESTBOOK_MODERATION: 'model',
      ...env,
    };
    const service = new GuestbookService(
      { get: (key: string) => values[key] } as unknown as ConfigService,
      model,
      corpus,
    );
    services.push(service);
    return service;
  }

  const stored = async () =>
    JSON.parse(
      await readFile(join(dataDir, 'guestbook.json'), 'utf8'),
    ) as StoredEntry[];
  const answers = (...texts: Array<string | Error>) => {
    for (const text of texts) {
      if (text instanceof Error) complete.mockRejectedValueOnce(text);
      else complete.mockResolvedValueOnce(text);
    }
  };
  const PUBLISH = '{"verdict":"publish","reason":"none"}';
  const MINUTE = 60_000;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'guestbook-moderation-'));
    complete = jest.fn();
    acquired = 0;
    services = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    for (const service of services) await service.onModuleDestroy();
    jest.restoreAllMocks();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('keeps a new entry pending and out of every public list until the model has read it', async () => {
    const service = build();
    const entry = await service.sign({
      name: 'Ada',
      message: 'Lovely site',
      locale: 'fr',
    });

    expect(entry).toMatchObject({ status: 'pending', locale: 'fr' });
    expect(entry.signedAt).toBe(entry.date);
    await expect(service.list()).resolves.toEqual([]);
    await expect(service.status(entry.id)).resolves.toBe('pending');

    answers(PUBLISH);
    await service.tick();

    expect(acquired).toBe(1);
    const [verdictCall] = complete.mock.calls[0] as [Record<string, unknown>];
    expect(verdictCall).toMatchObject({
      temperature: 0,
      max_tokens: 60,
      response_format: { type: 'json_object' },
    });
    await expect(service.status(entry.id)).resolves.toBe('published');
    expect((await stored())[0]).toMatchObject({ moderatedBy: 'model' });
    await expect(service.list()).resolves.toEqual([
      { id: entry.id, name: 'Ada', message: 'Lovely site', date: entry.date },
    ]);
  });

  it('holds what the model holds, for the owner, who can approve it', async () => {
    const service = build();
    const entry = await service.sign({ name: 'Bob', message: 'buy pills now' });
    answers('{"verdict":"hold","reason":"spam"}');
    await service.tick();

    await expect(service.status(entry.id)).resolves.toBe('held');
    await expect(service.list()).resolves.toEqual([]);
    const held = await service.held(Date.parse(entry.date) + 5 * MINUTE);
    expect(held).toEqual([
      {
        id: entry.id,
        name: 'Bob',
        message: 'buy pills now',
        status: 'held',
        reason: 'spam',
        ageMs: 5 * MINUTE,
      },
    ]);
    // Nothing is ever deleted automatically, however long it waits.
    await service.tick(Date.parse(entry.date) + 24 * 60 * MINUTE);
    await expect(service.status(entry.id)).resolves.toBe('held');

    await expect(service.approve(entry.id)).resolves.toBe(true);
    const after = (await stored())[0];
    expect(after).toMatchObject({ status: 'published', moderatedBy: 'owner' });
    expect(after.reason).toBeUndefined();
    await expect(service.approve(entry.id)).resolves.toBe(false);
  });

  it('retries a garbled answer once, then leaves the entry to the grace period', async () => {
    const service = build({ GUESTBOOK_GRACE_MINUTES: '30' });
    const entry = await service.sign({ name: 'Cy', message: 'hello there' });
    const signed = Date.parse(entry.date);
    answers('sure! it looks fine', '{"verdict":"maybe","reason":"none"}');

    await service.tick(signed + MINUTE);
    expect(complete).toHaveBeenCalledTimes(2);
    await expect(service.status(entry.id)).resolves.toBe('pending');

    // No third call: a garbled answer is the model failing, not a verdict.
    await service.tick(signed + 10 * MINUTE);
    expect(complete).toHaveBeenCalledTimes(2);

    await service.tick(signed + 31 * MINUTE);
    await expect(service.status(entry.id)).resolves.toBe('published');
    expect((await stored())[0]).toMatchObject({ moderatedBy: 'grace' });
  });

  it('backs off a model that doesn’t answer, and the grace period still publishes', async () => {
    const service = build();
    const entry = await service.sign({ name: 'Di', message: 'hello there' });
    const signed = Date.parse(entry.date);
    answers(new Error('fetch failed'));

    await service.tick(signed + MINUTE);
    await service.tick(signed + 2 * MINUTE);
    expect(complete).toHaveBeenCalledTimes(1);

    await service.tick(signed + 31 * MINUTE);
    await expect(service.status(entry.id)).resolves.toBe('published');
  });

  it('publishes on grace alone when no model is configured', async () => {
    const service = build({}, llm(false));
    const entry = await service.sign({ name: 'Ed', message: 'hello there' });
    await service.tick(Date.parse(entry.date) + 31 * MINUTE);
    expect(complete).not.toHaveBeenCalled();
    expect((await stored())[0]).toMatchObject({
      status: 'published',
      moderatedBy: 'grace',
    });
  });

  it('answers 503 past fifty waiting, so a burst can’t queue work for a GPU at home', async () => {
    const waiting: StoredEntry[] = Array.from(
      { length: MAX_WAITING },
      (_, i) => ({
        id: `w${i}`,
        name: 'n',
        message: 'm',
        date: new Date().toISOString(),
        signedAt: new Date().toISOString(),
        status: i % 2 ? 'held' : 'pending',
      }),
    );
    await writeFile(join(dataDir, 'guestbook.json'), JSON.stringify(waiting));
    await expect(
      build().sign({ name: 'Fi', message: 'one more' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('reads an entry from before moderation as published, from the file and from a Mongo document', async () => {
    const legacy = {
      id: 'old',
      name: 'Gil',
      message: 'Hi',
      date: '2026-01-01T00:00:00.000Z',
    };
    await writeFile(join(dataDir, 'guestbook.json'), JSON.stringify([legacy]));
    const service = build();
    await expect(service.list()).resolves.toEqual([legacy]);
    await expect(service.status('old')).resolves.toBe('published');
    // The Mongo path filters on the same rule: no `status` reads as published.
    expect(isPublished({ ...legacy })).toBe(true);
    expect(
      publicEntry({ ...legacy, _id: 'x' } as unknown as StoredEntry),
    ).toEqual(legacy);
  });

  it('logs the verdict and its latency, never the name or the message', async () => {
    const logged = jest.spyOn(Logger.prototype, 'log');
    const service = build();
    await service.sign({ name: 'Secret Name', message: 'a private message' });
    answers('{"verdict":"hold","reason":"personal-data"}');
    await service.tick();

    const lines = logged.mock.calls.map((call) => String(call[0])).join('\n');
    expect(lines).toMatch(/verdict hold \(personal-data\) in \d+ms/);
    expect(lines).not.toMatch(/Secret Name|a private message/);
  });

  it('counts the waiting entries for /health once the worker has looked', async () => {
    const service = build();
    expect(service.health().detail).toBeUndefined();
    await service.sign({ name: 'Ha', message: 'hello there' });
    await service.sign({ name: 'Io', message: 'spam spam' });
    answers(PUBLISH, '{"verdict":"hold","reason":"spam"}');
    await service.tick();
    expect(service.health()).toEqual({
      unit: 'guestbook',
      state: 'active',
      detail: { pending: 0, held: 1 },
    });
  });

  describe('replies', () => {
    it('replies under an entry the model published, grounded, sanitised, with the page it drew from', async () => {
      const service = build({ GUESTBOOK_REPLIES: 'true' });
      const entry = await service.sign({
        name: 'Jo',
        message: 'love the snake game',
        locale: 'en',
      });
      answers(PUBLISH, '"Thanks <b>Jo</b>! Tetris is in there too."');
      await service.tick();

      const [list] = await service.list();
      expect(list.reply).toEqual({
        text: 'Thanks bJo/b! Tetris is in there too.',
        by: 'model',
        see: 'why games',
      });
      const [replyCall] = complete.mock.calls[1] as [
        { messages: Array<{ content: string }> },
      ];
      expect(replyCall.messages[0].content).toContain(
        'Tetris and snake are in the terminal.',
      );
      void entry;
    });

    it('keeps no reply that carries a link, and none under a grace or owner publish', async () => {
      const service = build({ GUESTBOOK_REPLIES: 'true' });
      const linked = await service.sign({ name: 'Ka', message: 'nice one' });
      answers(PUBLISH, 'See www.example.com for more');
      await service.tick();
      expect((await service.list())[0].reply).toBeUndefined();
      void linked;

      const graced = await service.sign({ name: 'Lu', message: 'hi again' });
      complete.mockReset();
      complete.mockRejectedValue(new Error('down'));
      await service.tick(Date.parse(graced.date) + 31 * MINUTE);
      expect(
        (await stored()).find((e) => e.id === graced.id)?.reply,
      ).toBeUndefined();
    });

    it('clears a reply for the owner and leaves the entry', async () => {
      const service = build({ GUESTBOOK_REPLIES: 'true' });
      const entry = await service.sign({ name: 'Mo', message: 'hello there' });
      answers(PUBLISH, 'Thanks for stopping by.');
      await service.tick();
      await expect(service.clearReply(entry.id)).resolves.toBe(true);
      expect((await service.list())[0]).toEqual({
        id: entry.id,
        name: 'Mo',
        message: 'hello there',
        date: entry.date,
      });
      await expect(service.clearReply(entry.id)).resolves.toBe(false);
    });
  });

  it('changes nothing with moderation off: published at once, no status stored, no worker', async () => {
    const service = build({ GUESTBOOK_MODERATION: 'off' });
    const entry = await service.sign({
      name: 'Ny',
      message: 'hello there',
      locale: 'fr',
    });
    expect(entry).toEqual({
      id: entry.id,
      name: 'Ny',
      message: 'hello there',
      date: entry.date,
    });
    await service.tick();
    expect(complete).not.toHaveBeenCalled();
    expect(await stored()).toEqual([entry]);
  });
});

describe('reading the model', () => {
  it('takes exactly a verdict and a reason, and nothing else', () => {
    expect(parseVerdict('{"verdict":"publish","reason":"none"}')).toEqual({
      verdict: 'publish',
      reason: 'none',
    });
    expect(
      parseVerdict('```json\n{"reason":"hate","verdict":"hold"}\n```'),
    ).toEqual({
      verdict: 'hold',
      reason: 'hate',
    });
    for (const garbled of [
      'publish',
      '{"verdict":"publish"}',
      '{"verdict":"hold","reason":"none"}',
      '{"verdict":"hold","reason":"rude"}',
      '{"verdict":"publish","reason":"none","note":"fine"}',
      'Sure! {"verdict":"publish","reason":"none"}',
      '[]',
    ]) {
      expect(parseVerdict(garbled)).toBeNull();
    }
  });

  it('keeps a reply to one line under its limit, cut at a word', () => {
    expect(cleanReply('  "Thanks!"  ')).toBe('Thanks!');
    expect(cleanReply('')).toBeNull();
    const long = cleanReply('word '.repeat(60))!;
    expect(long.length).toBeLessThanOrEqual(REPLY_MAX);
    expect(long.endsWith('word…')).toBe(true);
  });
});
