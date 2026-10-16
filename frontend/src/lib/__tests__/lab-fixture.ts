import type { LabReport, LabSnapshot } from '../api'

/**
 * A lab snapshot as the API serves it, shared by the specs that read one: `lib/lab.ts`,
 * the `lab` command and the lab shell. Not a spec itself (the include pattern wants
 * `*.spec.ts`). The shape is what `lab-agent/fixtures/expected-snapshot.json` makes,
 * with the ids the map draws.
 */
export const SNAPSHOT: LabSnapshot = {
  takenAt: '2026-10-15T19:42:01.000Z',
  machines: [
    {
      id: 'poseidon',
      up: true,
      uptimeSeconds: 12 * 86_400 + 3_600,
      cpu: 8.1,
      memory: 41.3,
      load: 0.42,
      tempC: { cpu: 47, gpu: 44 },
      pools: [{ name: 'tank', health: 'ONLINE', used: 0.61 }],
      gpu: { util: 3, vramUsedMb: 2150, vramTotalMb: 10240, powerW: 31 },
      containers: 6,
    },
    {
      id: 'optimus',
      up: true,
      uptimeSeconds: 30 * 86_400,
      cpu: 2.4,
      memory: 63.9,
      load: 0.18,
      tempC: { cpu: 39 },
      pools: [{ name: 'data', health: 'ONLINE', used: 0.744 }],
      containers: 9,
    },
  ],
  services: [
    { id: 'umami', status: 'up', latencyMs: 41 },
    { id: 'n8n', status: 'down' },
    { id: 'odysseus', status: 'maintenance' },
    { id: 'dashy', status: 'up', latencyMs: 12 },
  ],
  models: {
    runtime: 'up',
    resident: [{ name: 'gemma4:e4b', vramMb: 2100 }],
    installed: [
      { name: 'gemma4:e4b', sizeGb: 9.6 },
      { name: 'qwen3:8b', sizeGb: 5.2 },
      { name: 'nomic-embed-text:latest', sizeGb: 0.3 },
    ],
  },
  tunnel: { healthy: true, connections: 4 },
}

const days = (value: number | null, last: number | null = value) => [...Array<number | null>(29).fill(value), last]

export function liveReport(ageMs = 40_000, snapshot: LabSnapshot = SNAPSHOT): LabReport {
  return {
    configured: true,
    receivedAt: '2026-10-15T19:42:02.000Z',
    ageMs,
    stale: ageMs > 5 * 60_000,
    snapshot,
    history: { poseidon: days(1), optimus: days(null, 1), umami: days(0.99, 1), n8n: days(1, 0) },
  }
}

export const OFF: LabReport = { configured: false }

export const EMPTY: LabReport = {
  configured: true,
  receivedAt: null,
  ageMs: null,
  stale: true,
  snapshot: null,
  history: {},
}
