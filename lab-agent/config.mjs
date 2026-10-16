/**
 * The agent's configuration, read from its environment on the NAS and nowhere else: it
 * holds the lab's internal addresses, so none of it is ever in the repo. See
 * `compose.example.yaml` and `docs/deploy.md`.
 */

/** `poseidon=http://…,optimus=http://…` → `{ poseidon: 'http://…', … }`. Splits on the first `=`. */
export function pairs(text) {
  const out = {}
  for (const part of (text ?? '').split(',')) {
    const at = part.indexOf('=')
    if (at <= 0) continue
    const key = part.slice(0, at).trim()
    const value = part.slice(at + 1).trim()
    if (key && value) out[key] = value
  }
  return out
}

export const MIN_INTERVAL_S = 30

export function readConfig(env = process.env) {
  const problems = []
  const apiUrl = (env.LAB_API_URL ?? '').replace(/\/+$/, '')
  const token = env.LAB_INGEST_TOKEN ?? ''
  if (!/^https?:\/\//.test(apiUrl)) problems.push('LAB_API_URL must be the API’s URL')
  if (token.length < 32) problems.push('LAB_INGEST_TOKEN must be at least 32 characters, as the API requires')

  // The API takes at most six pushes a minute; anything faster than this only earns 429s.
  const interval = Math.max(MIN_INTERVAL_S, Number(env.LAB_INTERVAL_S) || 60)
  const vram = Object.fromEntries(
    Object.entries(pairs(env.LAB_GPU_VRAM_MB)).map(([id, mb]) => [id, Number(mb)]).filter(([, mb]) => mb > 0),
  )

  return {
    problems,
    apiUrl,
    token,
    intervalMs: interval * 1000,
    glances: pairs(env.LAB_GLANCES),
    truenas: pairs(env.LAB_TRUENAS),
    truenasKeys: pairs(env.LAB_TRUENAS_KEYS),
    kumaUrl: env.LAB_KUMA_URL || null,
    kumaKey: env.LAB_KUMA_KEY || null,
    monitors: pairs(env.LAB_KUMA_MONITORS),
    ollamaUrl: env.LAB_OLLAMA_URL || null,
    cloudflaredUrl: env.LAB_CLOUDFLARED_URL || null,
    vram,
  }
}
