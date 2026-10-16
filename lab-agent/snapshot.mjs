import { leaks, NODE_ID, sendable } from './address.mjs'
import { kumaServices } from './prometheus.mjs'

/**
 * Turns the sources' raw answers into the snapshot the API takes
 * (`backend/src/lab/lab.dto.ts`). Pure, so every rule is a test against a fixture.
 *
 * The rule that matters: **copy allowlisted fields only, by name.** Nothing is spread,
 * nothing is passed through: a source that grows a field tomorrow (a hostname, an
 * address, a version) has it ignored rather than forwarded. Names that do get copied,
 * pools and models, are held to the API's pattern and address rules here, and a name
 * that fails is left out rather than sent to be refused.
 *
 * `raw` is what `sources.mjs` fetched, `null` wherever a source failed or isn't
 * configured, which leaves only its own part out:
 *
 * - `glances`: machine id → `{ quicklook, load, sensors, uptime, gpu, containers, fs }`, or
 *   `null` when that machine's Glances didn't answer (the machine is then `up: false`);
 * - `pools`: machine id → TrueNAS's pool list;
 * - `kuma`: the text of Kuma's `/metrics`;
 * - `ollama`: `{ ps, tags }`, each `/api/ps` and `/api/tags`, or `null` when neither answered;
 * - `tunnel`: cloudflared's `/ready` answer.
 *
 * `options` is the agent's configuration: `monitors` (Kuma's names → node ids) and `vram`
 * (machine id → the GPU's memory in MB, which Glances reports only as a percentage).
 */
export function buildSnapshot(raw, options, takenAt = new Date()) {
  const snapshot = {
    takenAt: takenAt.toISOString(),
    machines: Object.entries(raw.glances ?? {})
      .filter(([id]) => NODE_ID.test(id))
      .slice(0, 8)
      .map(([id, answer]) => machine(id, answer, raw.pools?.[id], options.vram?.[id])),
    services: raw.kuma ? kumaServices(raw.kuma, options.monitors ?? {}).slice(0, 32) : [],
  }
  const models = modelSample(raw.ollama)
  if (models) snapshot.models = models
  const tunnel = tunnelSample(raw.tunnel)
  if (tunnel) snapshot.tunnel = tunnel
  return snapshot
}

/** Throws rather than let a snapshot with anything address-shaped in it leave the lab. */
export function checkSnapshot(snapshot) {
  const found = leaks(snapshot)
  if (found.length) throw new Error(`refusing to send: ${found.join(', ')} look like addresses`)
  return snapshot
}

const round1 = (n) => Math.round(n * 10) / 10
const finite = (n) => typeof n === 'number' && Number.isFinite(n)
const clamp = (n, low, high) => Math.min(high, Math.max(low, n))

function machine(id, answer, pools, vramMb) {
  if (!answer) return { id, up: false }
  const out = { id, up: true }

  const uptime = uptimeSeconds(answer.uptime)
  if (uptime !== undefined) out.uptimeSeconds = uptime
  if (finite(answer.quicklook?.cpu)) out.cpu = round1(clamp(answer.quicklook.cpu, 0, 100))
  if (finite(answer.quicklook?.mem)) out.memory = round1(clamp(answer.quicklook.mem, 0, 100))
  if (finite(answer.load?.min1)) out.load = Math.round(clamp(answer.load.min1, 0, 1000) * 100) / 100

  const gpu = Array.isArray(answer.gpu) ? answer.gpu[0] : undefined
  const temps = {}
  const cpuTemp = cpuTemperature(answer.sensors)
  if (cpuTemp !== undefined) temps.cpu = cpuTemp
  if (finite(gpu?.temperature)) temps.gpu = Math.round(clamp(gpu.temperature, -40, 150))
  if (Object.keys(temps).length) out.tempC = temps

  const poolList = pools ? truenasPools(pools) : glancesPools(answer.fs)
  if (poolList.length) out.pools = poolList

  if (gpu && finite(gpu.proc) && finite(vramMb) && vramMb > 0) {
    out.gpu = {
      util: Math.round(clamp(gpu.proc, 0, 100)),
      vramUsedMb: finite(gpu.mem) ? Math.round((clamp(gpu.mem, 0, 100) / 100) * vramMb) : 0,
      vramTotalMb: Math.round(vramMb),
    }
  }

  if (Array.isArray(answer.containers)) {
    // A count, never a name: `containers` lists them by name, which stays here.
    out.containers = answer.containers.filter((c) => /^running$/i.test(String(c?.status ?? c?.Status ?? ''))).length
  }
  return out
}

/**
 * Glances reports uptime as text, `12 days, 3:04:05` or `3:04:05`, or as seconds in some
 * releases. Anything else is left out.
 */
export function uptimeSeconds(value) {
  if (finite(value)) return Math.max(0, Math.round(value))
  if (typeof value !== 'string') return undefined
  const match = /^(?:(\d+) days?, )?(\d+):(\d{2}):(\d{2})/.exec(value.trim())
  if (!match) return undefined
  const [, days = '0', h, m, s] = match
  return Number(days) * 86_400 + Number(h) * 3_600 + Number(m) * 60 + Number(s)
}

/** The hottest CPU package or core Glances sees, by its sensor type. */
function cpuTemperature(sensors) {
  if (!Array.isArray(sensors)) return undefined
  const readings = sensors
    .filter((s) => s?.type === 'temperature_core' && finite(s.value))
    .map((s) => s.value)
  return readings.length ? Math.round(clamp(Math.max(...readings), -40, 150)) : undefined
}

const POOL_HEALTH = new Set(['ONLINE', 'DEGRADED', 'FAULTED', 'OFFLINE', 'UNAVAIL'])

/** TrueNAS's pool list (REST `pool` or JSON-RPC `pool.query`, which share a shape). */
function truenasPools(pools) {
  if (!Array.isArray(pools)) return []
  return pools
    .filter((p) => sendable(p?.name) && finite(p.size) && p.size > 0 && finite(p.allocated))
    .slice(0, 8)
    .map((p) => ({
      name: p.name,
      // REMOVED and anything newer read as unavailable rather than being dropped.
      health: POOL_HEALTH.has(p.status) ? p.status : 'UNAVAIL',
      used: Math.round(clamp(p.allocated / p.size, 0, 1) * 1000) / 1000,
    }))
}

/**
 * Fill alone, when TrueNAS isn't configured for the machine: each top-level ZFS
 * dataset Glances' file-system plugin lists. Glances can't see a pool's health, so the
 * sample doesn't claim one.
 */
function glancesPools(fs) {
  if (!Array.isArray(fs)) return []
  return fs
    .filter((f) => f?.fs_type === 'zfs' && sendable(f.device_name) && !f.device_name.includes('/') && finite(f.percent))
    .slice(0, 8)
    .map((f) => ({ name: f.device_name, used: Math.round(clamp(f.percent / 100, 0, 1) * 1000) / 1000 }))
}

function modelSample(ollama) {
  if (!ollama) return undefined
  const { ps, tags } = ollama
  if (!ps && !tags) return { runtime: 'down', resident: [], installed: [] }
  const list = (answer) => (Array.isArray(answer?.models) ? answer.models : [])
  return {
    runtime: 'up',
    resident: list(ps)
      .filter((m) => sendable(m?.name))
      .slice(0, 8)
      .map((m) => ({ name: m.name, vramMb: finite(m.size_vram) ? Math.round(m.size_vram / 1_048_576) : 0 })),
    installed: list(tags)
      .filter((m) => sendable(m?.name))
      .slice(0, 20)
      .map((m) => ({ name: m.name, sizeGb: finite(m.size) ? round1(m.size / 1e9) : 0 })),
  }
}

/** cloudflared's `/ready`: 200 and at least one connection is healthy. The connector id stays here. */
function tunnelSample(ready) {
  if (!ready) return undefined
  const connections = finite(ready.readyConnections) ? clamp(Math.round(ready.readyConnections), 0, 64) : 0
  return { healthy: ready.status === 200 && connections > 0, connections }
}
