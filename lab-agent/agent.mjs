#!/usr/bin/env node
import { pathToFileURL } from 'node:url'
import { readConfig } from './config.mjs'
import { buildSnapshot, checkSnapshot } from './snapshot.mjs'
import { fetchAll, TIMEOUT_MS } from './sources.mjs'

/**
 * The lab's side of the lab map: every `LAB_INTERVAL_S` (60 by default) it fetches every
 * source in parallel, builds the snapshot and pushes it to `POST /lab/snapshot` with the
 * bearer token. Outbound requests only; nothing listens.
 *
 * One log line per push. A failed push waits for the next tick: it never retries in a
 * burst, since the API limits pushes and a burst would only turn one failure into
 * several. `node agent.mjs --once` pushes a single snapshot and exits, for trying it out.
 */

const log = (text) => console.log(`${new Date().toISOString()} ${text}`)

export async function pushOnce(config, fetcher = fetch) {
  const raw = await fetchAll(config, fetcher)
  const snapshot = checkSnapshot(buildSnapshot(raw, config))
  const res = await fetcher(`${config.apiUrl}/lab/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
    body: JSON.stringify(snapshot),
    signal: AbortSignal.timeout(TIMEOUT_MS * 2),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    // The API's 400 names the property it refused, which is the line worth reading.
    const message = Array.isArray(body?.message) ? body.message.join('; ') : (body?.message ?? '')
    return `push refused: ${res.status}${message ? ` — ${message}` : ''}`
  }
  const dropped = Array.isArray(body.dropped) ? body.dropped : []
  return `pushed: ${body.accepted ?? '?'} accepted, ${dropped.length} dropped${dropped.length ? ` (${dropped.join(', ')})` : ''}`
}

async function main() {
  const config = readConfig()
  if (config.problems.length) {
    for (const problem of config.problems) log(problem)
    process.exitCode = 1
    return
  }
  const once = process.argv.includes('--once')
  for (;;) {
    const started = Date.now()
    try {
      log(await pushOnce(config))
    } catch (err) {
      log(`push failed: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (once) return
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, config.intervalMs - (Date.now() - started))))
  }
}

// Run only as the entry point, so the tests can import `pushOnce`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
