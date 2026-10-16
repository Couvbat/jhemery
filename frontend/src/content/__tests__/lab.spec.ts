import { describe, expect, it } from 'vitest'
import { decisions } from '../decisions'
import { machines } from '../hardware'
import { labLinks, labNodes, labTiers } from '../lab'

/**
 * The lab map's topology holds together: what the spec asks of `content/lab.ts`, and
 * the rule the whole map rests on, that nothing in it looks like an address.
 */
describe('the lab’s topology', () => {
  const ids = labNodes.map((node) => node.id)

  it('has unique, lower-case ids the API’s pattern accepts', () => {
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,32}$/)
  })

  it('links only nodes that exist', () => {
    for (const link of labLinks) {
      expect(ids, `${link.from} → ${link.to}`).toContain(link.from)
      expect(ids, `${link.from} → ${link.to}`).toContain(link.to)
    }
  })

  it('names real machines, real decisions, and runs services on machine nodes', () => {
    const machineNodes = labNodes.filter((node) => node.kind === 'machine').map((node) => node.id)
    for (const node of labNodes) {
      if (node.machine) expect(machines.map((m) => m.name)).toContain(node.machine)
      if (node.decision) expect(decisions.map((d) => d.id)).toContain(node.decision)
      if (node.on) expect(machineNodes, node.id).toContain(node.on)
    }
  })

  it('has tiers contiguous from 0', () => {
    const tiers = new Set(labNodes.map((node) => node.tier))
    expect([...tiers].sort()).toEqual(Array.from({ length: labTiers }, (_, i) => i))
  })

  it('draws a service in its machine’s tier', () => {
    for (const node of labNodes.filter((each) => each.on)) {
      expect(node.tier, node.id).toBe(labNodes.find((each) => each.id === node.on)!.tier)
    }
  })

  it('leaves Azazel off: it is retired', () => {
    expect(ids).not.toContain('azazel')
  })

  it('says nothing that looks like an address, a port or a URL', () => {
    const text = JSON.stringify({ labNodes, labLinks })
    expect(text).not.toMatch(/\b\d{1,3}(?:\.\d{1,3}){3}\b/)
    expect(text).not.toMatch(/:\/\/|\.(?:lan|local|home\.arpa|ts\.net)\b/)
    expect(text).not.toMatch(/[a-z0-9-]+(?:\.[a-z0-9-]+)*:\d{1,5}(?![\w.:])/i)
  })
})
