import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { kumaServices, parseMetrics } from './prometheus.mjs'

const metrics = readFileSync(new URL('./fixtures/kuma-metrics.txt', import.meta.url), 'utf8')

test('parses samples with labels, skipping comments and junk', () => {
  const samples = parseMetrics(metrics)
  assert.ok(samples.every((s) => typeof s.value === 'number'))
  assert.equal(samples.filter((s) => s.name === 'monitor_status').length, 6)
  assert.deepEqual(parseMetrics('up 1\n# c\nnot one\nx{a="b"} 2 1700000000'), [
    { name: 'up', labels: {}, value: 1 },
    { name: 'x', labels: { a: 'b' }, value: 2 },
  ])
})

test('label values keep escaped quotes and commas', () => {
  const [sample] = parseMetrics('m{monitor_name="Gnome \\"bot\\", v2",x="y"} 1')
  assert.equal(sample.labels.monitor_name, 'Gnome "bot", v2')
  assert.equal(sample.labels.x, 'y')
})

test('Kuma statuses map to up, down and maintenance; pending is not yet an outage', () => {
  const services = kumaServices(metrics, { Umami: 'umami', n8n: 'n8n', Odysseus: 'odysseus', 'Gnome "bot"': 'gnome' })
  assert.deepEqual(Object.fromEntries(services.map((s) => [s.id, s.status])), {
    umami: 'up',
    n8n: 'down',
    odysseus: 'maintenance',
    gnome: 'up',
  })
})

test('only mapped monitors, and never a label but the name', () => {
  assert.deepEqual(kumaServices(metrics, { Umami: 'umami' }), [{ id: 'umami', latencyMs: 41, status: 'up' }])
})

test('a monitor with a response time but no status is not sent', () => {
  assert.deepEqual(kumaServices('monitor_response_time{monitor_name="A"} 5', { A: 'a' }), [])
})
