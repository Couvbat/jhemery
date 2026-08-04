import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { StatsReport } from './stats.types';

/**
 * A vanity counter is not worth a disk write per visitor, so increments
 * accumulate in memory and land at most this often.
 */
const FLUSH_INTERVAL_MS = 30_000;

@Injectable()
export class StatsService implements OnModuleDestroy {
  private readonly logger = new Logger(StatsService.name);
  private sessions: number | null = null;
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private config: ConfigService) {}

  /** Alongside guestbook.json under DATA_DIR, which the deploy excludes — so the
   *  total survives a deploy rather than resetting to zero every release. */
  private get filePath(): string {
    const dir = this.config.get<string>('DATA_DIR') ?? 'uploads';
    return join(isAbsolute(dir) ? dir : join(process.cwd(), dir), 'stats.json');
  }

  async read(): Promise<StatsReport> {
    return { sessions: await this.load() };
  }

  /**
   * Fire-and-forget from the caller's point of view: the response is the new
   * total, and the disk write happens on the next flush.
   */
  async recordSession(): Promise<StatsReport> {
    const sessions = (await this.load()) + 1;
    this.sessions = sessions;
    this.dirty = true;
    this.scheduleFlush();
    return { sessions };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    await this.flush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, FLUSH_INTERVAL_MS);
    // A pending write must not hold the process open at shutdown.
    this.flushTimer.unref?.();
  }

  private async load(): Promise<number> {
    if (this.sessions !== null) return this.sessions;

    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      const value = (parsed as StatsReport | null)?.sessions;
      this.sessions = typeof value === 'number' && value >= 0 ? value : 0;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(
          `Could not read stats: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      this.sessions = 0;
    }
    return this.sessions;
  }

  private async flush(): Promise<void> {
    if (!this.dirty || this.sessions === null) return;
    this.dirty = false;

    const path = this.filePath;
    try {
      await mkdir(dirname(path), { recursive: true });
      // Write-then-rename, same as the guestbook: a crash mid-write must not
      // truncate the existing total.
      const temp = `${path}.${process.pid}.tmp`;
      await writeFile(
        temp,
        JSON.stringify({ sessions: this.sessions } satisfies StatsReport),
        'utf8',
      );
      await rename(temp, path);
    } catch (err) {
      this.dirty = true;
      this.logger.warn(
        `Could not write stats: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
