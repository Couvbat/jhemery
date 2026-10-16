/**
 * The Prometheus text format, as much of it as Uptime Kuma's `/metrics` uses: one
 * sample per line, `name{label="value",…} number`, `#` lines skipped. Label values may
 * hold escaped quotes and backslashes. Anything that doesn't parse is skipped rather
 * than failing the whole page: one odd line must not take every monitor with it.
 */
export function parseMetrics(text) {
  const samples = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^([A-Za-z_:][A-Za-z0-9_:]*)(?:\{(.*)\})?\s+(\S+)(?:\s+\d+)?$/.exec(line)
    if (!match) continue
    const value = Number(match[3])
    if (Number.isNaN(value)) continue
    samples.push({ name: match[1], labels: parseLabels(match[2] ?? ''), value })
  }
  return samples
}

function parseLabels(text) {
  const labels = {}
  const pattern = /([A-Za-z_][A-Za-z0-9_]*)="((?:[^"\\]|\\.)*)"\s*,?\s*/g
  let match
  while ((match = pattern.exec(text))) {
    labels[match[1]] = match[2].replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c))
  }
  return labels
}

/** Kuma's `monitor_status` values. Pending is a retry after one failed check, not yet an outage. */
const KUMA_STATUS = { 0: 'down', 1: 'up', 2: 'up', 3: 'maintenance' }

/**
 * The monitors named in `monitors` (Kuma's name → node id), as service samples. A
 * monitor that isn't in the map is never read past its name, which is how a critical
 * service that Kuma watches stays off the feed. Only the name label is read: the others
 * carry the monitor's URL, host and port.
 */
export function kumaServices(text, monitors) {
  const byId = new Map()
  for (const sample of parseMetrics(text)) {
    const id = monitors[sample.labels.monitor_name]
    if (!id) continue
    const service = byId.get(id) ?? { id }
    if (sample.name === 'monitor_status') {
      const status = KUMA_STATUS[sample.value]
      if (status) service.status = status
    } else if (sample.name === 'monitor_response_time' && sample.value >= 0) {
      service.latencyMs = Math.round(sample.value)
    }
    byId.set(id, service)
  }
  // A monitor with no status line said nothing worth sending.
  return [...byId.values()].filter((service) => service.status)
}
