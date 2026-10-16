import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { sameSecret } from '../common/admin.guard';
import { UnitHealth } from '../common/health';
import type {
  IngestResult,
  LabDay,
  LabFile,
  LabReport,
  LabSnapshot,
} from './lab.types';

/** Five missed pushes, at the agent's one a minute. */
export const STALE_MS = 5 * 60_000;
/** How far the agent's clock may sit from the API's before its snapshot is refused. */
export const SKEW_MS = 10 * 60_000;
/** Days of history each node keeps: one bar per day on the map. */
export const HISTORY_DAYS = 30;
/** Shorter counts as unset: a token anyone could guess must not open the route. */
export const MIN_TOKEN_LENGTH = 32;

const DAY_MS = 86_400_000;

function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * The lab map's backend (`docs/superpowers/specs/2026-10-15-lab-map-design.md`). The
 * one rule: **push, never pull.** Nothing here ever calls into the home network; the lab
 * sends a snapshot on its own schedule, and visitors read the copy held here. It is
 * `/health`'s rule applied to a whole network.
 *
 * Off by default, like `ask`: it publishes facts about a private network, and that is
 * the owner's decision to make, not an install's default.
 */
@Injectable()
export class LabService implements OnModuleInit {
  private readonly logger = new Logger(LabService.name);
  private state: LabFile | null = null;
  private loading: Promise<void> | null = null;

  constructor(private readonly config: ConfigService) {}

  private get token(): string | null {
    const token = this.config.get<string>('LAB_INGEST_TOKEN') ?? '';
    return token.length >= MIN_TOKEN_LENGTH ? token : null;
  }

  get enabled(): boolean {
    return this.config.get<string>('LAB_ENABLED') === 'true' && !!this.token;
  }

  /** The ids the API will store, from `LAB_NODES`. Anything else is dropped on arrival. */
  get nodes(): Set<string> {
    return new Set(
      (this.config.get<string>('LAB_NODES') ?? '')
        .split(',')
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  /**
   * `Authorization: Bearer <token>`, compared in constant time. An unset or short token
   * means locked, never open — the same rule as `ADMIN_PASSWORD`.
   */
  authorised(header: string | undefined): boolean {
    const token = this.token;
    if (!this.enabled || !token || typeof header !== 'string') return false;
    const match = /^Bearer (.+)$/.exec(header);
    return !!match && sameSecret(match[1], token);
  }

  /** So a deploy, which restarts the process, doesn't blank the map until the next push. */
  onModuleInit(): void {
    if (this.enabled) void this.load();
  }

  async ingest(snapshot: LabSnapshot, now = Date.now()): Promise<IngestResult> {
    const takenAt = Date.parse(snapshot.takenAt);
    if (!Number.isFinite(takenAt) || Math.abs(now - takenAt) > SKEW_MS) {
      throw new BadRequestException(
        'takenAt is more than 10 minutes from the API’s clock',
      );
    }
    const ids = [...snapshot.machines, ...snapshot.services].map((s) => s.id);
    const twice = ids.find((id, i) => ids.indexOf(id) !== i);
    if (twice)
      throw new BadRequestException(`${twice} is in the snapshot twice`);

    await this.load();
    const nodes = this.nodes;
    const dropped = ids.filter((id) => !nodes.has(id));
    const kept: LabSnapshot = {
      ...snapshot,
      machines: snapshot.machines.filter((m) => nodes.has(m.id)),
      services: snapshot.services.filter((s) => nodes.has(s.id)),
    };

    const days = this.state?.days ?? {};
    const today = utcDay(now);
    const count = (id: string, up: boolean) => {
      const list = (days[id] ??= []);
      let day = list.find((d) => d.day === today);
      if (!day) {
        day = { day: today, up: 0, total: 0 };
        list.push(day);
      }
      day.total += 1;
      if (up) day.up += 1;
    };
    for (const machine of kept.machines) count(machine.id, machine.up);
    // Maintenance is planned: Kuma says so, and the bar shouldn't call it an outage.
    for (const service of kept.services)
      count(service.id, service.status !== 'down');
    if (kept.tunnel && nodes.has('tunnel'))
      count('tunnel', kept.tunnel.healthy);
    prune(days, now);

    this.state = { receivedAt: now, snapshot: kept, days };
    await this.persist();
    return {
      accepted: kept.machines.length + kept.services.length,
      dropped,
    };
  }

  async report(now = Date.now()): Promise<LabReport> {
    if (!this.enabled) return { configured: false };
    await this.load();
    const state = this.state;
    if (!state) {
      return {
        configured: true,
        receivedAt: null,
        ageMs: null,
        stale: true,
        snapshot: null,
        history: {},
      };
    }
    const ageMs = Math.max(0, now - state.receivedAt);
    return {
      configured: true,
      receivedAt: new Date(state.receivedAt).toISOString(),
      ageMs,
      stale: ageMs > STALE_MS,
      snapshot: state.snapshot,
      history: this.history(state.days, now),
    };
  }

  /**
   * Thirty fractions per node, oldest first. A day with no snapshot at all is `null`,
   * drawn grey: the API can't tell a sleeping lab from a broken push, so the bars must
   * not claim an outage it didn't see.
   */
  private history(
    days: Record<string, LabDay[]>,
    now: number,
  ): Record<string, (number | null)[]> {
    const nodes = this.nodes;
    const out: Record<string, (number | null)[]> = {};
    for (const [id, list] of Object.entries(days)) {
      if (!nodes.has(id)) continue;
      out[id] = Array.from({ length: HISTORY_DAYS }, (_, i) => {
        const day = utcDay(now - (HISTORY_DAYS - 1 - i) * DAY_MS);
        const found = list.find((d) => d.day === day);
        return found && found.total > 0 ? found.up / found.total : null;
      });
    }
    return out;
  }

  /** Reads only what it holds, as every `health()` does: no disk, no lab. */
  health(now = Date.now()): UnitHealth {
    if (!this.enabled) {
      return { unit: 'lab', state: 'inactive', reason: 'unconfigured' };
    }
    return {
      unit: 'lab',
      state: 'active',
      cacheAge: this.state ? Math.max(0, now - this.state.receivedAt) : null,
      detail: { nodes: this.nodes.size },
    };
  }

  /** Beside `stats.json` under `DATA_DIR`, which the deploy excludes. */
  private get filePath(): string {
    const dir = this.config.get<string>('DATA_DIR') ?? 'uploads';
    return join(isAbsolute(dir) ? dir : join(process.cwd(), dir), 'lab.json');
  }

  private load(): Promise<void> {
    this.loading ??= (async () => {
      try {
        const parsed = JSON.parse(
          await readFile(this.filePath, 'utf8'),
        ) as unknown;
        // The API wrote it, but a file on disk is still read as untrusted: anything
        // that isn't the right shape is dropped rather than served.
        if (isLabFile(parsed) && !this.state) this.state = parsed;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          this.logger.warn(
            `Could not read the lab snapshot: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    })();
    return this.loading;
  }

  private async persist(): Promise<void> {
    const path = this.filePath;
    try {
      await mkdir(dirname(path), { recursive: true });
      // Write-then-rename, as `stats` does: a crash mid-write must not truncate the
      // copy the map is drawn from.
      const temp = `${path}.${process.pid}.tmp`;
      await writeFile(temp, JSON.stringify(this.state), 'utf8');
      await rename(temp, path);
    } catch (err) {
      this.logger.warn(
        `Could not write the lab snapshot: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

function prune(days: Record<string, LabDay[]>, now: number): void {
  const oldest = utcDay(now - (HISTORY_DAYS - 1) * DAY_MS);
  for (const [id, list] of Object.entries(days)) {
    const kept = list.filter((d) => d.day >= oldest);
    if (kept.length) days[id] = kept;
    else delete days[id];
  }
}

function isLabFile(value: unknown): value is LabFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<LabFile>;
  const snapshot = file.snapshot as Partial<LabSnapshot> | undefined;
  return (
    typeof file.receivedAt === 'number' &&
    !!snapshot &&
    typeof snapshot.takenAt === 'string' &&
    Array.isArray(snapshot.machines) &&
    Array.isArray(snapshot.services) &&
    !!file.days &&
    typeof file.days === 'object' &&
    Object.values(file.days).every(
      (list) =>
        Array.isArray(list) &&
        list.every(
          (d: Partial<LabDay>) =>
            typeof d?.day === 'string' &&
            Number.isInteger(d.up) &&
            Number.isInteger(d.total),
        ),
    )
  );
}
