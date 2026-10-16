import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { looksLikeAddress } from './address.mjs'
import { buildSnapshot, checkSnapshot, uptimeSeconds } from './snapshot.mjs'
import { options, rawAnswers, TAKEN_AT } from './fixtures/raw.mjs'

const expected = JSON.parse(readFileSync(new URL('./fixtures/expected-snapshot.json', import.meta.url), 'utf8'))
const nearMisses = JSON.parse(readFileSync(new URL('./fixtures/near-misses.json', import.meta.url), 'utf8'))

test('the fixtures make exactly the expected snapshot', () => {
  assert.deepEqual(buildSnapshot(rawAnswers(), options, TAKEN_AT), expected)
})

test('nothing address-shaped from any source reaches the output', () => {
  const text = JSON.stringify(buildSnapshot(rawAnswers(), options, TAKEN_AT))
  // Each of these is in a fixture: a Glances field, a container's ports, Kuma's URLs, a
  // pool and a model named like an address, an fs device named like one, the tunnel's id.
  for (const leak of ['192.168', '0.0.0.0', '.lan', 'home.arpa', 'npm.lan:81', 'http', '10.0.0.5', 'connectorId', '6c8b3e2a']) {
    assert.ok(!text.includes(leak), `${leak} leaked`)
  }
  assert.doesNotThrow(() => checkSnapshot(JSON.parse(text)))
})

test('a Kuma monitor not in the map is never sent', () => {
  const snapshot = buildSnapshot(rawAnswers(), options, TAKEN_AT)
  assert.ok(!JSON.stringify(snapshot).includes('Vaultwarden'))
  assert.ok(!snapshot.services.some((s) => s.id === 'vaultwarden'))
})

test('container names stay home: only the running count goes', () => {
  const [poseidon] = buildSnapshot(rawAnswers(), options, TAKEN_AT).machines
  assert.equal(poseidon.containers, 3)
  assert.ok(!JSON.stringify(poseidon).includes('ollama'))
})

test('a machine whose Glances failed is up: false and nothing more', () => {
  const raw = { ...rawAnswers(), glances: { poseidon: null } }
  assert.deepEqual(buildSnapshot(raw, options, TAKEN_AT).machines, [{ id: 'poseidon', up: false }])
})

test('a source that failed leaves only its own part out', () => {
  const full = buildSnapshot(rawAnswers(), options, TAKEN_AT)
  const noKuma = buildSnapshot({ ...rawAnswers(), kuma: null }, options, TAKEN_AT)
  assert.deepEqual(noKuma.services, [])
  assert.deepEqual(noKuma.machines, full.machines)
  assert.deepEqual(noKuma.models, full.models)

  const noOllama = buildSnapshot({ ...rawAnswers(), ollama: null, tunnel: null }, options, TAKEN_AT)
  assert.equal(noOllama.models, undefined)
  assert.equal(noOllama.tunnel, undefined)
  assert.deepEqual(noOllama.services, full.services)
})

test('an Ollama that answers neither route is a runtime that is down', () => {
  const snapshot = buildSnapshot({ ...rawAnswers(), ollama: { ps: null, tags: null } }, options, TAKEN_AT)
  assert.deepEqual(snapshot.models, { runtime: 'down', resident: [], installed: [] })
})

test('without TrueNAS, pools come from Glances with fill alone', () => {
  const raw = { ...rawAnswers(), pools: {} }
  const [poseidon] = buildSnapshot(raw, options, TAKEN_AT).machines
  assert.deepEqual(poseidon.pools, [{ name: 'tank', used: 0.612 }])
})

test('without its VRAM configured, a GPU keeps its temperature and sends no usage', () => {
  const [poseidon] = buildSnapshot(rawAnswers(), { ...options, vram: {} }, TAKEN_AT).machines
  assert.equal(poseidon.gpu, undefined)
  assert.equal(poseidon.tempC.gpu, 44)
})

test('checkSnapshot refuses anything address-shaped, wherever it is', () => {
  const bad = {
    takenAt: TAKEN_AT.toISOString(),
    machines: [{ id: 'x', up: true, pools: [{ name: '10.0.0.1', used: 0 }] }],
    services: [],
  }
  assert.throws(() => checkSnapshot(bad), /machines\[0\]\.pools\[0\]\.name/)
})

test('the address rules: the near misses are refused, the real names pass', () => {
  for (const name of nearMisses.refused) assert.ok(looksLikeAddress(name), `${name} should be refused`)
  for (const name of nearMisses.accepted) assert.ok(!looksLikeAddress(name), `${name} should pass`)
})

test('Glances uptime, as text or as seconds', () => {
  assert.equal(uptimeSeconds('12 days, 3:04:05'), 12 * 86_400 + 3 * 3_600 + 4 * 60 + 5)
  assert.equal(uptimeSeconds('1 day, 0:00:01'), 86_401)
  assert.equal(uptimeSeconds('3:04:05'), 11_045)
  assert.equal(uptimeSeconds(42.4), 42)
  assert.equal(uptimeSeconds('soon'), undefined)
  assert.equal(uptimeSeconds(undefined), undefined)
})
