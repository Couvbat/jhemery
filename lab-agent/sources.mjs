/**
 * One fetcher per source, each bounded by a 5 s timeout. A source that fails or isn't
 * configured answers `null`, which leaves only its own part of the snapshot out: a
 * Glances that doesn't answer makes its machine `up: false`, and nothing else changes.
 *
 * Every URL here is the lab's own, from the agent's environment on the NAS. None of
 * them is ever copied into the snapshot; `snapshot.mjs` reads fields by name.
 */

export const TIMEOUT_MS = 5_000

async function getJson(url, init = {}, fetcher = fetch) {
  const res = await fetcher(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

async function getText(url, init = {}, fetcher = fetch) {
  const res = await fetcher(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.text()
}

const trim = (url) => url.replace(/\/+$/, '')

/** Glances' REST version per base URL, found once: `/api/4/` on Glances 4, `/api/3/` before. */
const glancesVersions = new Map()

async function glancesVersion(base, fetcher) {
  const known = glancesVersions.get(base)
  if (known) return known
  for (const version of [4, 3]) {
    try {
      await getJson(`${base}/api/${version}/quicklook`, {}, fetcher)
      glancesVersions.set(base, version)
      return version
    } catch {
      // Try the older one.
    }
  }
  throw new Error('no Glances API answered')
}

/** The plugins a machine's card reads. Optional ones that fail are left out, not fatal. */
export async function fetchGlances(url, fetcher = fetch) {
  const base = trim(url)
  try {
    const version = await glancesVersion(base, fetcher)
    const plugin = (name) => getJson(`${base}/api/${version}/${name}`, {}, fetcher).catch(() => undefined)
    const [quicklook, load, sensors, uptime, gpu, containers, fs] = await Promise.all(
      ['quicklook', 'load', 'sensors', 'uptime', 'gpu', 'containers', 'fs'].map(plugin),
    )
    // The machine answered only if its main plugin did.
    return quicklook ? { quicklook, load, sensors, uptime, gpu, containers, fs } : null
  } catch {
    glancesVersions.delete(base)
    return null
  }
}

/**
 * TrueNAS's pools, through whichever API the release offers: a `ws://` or `wss://` URL is
 * the JSON-RPC API (`/api/current`, the one recent releases keep), an `http(s)://` one the
 * REST `pool` endpoint, deprecated in those releases but still there in older ones.
 */
export async function fetchTruenasPools(url, key, fetcher = fetch) {
  try {
    if (/^wss?:\/\//.test(url)) return await jsonRpcPools(url, key)
    return await getJson(`${trim(url)}/api/v2.0/pool`, { headers: { Authorization: `Bearer ${key}` } }, fetcher)
  } catch {
    return null
  }
}

/** `auth.login_with_api_key`, then `pool.query`, over Node's own WebSocket. */
function jsonRpcPools(url, key) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${trim(url)}/api/current`)
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('timed out'))
    }, TIMEOUT_MS)
    const done = (fn, value) => {
      clearTimeout(timer)
      socket.close()
      fn(value)
    }
    const call = (id, method, params) => socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    socket.addEventListener('open', () => call(1, 'auth.login_with_api_key', [key]))
    socket.addEventListener('error', () => done(reject, new Error('socket error')))
    socket.addEventListener('message', (event) => {
      let message
      try {
        message = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (message.error) return done(reject, new Error('refused'))
      if (message.id === 1) {
        if (message.result !== true) return done(reject, new Error('not logged in'))
        call(2, 'pool.query', [])
      } else if (message.id === 2) {
        done(resolve, message.result)
      }
    })
  })
}

/** Kuma's `/metrics` sits behind an API key, sent as basic auth with an empty user. */
export async function fetchKuma(url, key, fetcher = fetch) {
  try {
    const auth = Buffer.from(`:${key}`).toString('base64')
    return await getText(`${trim(url)}/metrics`, { headers: { Authorization: `Basic ${auth}` } }, fetcher)
  } catch {
    return null
  }
}

/** `/api/ps` and `/api/tags`. Both failing is a runtime that is down, not a missing source. */
export async function fetchOllama(url, fetcher = fetch) {
  const base = trim(url)
  const [ps, tags] = await Promise.all([
    getJson(`${base}/api/ps`, {}, fetcher).catch(() => null),
    getJson(`${base}/api/tags`, {}, fetcher).catch(() => null),
  ])
  return { ps, tags }
}

/** cloudflared's metrics server answers `/ready` with its healthy connections. */
export async function fetchTunnel(url, fetcher = fetch) {
  try {
    const res = await fetcher(`${trim(url)}/ready`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    const body = await res.json().catch(() => ({}))
    return { status: res.status, readyConnections: body?.readyConnections }
  } catch {
    return null
  }
}

/**
 * Every configured source, in parallel. The result is `snapshot.mjs`'s `raw`; an
 * unconfigured source is simply absent.
 */
export async function fetchAll(config, fetcher = fetch) {
  const entries = async (pairs, fetchOne) =>
    Object.fromEntries(await Promise.all(Object.entries(pairs).map(async ([id, value]) => [id, await fetchOne(id, value)])))

  const [glances, pools, kuma, ollama, tunnel] = await Promise.all([
    entries(config.glances, (_, url) => fetchGlances(url, fetcher)),
    entries(config.truenas, (id, url) => (config.truenasKeys[id] ? fetchTruenasPools(url, config.truenasKeys[id], fetcher) : null)),
    config.kumaUrl && config.kumaKey ? fetchKuma(config.kumaUrl, config.kumaKey, fetcher) : null,
    config.ollamaUrl ? fetchOllama(config.ollamaUrl, fetcher) : null,
    config.cloudflaredUrl ? fetchTunnel(config.cloudflaredUrl, fetcher) : null,
  ])
  return { glances, pools, kuma, ollama, tunnel }
}
