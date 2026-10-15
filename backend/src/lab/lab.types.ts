/**
 * The snapshot the lab pushes, and what visitors read back. The shape is the lab map
 * spec's (`docs/superpowers/specs/2026-10-15-lab-map-design.md`), and the frontend mirrors
 * it in `src/lib/api.ts`. `lab-agent/snapshot.mjs` builds it, and `lab.dto.spec.ts` holds
 * the agent's expected output to `LabSnapshotDto`, so a change on either side fails CI
 * before it can fail a push.
 */

export type PoolHealth =
  'ONLINE' | 'DEGRADED' | 'FAULTED' | 'OFFLINE' | 'UNAVAIL';

export interface PoolSample {
  name: string;
  /** Absent when only Glances' file-system plugin saw the pool: it reads fill, not health. */
  health?: PoolHealth;
  /** Fill, 0–1. */
  used: number;
}

export interface GpuSample {
  util: number;
  vramUsedMb: number;
  vramTotalMb: number;
  powerW?: number;
}

export interface MachineSample {
  id: string;
  up: boolean;
  uptimeSeconds?: number;
  /** Percent, 0–100. */
  cpu?: number;
  /** Percent, 0–100. */
  memory?: number;
  /** One-minute load average. */
  load?: number;
  tempC?: { cpu?: number; gpu?: number };
  pools?: PoolSample[];
  gpu?: GpuSample;
  /** A running count, never names. */
  containers?: number;
}

export type ServiceStatus = 'up' | 'down' | 'maintenance';

export interface ServiceSample {
  id: string;
  status: ServiceStatus;
  latencyMs?: number;
}

export interface ModelSample {
  runtime: 'up' | 'down';
  /** `ollama ps`. */
  resident: { name: string; vramMb: number }[];
  /** `ollama list`. */
  installed: { name: string; sizeGb: number }[];
}

export interface LabSnapshot {
  /** When the agent took it, by its clock. */
  takenAt: string;
  machines: MachineSample[];
  services: ServiceSample[];
  models?: ModelSample;
  tunnel?: { healthy: boolean; connections: number };
}

/** One node's UTC day: how many snapshots saw it up, out of how many saw it at all. */
export interface LabDay {
  day: string;
  up: number;
  total: number;
}

/** `DATA_DIR/lab.json`. */
export interface LabFile {
  receivedAt: number;
  snapshot: LabSnapshot;
  days: Record<string, LabDay[]>;
}

export type LabReport =
  | { configured: false }
  | {
      configured: true;
      /** ISO time the API received the snapshot; null before the first push. */
      receivedAt: string | null;
      ageMs: number | null;
      stale: boolean;
      snapshot: LabSnapshot | null;
      /** Per node, the last 30 UTC days oldest first: the fraction up, or null for no data. */
      history: Record<string, (number | null)[]>;
    };

export interface IngestResult {
  /** Machines and services kept. */
  accepted: number;
  /** Ids not in `LAB_NODES`, named so a typo shows up in the agent's log. */
  dropped: string[];
}
