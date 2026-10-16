import { describe, expect, it } from 'vitest'
import { findLabNode, labNodes, type LabNode } from '@/content/lab'
import {
  age,
  feedLine,
  feedOf,
  gigabytes,
  machineState,
  nodeFigures,
  nodeState,
  percent,
  poolLine,
  uptime,
  uptimeAverage,
  uptimeSummary,
} from '../lab'
import { EMPTY, liveReport, OFF, SNAPSHOT } from './lab-fixture'

const node = (id: string): LabNode => findLabNode(id)!

describe('the feed', () => {
  it('reads live, stale, empty, off and unreachable', () => {
    expect(feedOf(liveReport())).toBe('live')
    expect(feedOf(liveReport(6 * 60_000))).toBe('stale')
    expect(feedOf(EMPTY)).toBe('empty')
    expect(feedOf(OFF)).toBe('off')
    expect(feedOf(null)).toBe('unreachable')
  })

  it('says what the colours are worth, in both languages', () => {
    expect(feedLine(liveReport(42_000), 'en')).toBe('live · snapshot 42 s old')
    expect(feedLine(liveReport(42_000), 'fr')).toBe('en direct · instantané vieux de 42 s')
    expect(feedLine(liveReport(3 * 3_600_000), 'en')).toBe('last seen 3 h ago — the lab may be asleep')
    expect(feedLine(OFF, 'en')).toBe('live data is off here')
    expect(feedLine(null, 'fr')).toBe('l’API ne répond pas')
    expect(feedLine(EMPTY, 'en')).toBe('the lab hasn’t reported yet')
  })
})

describe('a node’s state', () => {
  it('reads machines and services off the snapshot', () => {
    const report = liveReport()
    expect(nodeState(node('poseidon'), report)).toBe('up')
    expect(nodeState(node('umami'), report)).toBe('up')
    expect(nodeState(node('n8n'), report)).toBe('down')
    expect(nodeState(node('odysseus'), report)).toBe('degraded')
    expect(nodeState(node('kuma'), report)).toBe('nodata')
  })

  it('reads the tunnel, the model runtime, Glances and the agent from their own parts', () => {
    const report = liveReport()
    expect(nodeState(node('tunnel'), report)).toBe('up')
    expect(nodeState(node('ollama'), report)).toBe('up')
    expect(nodeState(node('glances'), report)).toBe('up')
    expect(nodeState(node('lab-agent'), report)).toBe('up')
    const down = liveReport(40_000, { ...SNAPSHOT, tunnel: { healthy: false, connections: 0 }, models: { runtime: 'down', resident: [], installed: [] } })
    expect(nodeState(node('tunnel'), down)).toBe('down')
    expect(nodeState(node('ollama'), down)).toBe('down')
  })

  it('calls the whole lab stale, never down, once the snapshot is old', () => {
    const report = liveReport(6 * 60_000)
    for (const id of ['poseidon', 'n8n', 'tunnel', 'lab-agent']) expect(nodeState(node(id), report), id).toBe('stale')
    // The API answered, and this page came through the site and Cloudflare.
    expect(nodeState(node('o2switch-api'), report)).toBe('up')
    expect(nodeState(node('cloudflare'), report)).toBe('up')
  })

  it('has no data for the lab with the feed off, and the API down only when it did not answer', () => {
    expect(nodeState(node('poseidon'), OFF)).toBe('nodata')
    expect(nodeState(node('o2switch-api'), OFF)).toBe('up')
    expect(nodeState(node('o2switch-api'), null)).toBe('down')
    expect(nodeState(node('o2switch-api'), undefined)).toBe('nodata')
  })

  it('gives the visitor and the private network no status at all', () => {
    expect(nodeState(node('visitor'), liveReport())).toBe('none')
    expect(nodeState(node('tailscale'), liveReport())).toBe('none')
  })

  it('reads a machine with an unhealthy pool as degraded, and a pool with no health word as fine', () => {
    expect(machineState({ id: 'x', up: true, pools: [{ name: 'tank', health: 'DEGRADED', used: 0.5 }] })).toBe('degraded')
    expect(machineState({ id: 'x', up: true, pools: [{ name: 'tank', used: 0.5 }] })).toBe('up')
    expect(machineState({ id: 'x', up: false })).toBe('down')
    expect(machineState(undefined)).toBe('nodata')
  })

  it('has a state for every node the map draws', () => {
    for (const each of labNodes) expect(['up', 'down', 'degraded', 'stale', 'nodata', 'none']).toContain(nodeState(each, liveReport()))
  })
})

describe('figures', () => {
  it('gives a machine its CPU and temperature, a service its latency', () => {
    expect(nodeFigures(node('poseidon'), liveReport(), 'en')).toEqual(['CPU 8 %', '47 °C'])
    expect(nodeFigures(node('umami'), liveReport(), 'en')).toEqual(['41 ms'])
    expect(nodeFigures(node('odysseus'), liveReport(), 'en')).toEqual(['maintenance'])
    expect(nodeFigures(node('tunnel'), liveReport(), 'en')).toEqual(['4 connections'])
    expect(nodeFigures(node('tunnel'), liveReport(), 'fr')).toEqual(['4 connexions'])
    expect(nodeFigures(node('ollama'), liveReport(), 'fr')).toEqual(['1 chargé'])
    expect(nodeFigures(node('poseidon'), OFF, 'en')).toEqual([])
  })

  it('formats numbers in each language', () => {
    expect(percent(99.25, 'en', 1)).toBe('99.3 %')
    expect(percent(99.25, 'fr', 1)).toBe('99,3 %')
    expect(gigabytes(2150, 'en')).toBe('2.1 GB')
    expect(gigabytes(10240, 'fr')).toBe('10 Go')
    expect(uptime(12 * 86_400 + 3_600, 'en')).toBe('12 days')
    expect(uptime(12 * 86_400, 'fr')).toBe('12 jours')
    expect(uptime(5 * 3_600, 'en')).toBe('5 h')
    expect(uptime(180, 'en')).toBe('3 min')
    expect(age(42_400, 'en')).toBe('42 s')
    expect(age(3 * 86_400_000, 'fr')).toBe('3 j')
  })

  it('says a pool’s health and fill, or the fill alone', () => {
    expect(poolLine({ name: 'tank', health: 'ONLINE', used: 0.61 }, 'en')).toBe('tank ONLINE, 61 % used')
    expect(poolLine({ name: 'data', used: 0.744 }, 'fr')).toBe('data, 74 % occupé')
  })
})

describe('the 30-day bar', () => {
  it('averages the days there is data for, and says when there is none', () => {
    expect(uptimeAverage([null, 1, 0.98])).toBeCloseTo(0.99)
    expect(uptimeAverage([null, null])).toBeNull()
    expect(uptimeSummary([1, 1, null], 'en')).toBe('30-day uptime 100 %')
    expect(uptimeSummary([1, 0.984], 'en')).toBe('30-day uptime 99.2 %')
    expect(uptimeSummary([null], 'fr')).toBe('aucune donnée sur 30 jours')
  })
})
