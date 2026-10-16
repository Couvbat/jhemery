import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { pushOnce } from './agent.mjs'
import { fetchAll, fetchGlances, fetchKuma, fetchTunnel } from './sources.mjs'

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const poseidon = JSON.parse(fixture('glances-poseidon.json'))

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** A fetch that answers from a table of URL → handler, and 404s anything else. */
function fakeFetch(routes) {
  const calls = []
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init })
    const handler = routes[url]
    if (!handler) return new Response('not found', { status: 404 })
    return handler(init)
  }
  return { fetcher, calls }
}

function glancesRoutes(base, version, answer) {
  return Object.fromEntries(Object.keys(answer).map((name) => [`${base}/api/${version}/${name}`, () => json(answer[name])]))
}

const config = {
  apiUrl: 'https://api.example',
  token: 't'.repeat(32),
  glances: {},
  truenas: {},
  truenasKeys: {},
  monitors: {},
  vram: {},
}

test('Glances 4 is found, and every plugin is read from /api/4/', async () => {
  const { fetcher } = fakeFetch(glancesRoutes('http://p', 4, poseidon))
  assert.deepEqual(await fetchGlances('http://p/', fetcher), poseidon)
})

test('Glances 3 is the fallback when /api/4/ is not there', async () => {
  const { fetcher, calls } = fakeFetch({ 'http://o/api/3/quicklook': () => json({ cpu: 1, mem: 2 }) })
  const answer = await fetchGlances('http://o', fetcher)
  assert.deepEqual(answer.quicklook, { cpu: 1, mem: 2 })
  assert.ok(calls.some((c) => c.url === 'http://o/api/3/load'))
})

test('a Glances that does not answer is null, so its machine reads down', async () => {
  const { fetcher } = fakeFetch({})
  assert.equal(await fetchGlances('http://gone', fetcher), null)
})

test('a source that times out leaves only its own part out', async () => {
  const hang = (_url, init) =>
    new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))
  const { fetcher: answers } = fakeFetch({
    ...glancesRoutes('http://p', 4, poseidon),
    'http://t/ready': () => json({ status: 200, readyConnections: 2 }),
  })
  const fetcher = (url, init) => (url.startsWith('http://kuma') ? hang(url, init) : answers(url, init))

  const started = Date.now()
  const raw = await fetchAll(
    { ...config, glances: { poseidon: 'http://p' }, kumaUrl: 'http://kuma', kumaKey: 'k', cloudflaredUrl: 'http://t' },
    fetcher,
  )
  assert.ok(Date.now() - started < 7_000)
  assert.equal(raw.kuma, null)
  assert.deepEqual(raw.glances.poseidon, poseidon)
  assert.deepEqual(raw.tunnel, { status: 200, readyConnections: 2 })
})

test('Kuma is read with its key as basic auth and an empty user', async () => {
  const { fetcher, calls } = fakeFetch({ 'http://k/metrics': () => new Response(fixture('kuma-metrics.txt')) })
  assert.ok((await fetchKuma('http://k/', 'secret', fetcher)).includes('monitor_status'))
  assert.equal(calls[0].init.headers.Authorization, `Basic ${Buffer.from(':secret').toString('base64')}`)
})

test('a tunnel that answers 503 is reported, not dropped', async () => {
  const { fetcher } = fakeFetch({ 'http://t/ready': () => json({ status: 503, readyConnections: 0 }, 503) })
  assert.deepEqual(await fetchTunnel('http://t', fetcher), { status: 503, readyConnections: 0 })
})

test('a push sends the snapshot with the token and logs what the API kept', async () => {
  const { fetcher, calls } = fakeFetch({
    'https://api.example/lab/snapshot': () => json({ accepted: 1, dropped: ['optimuss'] }),
  })
  assert.equal(await pushOnce(config, fetcher), 'pushed: 1 accepted, 1 dropped (optimuss)')
  const push = calls.find((c) => c.url.endsWith('/lab/snapshot'))
  assert.equal(push.init.headers.Authorization, `Bearer ${'t'.repeat(32)}`)
  assert.deepEqual(Object.keys(JSON.parse(push.init.body)), ['takenAt', 'machines', 'services'])
})

test('a refused push logs the property the API named', async () => {
  const { fetcher } = fakeFetch({
    'https://api.example/lab/snapshot': () => json({ message: ['property hostname should not exist'] }, 400),
  })
  assert.equal(await pushOnce(config, fetcher), 'push refused: 400 — property hostname should not exist')
})
