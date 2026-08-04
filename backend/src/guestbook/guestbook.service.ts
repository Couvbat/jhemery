import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mongoose, { Connection, Model, Schema } from 'mongoose';
import { SignGuestbookDto } from './guestbook.dto';
import { GuestbookEntry } from './guestbook.types';

/** Oldest entries are evicted past this count. */
const MAX_ENTRIES = 500;
/** How many entries the public list returns, newest first. */
const PAGE_SIZE = 25;

/** The single highest-signal spam heuristic for a guestbook. */
const URL_PATTERN =
  /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ru|xyz|top|shop)\b)/i;

type GuestbookEntryDoc = GuestbookEntry;

const guestbookSchema = new Schema<GuestbookEntryDoc>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    message: { type: String, required: true },
    date: { type: String, required: true },
  },
  { versionKey: false, collection: 'guestbook_entries' },
);

@Injectable()
export class GuestbookService implements OnModuleDestroy {
  private readonly logger = new Logger(GuestbookService.name);
  /** Serialises writes so two concurrent signings cannot clobber each other. */
  private writeQueue: Promise<unknown> = Promise.resolve();
  private cache: GuestbookEntry[] | null = null;
  private mongoConnection: Connection | null = null;
  private mongoModelPromise: Promise<Model<GuestbookEntryDoc> | null> | null =
    null;

  constructor(private readonly config: ConfigService) {}

  async onModuleDestroy(): Promise<void> {
    await this.mongoConnection?.close();
  }

  get enabled(): boolean {
    return this.config.get<string>('GUESTBOOK_ENABLED') === 'true';
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

  async list(): Promise<GuestbookEntry[]> {
    const model = await this.getModel();
    if (model) {
      const docs = await model
        .find({}, '-_id')
        .sort({ _id: -1 })
        .limit(PAGE_SIZE)
        .lean();
      return docs;
    }

    const entries = await this.load();
    return [...entries].reverse().slice(0, PAGE_SIZE);
  }

  async sign(dto: SignGuestbookDto): Promise<GuestbookEntry> {
    const name = sanitise(dto.name, 40);
    const message = sanitise(dto.message, 280);

    if (!name || !message) {
      throw new BadRequestException('Name and message are required');
    }
    if (URL_PATTERN.test(message) || URL_PATTERN.test(name)) {
      throw new BadRequestException('Links are not allowed in the guestbook');
    }

    const entry: GuestbookEntry = {
      id: randomUUID(),
      name,
      message,
      date: new Date().toISOString(),
    };

    const model = await this.getModel();
    if (model) {
      await model.create(entry);
      await this.enforceMongoCap(model);
    } else {
      await this.enqueue(async () => {
        const entries = await this.load();
        const next = [...entries, entry].slice(-MAX_ENTRIES);
        await this.persist(next);
      });
    }

    return entry;
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

  /**
   * Lazily connects to MongoDB on first use and memoises the model. Returns
   * null (falling back to the JSON file) when MONGODB_URI isn't set, or when
   * the connection attempt fails — a transient outage on a self-hosted
   * instance shouldn't take the whole guestbook down.
   */
  private getModel(): Promise<Model<GuestbookEntryDoc> | null> {
    if (!this.mongoModelPromise) {
      this.mongoModelPromise = this.connectMongo();
    }
    return this.mongoModelPromise;
  }

  private async connectMongo(): Promise<Model<GuestbookEntryDoc> | null> {
    const uri = this.config.get<string>('MONGODB_URI');
    if (!uri) return null;

    try {
      this.mongoConnection = await mongoose.createConnection(uri).asPromise();
      return this.mongoConnection.model<GuestbookEntryDoc>(
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

  private async enforceMongoCap(
    model: Model<GuestbookEntryDoc>,
  ): Promise<void> {
    const count = await model.countDocuments();
    if (count <= MAX_ENTRIES) return;

    const oldest = await model
      .find({}, '_id')
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

  private async load(): Promise<GuestbookEntry[]> {
    if (this.cache) return this.cache;

    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      this.cache = Array.isArray(parsed) ? (parsed as GuestbookEntry[]) : [];
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

  private async persist(entries: GuestbookEntry[]): Promise<void> {
    const path = this.filePath;
    await mkdir(dirname(path), { recursive: true });
    // Write-then-rename so a crash mid-write cannot truncate the existing file.
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(entries, null, 2), 'utf8');
    await rename(temp, path);
    this.cache = entries;
  }
}

/** Strips control characters and angle brackets, and collapses whitespace. */
function sanitise(value: string, maxLength: number): string {
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
