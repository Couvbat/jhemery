import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pairs, readConfig } from './config.mjs'

const TOKEN = 'x'.repeat(32)

test('pairs split on the first equals sign and skip the malformed', () => {
  assert.deepEqual(pairs('poseidon=http://a/?x=1, optimus = http://b ,=bad,lonely'), {
    poseidon: 'http://a/?x=1',
    optimus: 'http://b',
  })
  assert.deepEqual(pairs(undefined), {})
})

test('a short token or a missing API URL is a problem, said before anything runs', () => {
  assert.deepEqual(readConfig({ LAB_API_URL: 'https://api.example', LAB_INGEST_TOKEN: TOKEN }).problems, [])
  assert.equal(readConfig({ LAB_API_URL: 'https://api.example', LAB_INGEST_TOKEN: 'short' }).problems.length, 1)
  assert.equal(readConfig({ LAB_INGEST_TOKEN: TOKEN }).problems.length, 1)
})

test('the interval defaults to a minute and never goes under thirty seconds', () => {
  assert.equal(readConfig({}).intervalMs, 60_000)
  assert.equal(readConfig({ LAB_INTERVAL_S: '5' }).intervalMs, 30_000)
  assert.equal(readConfig({ LAB_INTERVAL_S: '120' }).intervalMs, 120_000)
})

test('the GPU memory is a number per machine', () => {
  assert.deepEqual(readConfig({ LAB_GPU_VRAM_MB: 'poseidon=10240,optimus=nope' }).vram, { poseidon: 10240 })
})
