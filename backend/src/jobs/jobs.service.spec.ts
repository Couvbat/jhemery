import { BadRequestException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import {
  FILE_TTL_MS,
  JobsService,
  MAX_PENDING,
  parseProgress,
  type Spawner,
} from './jobs.service';

/** A child process that does what the test tells it to. */
class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = jest.fn(() => {
    this.exit(137);
    return true;
  });
  exit(code: number) {
    this.stdout.end();
    this.stderr.end();
    setImmediate(() => this.emit('close', code));
  }
}

const YT = 'https://youtu.be/aqz-KE-bpKQ';
const T0 = 1_700_000_000_000;

/** Long enough for the real mkdir/readdir/stat the service awaits to complete. */
const flush = () => new Promise<void>((r) => setTimeout(r, 40));

describe('JobsService', () => {
  let root: string;
  let service: JobsService;
  let children: { args: string[]; cwd: string; child: FakeChild }[];

  function build(env: Record<string, string>) {
    const config = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;
    children = [];
    const spawner: Spawner = (_command, args, options) => {
      const child = new FakeChild();
      children.push({ args, cwd: String(options.cwd), child });
      return child as unknown as ChildProcess;
    };
    return new JobsService(config, spawner);
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'jobs-spec-'));
    service = build({
      DOWNLOADER_ENABLED: 'true',
      YTDLP_BIN: process.execPath,
      DATA_DIR: root,
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('is configured only when on and the binary exists', () => {
    expect(service.configured).toBe(true);
    expect(
      build({ DOWNLOADER_ENABLED: 'true', YTDLP_BIN: '/nope/yt-dlp' })
        .configured,
    ).toBe(false);
    expect(
      build({ DOWNLOADER_ENABLED: 'false', YTDLP_BIN: process.execPath })
        .configured,
    ).toBe(false);
  });

  it('refuses anything but one video or one track', () => {
    expect(() => service.start('https://soundcloud.com/couvbat')).toThrow(
      BadRequestException,
    );
    expect(() => service.start('not a url')).toThrow(BadRequestException);
    expect(service.count).toBe(0);
  });

  it('starts a job at once and runs yt-dlp with the shell check baked in', async () => {
    const job = service.start(YT, T0);
    // Nothing else running: it is picked up before `start` even returns.
    expect(job).toMatchObject({
      status: 'running',
      url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      progress: null,
    });
    expect(job.id).toMatch(/^[A-Za-z0-9_-]{12}$/);

    await flush();
    expect(service.get(job.id)?.status).toBe('running');
    const [launched] = children;
    expect(launched.cwd).toBe(join(root, 'jobs', job.id));
    expect(launched.args).toEqual(
      expect.arrayContaining([
        '--no-playlist',
        '--sleep-requests',
        '-x',
        '--restrict-filenames',
      ]),
    );
    expect(launched.args.at(-2)).toBe('--');
    expect(launched.args.at(-1)).toBe(job.url);
    expect(launched.args[launched.args.indexOf('--js-runtimes') + 1]).toBe(
      `node:${process.execPath}`,
    );
    expect(existsSync(join(root, 'jobs', 'tmp'))).toBe(true);
  });

  it('reads progress from yt-dlp, then the file it produced', async () => {
    const job = service.start(YT, T0);
    await flush();
    const { child, cwd } = children[0];

    child.stdout.write(
      '[youtube] aqz-KE-bpKQ: Downloading webpage\n[download]  42.7% of 10.00MiB at 1.2MiB/s ETA 00:05\n',
    );
    await flush();
    expect(service.get(job.id)?.progress).toBeCloseTo(0.427);

    writeFileSync(join(cwd, 'Big_Buck_Bunny.mp3'), Buffer.alloc(2048));
    writeFileSync(join(cwd, 'Big_Buck_Bunny.webm.part'), Buffer.alloc(9999));
    child.exit(0);
    await flush();
    await flush();

    expect(service.get(job.id)).toMatchObject({
      status: 'done',
      progress: 1,
      filename: 'Big_Buck_Bunny.mp3',
      size: 2048,
    });
    expect(service.takeFile(job.id)).toMatchObject({
      filename: 'Big_Buck_Bunny.mp3',
      size: 2048,
    });
  });

  it('reports the last ERROR line when yt-dlp fails, and drops the directory', async () => {
    const job = service.start(YT, T0);
    await flush();
    const { child, cwd } = children[0];

    child.stderr.write(
      'WARNING: something\nERROR: [youtube] aqz-KE-bpKQ: Sign in to confirm you are not a bot\n',
    );
    child.exit(1);
    await flush();
    await flush();

    expect(service.get(job.id)?.status).toBe('failed');
    expect(service.get(job.id)?.error).toContain('not a bot');
    expect(existsSync(cwd)).toBe(false);
  });

  it('treats a clean exit with no file as a failure — the size-limit skip', async () => {
    const job = service.start(YT, T0);
    await flush();
    children[0].child.exit(0);
    await flush();
    await flush();
    expect(service.get(job.id)?.status).toBe('failed');
  });

  it('runs one at a time, queues the rest, and caps the queue', async () => {
    const first = service.start(YT, T0);
    const second = service.start(YT, T0);
    service.start(YT, T0);
    expect(() => service.start(YT, T0)).toThrow(HttpException);
    await flush();

    expect(children).toHaveLength(1);
    expect(service.get(first.id)?.status).toBe('running');
    expect(service.get(second.id)?.status).toBe('queued');

    children[0].child.exit(1);
    await flush();
    await flush();
    await flush();
    expect(children).toHaveLength(2);
    expect(service.get(second.id)?.status).toBe('running');
  });

  it('cancels a running job by killing it, and a queued one by forgetting it', async () => {
    const running = service.start(YT, T0);
    const queued = service.start(YT, T0);
    await flush();

    expect(await service.cancel(queued.id)).toBe(true);
    expect(service.get(queued.id)).toBeUndefined();

    expect(await service.cancel(running.id)).toBe(true);
    expect(children[0].child.kill).toHaveBeenCalled();
    await flush();
    await flush();
    expect(service.get(running.id)).toBeUndefined();
    expect(await service.cancel('nope')).toBe(false);
  });

  it('release() deletes the file and the job together — fetch-once', async () => {
    const job = service.start(YT, T0);
    await flush();
    const { child, cwd } = children[0];
    writeFileSync(join(cwd, 'track.mp3'), 'x');
    child.exit(0);
    await flush();
    await flush();

    await service.release(job.id);
    expect(service.get(job.id)).toBeUndefined();
    expect(existsSync(cwd)).toBe(false);
  });

  it('sweeps files nobody fetched after their TTL', async () => {
    const job = service.start(YT, T0);
    await flush();
    const { child, cwd } = children[0];
    writeFileSync(join(cwd, 'track.mp3'), 'x');
    child.exit(0);
    await flush();
    await flush();
    const finishedAt = service.get(job.id)!.finishedAt!;

    await service.sweep(finishedAt + FILE_TTL_MS - 1);
    expect(service.get(job.id)).toBeDefined();
    await service.sweep(finishedAt + FILE_TTL_MS + 1);
    expect(service.get(job.id)).toBeUndefined();
    expect(existsSync(cwd)).toBe(false);
  });

  it('lists newest first and never leaks a path', () => {
    service.start(YT, T0);
    service.start(YT, T0 + 1);
    const [newest] = service.list();
    expect(newest.createdAt).toBe(T0 + 1);
    expect(newest).not.toHaveProperty('dir');
    expect(newest).not.toHaveProperty('path');
    expect(MAX_PENDING).toBe(3);
  });
});

describe('parseProgress', () => {
  it('reads yt-dlp download lines and ignores the rest', () => {
    expect(
      parseProgress('[download]  42.7% of 10.00MiB at 1.2MiB/s ETA 00:05'),
    ).toBeCloseTo(0.427);
    expect(parseProgress('[download] 100% of 10.00MiB in 00:08')).toBe(1);
    expect(parseProgress('[ExtractAudio] Destination: x.mp3')).toBeNull();
    expect(parseProgress('[download] Destination: x.webm')).toBeNull();
  });
});
