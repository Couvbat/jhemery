import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { acceptedUrl } from './jobs.urls';
import { DownloadJob, JobStatus } from './jobs.types';
import { UnitHealth } from '../common/health';

/** Queued plus running. One runs at a time — it is a shared host's CPU. */
export const MAX_PENDING = 3;
/** A download that has not finished in ten minutes is not going to. */
export const JOB_TIMEOUT_MS = 10 * 60 * 1000;
/** A produced file that nobody fetched is deleted after this. */
export const FILE_TTL_MS = 30 * 60 * 1000;
/** A failure is kept this long so the page can show why, then forgotten. */
export const FAILURE_TTL_MS = 10 * 60 * 1000;
export const ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;
const STDERR_TAIL = 6;
/** yt-dlp's colour codes, should `--no-colors` ever be ignored. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** `child_process.spawn`'s shape, injected so the tests can stand in a fake child. */
export type Spawner = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcess;
export const SPAWN = Symbol('SPAWN');

interface InternalJob extends DownloadJob {
  dir: string;
  path: string | null;
}

interface Running {
  job: InternalJob;
  child: ChildProcess;
  timer: NodeJS.Timeout;
}

/**
 * yt-dlp as a job, not a request (spec §5): `start` returns at once with an id,
 * the page polls, and the file is streamed exactly once and then deleted. A
 * request that waited for the download would die at Passenger's timeout, and
 * Cloudflare turns a silent origin into a 524 — the same wall `ask` hit.
 *
 * Everything the shell check in deploy.md learned is an argument or an env var
 * below: the venv binary (not the PyInstaller one — `/tmp` is `noexec`), node as
 * the JS runtime (YouTube wants one), the static ffmpeg under `~/bin`, one track
 * per job and a pause between requests (the SoundCloud 403), and `TMPDIR` moved
 * under `DATA_DIR` for anything that unpacks at run time.
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private readonly jobs = new Map<string, InternalJob>();
  private readonly queue: string[] = [];
  private running: Running | null = null;
  private sweeper?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService,
    @Inject(SPAWN) private readonly spawner: Spawner,
  ) {}

  get enabled(): boolean {
    return this.config.get<string>('DOWNLOADER_ENABLED') === 'true';
  }

  /** Where yt-dlp is: the venv from the shell check unless told otherwise. */
  get binary(): string {
    return (
      this.config.get<string>('YTDLP_BIN') ||
      join(homedir(), 'ytdlp/bin/yt-dlp')
    );
  }

  /** On, and able to run: a flag alone would report a downloader that cannot download. */
  get configured(): boolean {
    return this.enabled && existsSync(this.binary);
  }

  private get ffmpegLocation(): string {
    return this.config.get<string>('FFMPEG_LOCATION') || join(homedir(), 'bin');
  }

  /**
   * `process.execPath` is the node this app runs on — under Passenger, exactly the
   * `/opt/alt/alt-nodejs20/...` path the shell check found, without anyone having
   * to copy it into a config.
   */
  private get jsRuntime(): string {
    return this.config.get<string>('JS_RUNTIME') || `node:${process.execPath}`;
  }

  private get maxMegabytes(): number {
    const value = Number(this.config.get<string>('DOWNLOAD_MAX_MB'));
    return Number.isFinite(value) && value > 0 ? value : 200;
  }

  /** `DATA_DIR/jobs`, resolved as the guestbook resolves `DATA_DIR`. */
  get root(): string {
    const dir = this.config.get<string>('DATA_DIR') ?? 'uploads';
    return join(isAbsolute(dir) ? dir : join(process.cwd(), dir), 'jobs');
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    // Whatever a previous process left behind is nobody's download any more.
    void rm(this.root, { recursive: true, force: true }).catch(() => undefined);
    this.sweeper = setInterval(() => void this.sweep(), 60_000);
    this.sweeper.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
    this.running?.child.kill('SIGKILL');
  }

  /** Newest first. */
  list(): DownloadJob[] {
    return [...this.jobs.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(toView);
  }

  get(id: string): DownloadJob | undefined {
    const job = this.jobs.get(id);
    return job && toView(job);
  }

  start(input: string, now = Date.now()): DownloadJob {
    const url = acceptedUrl(input);
    if (!url) {
      throw new BadRequestException(
        'One YouTube video or one SoundCloud track — not a set, not a profile',
      );
    }
    void this.sweep(now);
    // Counted from the jobs themselves, not from the queue plus the runner: a job
    // leaves the queue before its directory exists, and `running` is only set once
    // it does, so the queue is briefly one short of the truth.
    const pending = [...this.jobs.values()].filter(
      (job) => job.status === 'queued' || job.status === 'running',
    ).length;
    if (pending >= MAX_PENDING) {
      throw new HttpException(
        `${MAX_PENDING} downloads are already waiting — try again in a minute`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const id = randomBytes(9).toString('base64url');
    const job: InternalJob = {
      id,
      url,
      status: 'queued',
      progress: null,
      filename: null,
      size: null,
      error: null,
      createdAt: now,
      finishedAt: null,
      dir: join(this.root, id),
      path: null,
    };
    this.jobs.set(id, job);
    this.queue.push(id);
    void this.pump();
    return toView(job);
  }

  /** Removes a job whatever its state: dequeued, killed, or its file deleted. */
  async cancel(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) return false;
    const queued = this.queue.indexOf(id);
    if (queued !== -1) this.queue.splice(queued, 1);
    if (this.running?.job === job) {
      // `finish` runs from the child's close event and sees the status already set.
      job.status = 'failed';
      job.error = 'cancelled';
      this.running.child.kill('SIGKILL');
    }
    await this.discard(job);
    return true;
  }

  /** The file, for the controller to stream. `release()` afterwards deletes it. */
  takeFile(
    id: string,
  ): { path: string; filename: string; size: number } | undefined {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'done' || !job.path || !job.filename) {
      return undefined;
    }
    return { path: job.path, filename: job.filename, size: job.size ?? 0 };
  }

  /** Fetch-once: the file and the job go together. */
  async release(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (job) await this.discard(job);
  }

  /** Files past their TTL and failures past theirs, gone — job and directory both. */
  async sweep(now = Date.now()): Promise<void> {
    for (const job of this.jobs.values()) {
      const age = now - (job.finishedAt ?? now);
      const stale =
        (job.status === 'done' && age > FILE_TTL_MS) ||
        (job.status === 'failed' && age > FAILURE_TTL_MS);
      if (stale) await this.discard(job);
    }
  }

  /** How many jobs this service knows; for the tests. */
  get count(): number {
    return this.jobs.size;
  }

  /** Set while a job is being prepared, before `running` is: one at a time means
   *  one, and preparation is async. */
  private pumping = false;

  private async pump(): Promise<void> {
    if (this.running || this.pumping) return;
    const id = this.queue.shift();
    if (!id) return;
    const job = this.jobs.get(id);
    if (!job) return void this.pump();

    this.pumping = true;
    job.status = 'running';
    try {
      await mkdir(job.dir, { recursive: true });
      await mkdir(join(this.root, 'tmp'), { recursive: true });
    } catch (error) {
      this.pumping = false;
      this.fail(job, `could not create ${job.dir}: ${String(error)}`);
      return void this.pump();
    }

    const stderr: string[] = [];
    const child = this.launch(this.argsFor(job), job.dir);
    const timer = setTimeout(() => {
      job.status = 'failed';
      job.error = 'timed out after ten minutes';
      child.kill('SIGKILL');
    }, JOB_TIMEOUT_MS);
    timer.unref();
    this.running = { job, child, timer };
    this.pumping = false;

    child.stdout?.on('data', (chunk: Buffer) => {
      for (const lineText of chunk.toString().split('\n')) {
        const progress = parseProgress(lineText);
        if (progress !== null) job.progress = progress;
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      for (const lineText of chunk.toString().split('\n')) {
        const clean = lineText.replace(ANSI, '').trim();
        if (!clean) continue;
        stderr.push(clean);
        if (stderr.length > STDERR_TAIL) stderr.shift();
      }
    });
    child.on('error', (error) => {
      stderr.push(`could not start ${this.binary}: ${error.message}`);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      this.running = null;
      void this.finish(job, code, stderr).finally(() => void this.pump());
    });
  }

  /** `cwd` is the job's own directory; the tracking-free URL goes last, after `--`. */
  private launch(args: string[], cwd: string): ChildProcess {
    return this.spawner(this.binary, args, {
      cwd,
      env: {
        ...process.env,
        HOME: homedir(),
        TMPDIR: join(this.root, 'tmp'),
        PATH: `${this.ffmpegLocation}:${process.env.PATH ?? ''}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  private argsFor(job: InternalJob): string[] {
    return [
      '--no-playlist',
      '--newline',
      '--no-colors',
      '--restrict-filenames',
      '--max-filesize',
      `${this.maxMegabytes}m`,
      '--sleep-requests',
      '1',
      '--js-runtimes',
      this.jsRuntime,
      '--ffmpeg-location',
      this.ffmpegLocation,
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '0',
      '--paths',
      job.dir,
      '--output',
      '%(title).80s.%(ext)s',
      '--',
      job.url,
    ];
  }

  private async finish(
    job: InternalJob,
    code: number | null,
    stderr: string[],
  ): Promise<void> {
    if (!this.jobs.has(job.id)) return; // cancelled and discarded meanwhile
    if (job.status === 'failed') return; // cancelled or timed out, already explained
    if (code !== 0) {
      const reason =
        [...stderr].reverse().find((l) => l.startsWith('ERROR')) ??
        stderr.at(-1) ??
        `exited with code ${code}`;
      this.fail(job, reason.slice(0, 200));
      return;
    }
    const produced = await this.producedFile(job.dir);
    if (!produced) {
      // yt-dlp exits 0 when it *skips* — a file over --max-filesize, say.
      this.fail(job, 'no file produced (over the size limit?)');
      return;
    }
    job.status = 'done';
    job.progress = 1;
    job.path = produced.path;
    job.filename = produced.name;
    job.size = produced.size;
    job.finishedAt = Date.now();
  }

  private fail(job: InternalJob, error: string): void {
    job.status = 'failed';
    job.error = error;
    job.finishedAt = Date.now();
    this.logger.warn(`download ${job.id} failed: ${error}`);
    void rm(job.dir, { recursive: true, force: true }).catch(() => undefined);
  }

  /** The one real file in the job directory: not a `.part`, not yt-dlp's `.ytdl`. */
  private async producedFile(
    dir: string,
  ): Promise<{ path: string; name: string; size: number } | null> {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return null;
    }
    let best: { path: string; name: string; size: number } | null = null;
    for (const name of names) {
      if (/\.(part|ytdl|temp)$/.test(name)) continue;
      const path = join(dir, name);
      const info = await stat(path).catch(() => null);
      if (!info?.isFile()) continue;
      if (!best || info.size > best.size)
        best = { path, name, size: info.size };
    }
    return best;
  }

  private async discard(job: InternalJob): Promise<void> {
    this.jobs.delete(job.id);
    await rm(job.dir, { recursive: true, force: true }).catch(() => undefined);
  }

  /** Off, on without its binary, or on — the same checks `GET /jobs` makes. */
  health(): UnitHealth {
    if (!this.enabled)
      return { unit: 'jobs', state: 'inactive', reason: 'disabled' };
    if (!this.configured)
      return { unit: 'jobs', state: 'inactive', reason: 'missing-binary' };
    return { unit: 'jobs', state: 'active', detail: { jobs: this.jobs.size } };
  }
}

/** `[download]  42.7% of 10.00MiB at 1.2MiB/s ETA 00:05` → 0.427. */
export function parseProgress(lineText: string): number | null {
  const match = /^\[download\]\s+(\d+(?:\.\d+)?)%/.exec(lineText.trim());
  if (!match) return null;
  return Math.min(1, Math.max(0, Number(match[1]) / 100));
}

function toView(job: InternalJob): DownloadJob {
  const {
    id,
    url,
    status,
    progress,
    filename,
    size,
    error,
    createdAt,
    finishedAt,
  } = job;
  return {
    id,
    url,
    status,
    progress,
    filename,
    size,
    error,
    createdAt,
    finishedAt,
  };
}

export type { JobStatus };
