import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mongoose, { Connection, Model, Schema } from 'mongoose';
import { AskCorpusService } from '../ask/ask.corpus';
import { UnitHealth } from '../common/health';
import { LlmService } from '../common/llm';
import { SignGuestbookDto } from './guestbook.dto';
import {
  EntryStatus,
  GuestbookEntry,
  HeldEntry,
  ModeratedBy,
  StoredEntry,
} from './guestbook.types';
import {
  cleanReply,
  entryMessage,
  MODERATION_PROMPT,
  parseVerdict,
  REPLY_MAX,
  replyPrompt,
  type ModelVerdict,
} from './moderation';

/** Oldest published entries are evicted past this count. */
const MAX_ENTRIES = 500;
/** How many entries the public list returns, newest first. */
const PAGE_SIZE = 25;
/**
 * Pending and held together. Past this, `sign` answers 503, so a burst can't queue
 * unbounded work for a GPU at home.
 */
export const MAX_WAITING = 50;
/** How long an entry waits for a verdict before it publishes anyway, by default. */
const DEFAULT_GRACE_MINUTES = 30;
/** How often the worker looks for pending entries, beside the kick a new entry gives it. */
const TICK_MS = 30_000;
/** A garbled answer is retried once; after that the entry waits for the grace period. */
const MAX_ATTEMPTS = 2;
/** After the model fails to answer at all, the worker leaves it alone this long. */
const BACKOFF_MS = 5 * 60_000;
/** One verdict's ceiling: a cold load can take half a minute. */
const CALL_TIMEOUT_MS = 90_000;

/** The single highest-signal spam heuristic for a guestbook. */
const URL_PATTERN =
  /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ru|xyz|top|shop)\b)/i;

const PUBLISHED = {
  $or: [{ status: { $exists: false } }, { status: 'published' as const }],
};
const WAITING = { status: { $in: ['pending', 'held'] as EntryStatus[] } };

const guestbookSchema = new Schema<StoredEntry>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    message: { type: String, required: true },
    date: { type: String, required: true },
    // All optional: an entry from before moderation has none of them and reads as published.
    status: { type: String, enum: ['pending', 'held', 'published'] },
    reason: { type: String },
    moderatedBy: { type: String, enum: ['model', 'grace', 'owner'] },
    signedAt: { type: String },
    locale: { type: String, enum: ['en', 'fr'] },
    reply: {
      type: new Schema(
        { text: String, by: String, see: String },
        { _id: false },
      ),
      required: false,
    },
  },
  { versionKey: false, collection: 'guestbook_entries' },
);

export const isPublished = (entry: StoredEntry): boolean =>
  !entry.status || entry.status === 'published';

/** What the public sees of an entry: never its status, reason or language. */
export function publicEntry(entry: StoredEntry): GuestbookEntry {
  return {
    id: entry.id,
    name: entry.name,
    message: entry.message,
    date: entry.date,
    ...(entry.reply ? { reply: entry.reply } : {}),
  };
}

/** Every waiting entry, and the newest `MAX_ENTRIES` published ones, in order. */
function trimmed(entries: StoredEntry[]): StoredEntry[] {
  const published = entries.filter(isPublished).length;
  let drop = Math.max(0, published - MAX_ENTRIES);
  return entries.filter((entry) => {
    if (drop > 0 && isPublished(entry)) {
      drop -= 1;
      return false;
    }
    return true;
  });
}

@Injectable()
export class GuestbookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GuestbookService.name);
  /** Serialises writes so two concurrent signings cannot clobber each other. */
  private writeQueue: Promise<unknown> = Promise.resolve();
  private cache: StoredEntry[] | null = null;
  private mongoConnection: Connection | null = null;
  private mongoModelPromise: Promise<Model<StoredEntry> | null> | null = null;

  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly stopping = new AbortController();
  private working: Promise<void> | null = null;
  /** Calls per entry this process has made, so a garbled answer is retried once only. */
  private readonly attempts = new Map<string, number>();
  private backoffUntil = 0;
  /** What the worker last counted, for `/health`: it reads only what it holds. */
  private waitingCount: { pending: number; held: number } | null = null;

  /**
   * The model and its slot are `ask`'s (`common/llm.ts`); the passages a reply is
   * grounded in are `ask`'s too. Optional, so a service built without them is today's
   * guestbook, and the moderator only ever reads entries when both the flag and a model
   * are there.
   */
  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly llm?: LlmService,
    @Optional() private readonly corpus?: AskCorpusService,
  ) {}

  onModuleInit(): void {
    if (!this.enabled || !this.moderated) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
    void this.tick();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.stopping.abort();
    await this.mongoConnection?.close();
  }

  get enabled(): boolean {
    return this.config.get<string>('GUESTBOOK_ENABLED') === 'true';
  }

  /** `GUESTBOOK_MODERATION=model`; off is the guestbook as it was, byte for byte. */
  get moderated(): boolean {
    return this.config.get<string>('GUESTBOOK_MODERATION') === 'model';
  }

  private get graceMs(): number {
    const minutes = Number(this.config.get<string>('GUESTBOOK_GRACE_MINUTES'));
    return (
      (Number.isFinite(minutes) && minutes > 0
        ? minutes
        : DEFAULT_GRACE_MINUTES) * 60_000
    );
  }

  private get replies(): boolean {
    return this.config.get<string>('GUESTBOOK_REPLIES') === 'true';
  }

  /**
   * Stored under DATA_DIR (default `uploads`), which the deploy excludes — so
   * entries survive deploys. Falls back to this when MONGODB_URI is unset.
   */
  private get filePath(): string {
    const dir = this.config.get<string>('DATA_DIR') ?? 'uploads';
    return join(
      isAbsolute(dir) ? dir : join(process.cwd(), dir),
      'guestbook.json',
    );
  }

  /** The published entries, newest first: what the ticker and the wireframes read. */
  async list(): Promise<GuestbookEntry[]> {
    const model = await this.getModel();
    if (model) {
      const docs = await model
        .find(PUBLISHED, '-_id')
        .sort({ _id: -1 })
        .limit(PAGE_SIZE)
        .lean();
      return docs.map(publicEntry);
    }

    const entries = await this.load();
    return entries
      .filter(isPublished)
      .reverse()
      .slice(0, PAGE_SIZE)
      .map(publicEntry);
  }

  /**
   * Stores an entry. With moderation off it is published at once, as it always was; on,
   * it waits as `pending` for the model, and the worker is told.
   */
  async sign(dto: SignGuestbookDto): Promise<StoredEntry> {
    const name = sanitise(dto.name, 40);
    const message = sanitise(dto.message, 280);

    if (!name || !message) {
      throw new BadRequestException('Name and message are required');
    }
    if (URL_PATTERN.test(message) || URL_PATTERN.test(name)) {
      throw new BadRequestException('Links are not allowed in the guestbook');
    }

    const date = new Date().toISOString();
    let entry: StoredEntry = { id: randomUUID(), name, message, date };

    if (this.moderated) {
      if ((await this.waiting()).length >= MAX_WAITING) {
        throw new ServiceUnavailableException('The guestbook is catching up');
      }
      entry = {
        ...entry,
        status: 'pending',
        signedAt: date,
        ...(dto.locale ? { locale: dto.locale } : {}),
      };
    }

    const model = await this.getModel();
    if (model) {
      await model.create(entry);
      await this.enforceMongoCap(model);
    } else {
      await this.enqueue(async () => {
        const entries = await this.load();
        await this.persist(trimmed([...entries, entry]));
      });
    }

    if (this.moderated) this.kick();
    return entry;
  }

  /** An entry's status, for the signer's poll: nothing else about it. */
  async status(id: string): Promise<EntryStatus | null> {
    const entry = await this.find(id);
    if (!entry) return null;
    return entry.status ?? 'published';
  }

  /** The owner's list: pending and held entries, oldest first, with reason and age. */
  async held(now = Date.now()): Promise<HeldEntry[]> {
    return (await this.waiting()).map((entry) => ({
      id: entry.id,
      name: entry.name,
      message: entry.message,
      status: entry.status as 'pending' | 'held',
      ...(entry.reason ? { reason: entry.reason } : {}),
      ageMs: Math.max(0, now - Date.parse(entry.signedAt ?? entry.date)),
    }));
  }

  /** The owner's approval: up, whatever the model said. */
  async approve(id: string): Promise<boolean> {
    const entry = await this.find(id);
    if (!entry || isPublished(entry)) return false;
    await this.publish(id, 'owner');
    return true;
  }

  async remove(id: string): Promise<boolean> {
    const model = await this.getModel();
    if (model) {
      const res = await model.deleteOne({ id });
      return res.deletedCount === 1;
    }

    let removed = false;
    await this.enqueue(async () => {
      const entries = await this.load();
      const next = entries.filter((e) => e.id !== id);
      removed = next.length !== entries.length;
      if (removed) await this.persist(next);
    });
    return removed;
  }

  /** The owner taking a model's reply down, and leaving the entry. */
  async clearReply(id: string): Promise<boolean> {
    const entry = await this.find(id);
    if (!entry?.reply) return false;
    await this.update(id, { reply: undefined });
    return true;
  }

  // ---------------------------------------------------------------------------
  // The worker
  // ---------------------------------------------------------------------------

  /** A new entry: look now rather than at the next tick. Only once the worker runs. */
  private kick(): void {
    if (this.timer) void this.tick();
  }

  /**
   * One pass: publish what the grace period has freed, then read pending entries oldest
   * first, one at a time, through the shared slot as a background caller. Never two
   * passes at once.
   */
  tick(now = Date.now()): Promise<void> {
    if (!this.moderated) return Promise.resolve();
    this.working ??= this.pass(now).finally(() => {
      this.working = null;
    });
    return this.working;
  }

  private async pass(now: number): Promise<void> {
    try {
      const waiting = await this.waiting();
      for (const entry of waiting) {
        if (
          entry.status === 'pending' &&
          now - Date.parse(entry.signedAt ?? entry.date) >= this.graceMs
        ) {
          await this.publish(entry.id, 'grace');
          this.logger.log('guestbook: published after the grace period');
        }
      }

      if (!this.llm?.configured || now < this.backoffUntil) return;
      for (const entry of await this.waiting()) {
        if (this.stopping.signal.aborted) return;
        if (entry.status !== 'pending') continue;
        if ((this.attempts.get(entry.id) ?? 0) >= MAX_ATTEMPTS) continue;
        const reached = await this.read(entry);
        if (!reached) {
          this.backoffUntil = now + BACKOFF_MS;
          return;
        }
      }
    } catch (err) {
      this.logger.warn(
        `guestbook: the worker stopped: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      await this.recount();
    }
  }

  /**
   * One entry through the model. Returns false when the model couldn't be reached at
   * all, so the pass stops there. A garbled answer is retried once, then left pending.
   */
  private async read(entry: StoredEntry): Promise<boolean> {
    while ((this.attempts.get(entry.id) ?? 0) < MAX_ATTEMPTS) {
      this.attempts.set(entry.id, (this.attempts.get(entry.id) ?? 0) + 1);
      const started = Date.now();
      let verdict: ModelVerdict | null;
      try {
        verdict = await this.classify(entry);
      } catch (err) {
        this.logger.warn(
          `guestbook: no verdict, the model didn't answer: ${err instanceof Error ? err.message : String(err)}`,
        );
        return false;
      }
      const ms = Date.now() - started;
      if (!verdict) {
        // Verdict and latency only: never the name or the message, since a held
        // entry is not public and a log is not where it should first be read.
        this.logger.warn(`guestbook: unreadable verdict in ${ms}ms`);
        continue;
      }
      this.logger.log(
        `guestbook: verdict ${verdict.verdict} (${verdict.reason}) in ${ms}ms`,
      );
      if (verdict.verdict === 'hold') {
        await this.update(entry.id, { status: 'held', reason: verdict.reason });
      } else {
        await this.publish(entry.id, 'model');
        if (this.replies) await this.reply(entry);
      }
      this.attempts.delete(entry.id);
      return true;
    }
    return true;
  }

  /** Temperature 0, 60 tokens, JSON only: one verdict for one entry. */
  private async classify(entry: StoredEntry): Promise<ModelVerdict | null> {
    const release = await this.llm!.acquire(
      { background: true },
      this.stopping.signal,
    );
    try {
      const text = await this.llm!.complete(
        {
          temperature: 0,
          max_tokens: 60,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: MODERATION_PROMPT },
            { role: 'user', content: entryMessage(entry) },
          ],
        },
        AbortSignal.any([
          this.stopping.signal,
          AbortSignal.timeout(CALL_TIMEOUT_MS),
        ]),
      );
      return parseVerdict(text);
    } finally {
      release();
    }
  }

  /**
   * The optional reply, under an entry the model itself published: one try, grounded in
   * the site's passages, and through the sanitiser and the link filter like any entry,
   * since a model can write a URL. A failure means no reply.
   */
  private async reply(entry: StoredEntry): Promise<void> {
    const locale = entry.locale ?? 'en';
    const passages =
      this.corpus?.passagesFor(entry.message, locale).slice(0, 2) ?? [];
    let release: (() => void) | undefined;
    try {
      release = await this.llm!.acquire(
        { background: true },
        this.stopping.signal,
      );
      const raw = await this.llm!.complete(
        {
          temperature: 0.4,
          max_tokens: 80,
          messages: [
            { role: 'system', content: replyPrompt(locale, passages) },
            { role: 'user', content: entryMessage(entry) },
          ],
        },
        AbortSignal.any([
          this.stopping.signal,
          AbortSignal.timeout(CALL_TIMEOUT_MS),
        ]),
      );
      const cleaned = cleanReply(raw);
      const text = cleaned ? sanitise(cleaned, REPLY_MAX + 1) : '';
      if (!text || URL_PATTERN.test(text)) return;
      const see = passages[0]?.passage.target;
      await this.update(entry.id, {
        reply: { text, by: 'model', ...(see ? { see } : {}) },
      });
    } catch (err) {
      this.logger.warn(
        `guestbook: no reply: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      release?.();
    }
  }

  private async publish(id: string, by: ModeratedBy): Promise<void> {
    // A held entry the owner approves keeps no reason for being held.
    await this.update(id, {
      status: 'published',
      moderatedBy: by,
      reason: undefined,
    });
    const model = await this.getModel();
    if (model) await this.enforceMongoCap(model);
    else
      await this.enqueue(async () => this.persist(trimmed(await this.load())));
  }

  private async recount(): Promise<void> {
    try {
      const waiting = await this.waiting();
      this.waitingCount = {
        pending: waiting.filter((entry) => entry.status === 'pending').length,
        held: waiting.filter((entry) => entry.status === 'held').length,
      };
    } catch {
      // The count is for `/health`; a failed read leaves the last one.
    }
  }

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------

  /** Pending and held entries, oldest first. */
  private async waiting(): Promise<StoredEntry[]> {
    const model = await this.getModel();
    if (model) {
      return model.find(WAITING, '-_id').sort({ _id: 1 }).lean();
    }
    return (await this.load()).filter((entry) => !isPublished(entry));
  }

  private async find(id: string): Promise<StoredEntry | null> {
    const model = await this.getModel();
    if (model) return model.findOne({ id }, '-_id').lean();
    return (await this.load()).find((entry) => entry.id === id) ?? null;
  }

  /** A field set to `undefined` is removed. */
  private async update(id: string, patch: Partial<StoredEntry>): Promise<void> {
    const model = await this.getModel();
    if (model) {
      const set = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      );
      const unset = Object.fromEntries(
        Object.entries(patch)
          .filter(([, value]) => value === undefined)
          .map(([key]) => [key, '']),
      );
      await model.updateOne(
        { id },
        {
          ...(Object.keys(set).length ? { $set: set } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
      );
      return;
    }
    await this.enqueue(async () => {
      const entries = await this.load();
      await this.persist(
        entries.map((entry) => {
          if (entry.id !== id) return entry;
          const next: StoredEntry = { ...entry, ...patch };
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined) delete next[key as keyof StoredEntry];
          }
          return next;
        }),
      );
    });
  }

  /**
   * Lazily connects to MongoDB on first use and memoises the model. Returns
   * null (falling back to the JSON file) when MONGODB_URI isn't set, or when
   * the connection attempt fails — a transient outage on a self-hosted
   * instance shouldn't take the whole guestbook down.
   */
  private getModel(): Promise<Model<StoredEntry> | null> {
    if (!this.mongoModelPromise) {
      this.mongoModelPromise = this.connectMongo();
    }
    return this.mongoModelPromise;
  }

  private async connectMongo(): Promise<Model<StoredEntry> | null> {
    const uri = this.config.get<string>('MONGODB_URI');
    if (!uri) return null;

    try {
      this.mongoConnection = await mongoose.createConnection(uri).asPromise();
      return this.mongoConnection.model<StoredEntry>(
        'GuestbookEntry',
        guestbookSchema,
      );
    } catch (err) {
      this.logger.warn(
        `Could not connect to MongoDB, falling back to file storage: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Reset so the next call retries instead of being stuck on a rejection.
      this.mongoModelPromise = null;
      return null;
    }
  }

  /** The cap of 500 is on published entries: one waiting is never evicted by it. */
  private async enforceMongoCap(model: Model<StoredEntry>): Promise<void> {
    const count = await model.countDocuments(PUBLISHED);
    if (count <= MAX_ENTRIES) return;

    const oldest = await model
      .find(PUBLISHED, '_id')
      .sort({ _id: 1 })
      .limit(count - MAX_ENTRIES)
      .lean();
    await model.deleteMany({ _id: { $in: oldest.map((o) => o._id) } });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const chained = this.writeQueue.then(task, task);
    // Keep the chain alive even if a task rejects.
    this.writeQueue = chained.catch(() => undefined);
    return chained;
  }

  private async load(): Promise<StoredEntry[]> {
    if (this.cache) return this.cache;

    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      this.cache = Array.isArray(parsed) ? (parsed as StoredEntry[]) : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(
          `Could not read guestbook: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      this.cache = [];
    }
    return this.cache;
  }

  private async persist(entries: StoredEntry[]): Promise<void> {
    const path = this.filePath;
    await mkdir(dirname(path), { recursive: true });
    // Write-then-rename so a crash mid-write cannot truncate the existing file.
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(entries, null, 2), 'utf8');
    await rename(temp, path);
    this.cache = entries;
  }

  /**
   * Open or closed. The entry count is left out: reading it could mean a disk read. With
   * moderation on, the waiting counts the worker last took, once it has taken one.
   */
  health(): UnitHealth {
    if (!this.enabled) {
      return { unit: 'guestbook', state: 'inactive', reason: 'disabled' };
    }
    return {
      unit: 'guestbook',
      state: 'active',
      ...(this.moderated && this.waitingCount
        ? { detail: { ...this.waitingCount } }
        : {}),
    };
  }
}

/** Strips control characters and angle brackets, and collapses whitespace. */
export function sanitise(value: string, maxLength: number): string {
  return (
    value
      // Matching control characters is the whole point here, so the rule is moot.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/[<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength)
  );
}
