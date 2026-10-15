/**
 * What an address looks like, in any form that could leak one: a dotted quad, an IPv6
 * address (compressed or in full), a URL, a `host:port` pair, or a name in one of the
 * private suffixes. The port rule is a name followed by a colon and digits only, so a
 * model tag such as `gemma4:e4b` still passes.
 *
 * The API refuses the same list (`backend/src/lab/lab.dto.ts`), and
 * `backend/src/lab/lab.dto.spec.ts` holds the two copies to the same verdicts on
 * `fixtures/near-misses.json`. This one runs first, so a leak is stopped on the lab's
 * side, before anything is sent.
 */
export const ADDRESS_PATTERNS = [
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/,
  /::/,
  /\b[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){7}\b/i,
  /:\/\//,
  /[a-z0-9-]+(?:\.[a-z0-9-]+)*:\d{1,5}(?![\w.:])/i,
  /\.(?:lan|local|home\.arpa|ts\.net)\b/i,
]

export function looksLikeAddress(value) {
  return ADDRESS_PATTERNS.some((pattern) => pattern.test(value))
}

/** A node id, and a pool or model name: the API's patterns. */
export const NODE_ID = /^[a-z0-9-]{1,32}$/
export const SAMPLE_NAME = /^[A-Za-z0-9._:/-]{1,64}$/

/** A name that may be sent: the API's pattern, and nothing that looks like an address. */
export function sendable(name) {
  return typeof name === 'string' && SAMPLE_NAME.test(name) && !looksLikeAddress(name)
}

/**
 * Every string anywhere in a value whose text looks like an address, with its path. The
 * last check before a push: the builder only copies allowlisted fields, so this should
 * never find anything, and if it does the snapshot is not sent.
 */
export function leaks(value, path = '$') {
  if (typeof value === 'string') return looksLikeAddress(value) ? [path] : []
  if (Array.isArray(value)) return value.flatMap((item, i) => leaks(item, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => leaks(item, `${path}.${key}`))
  }
  return []
}
