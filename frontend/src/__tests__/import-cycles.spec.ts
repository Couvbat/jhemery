// @vitest-environment node
// Reads source files off disk rather than importing them, like content/purity.spec.ts.
import { relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SRC, resolveImport, runtimeImports, scriptOf, sourceFiles } from './imports'

/**
 * No new import cycles. A cycle is harmless until something in it runs at import time,
 * and then it fails only in the one load order nobody tried; the registry's did, during
 * an HMR reload. The walk (`imports.ts`) reads runtime imports only: type-only ones are
 * erased, and a dynamic `import()` runs later.
 *
 * The allowlist is the cycles that exist on purpose. The registry's is matched by
 * pattern, so a command module may import the registry (help, alias, and later strace,
 * why, tour and man do) while anything outside `terminal/commands/` joining it fails.
 * `terminal/__tests__/registry-load.spec.ts` is what proves that cycle loads safely.
 */

const ALLOWED: Array<{ name: string; matches: (members: string[]) => boolean }> = [
  exactly('shadcn button', ['components/ui/button/Button.vue', 'components/ui/button/index.ts']),
  exactly('shadcn badge', ['components/ui/badge/Badge.vue', 'components/ui/badge/index.ts']),
  {
    name: 'the command registry',
    matches: (members) =>
      members.includes('terminal/registry.ts') &&
      members.every((m) => m === 'terminal/registry.ts' || m.startsWith('terminal/commands/')),
  },
]

function exactly(name: string, files: string[]) {
  return { name, matches: (members: string[]) => members.length === files.length && files.every((f) => members.includes(f)) }
}

/** Tarjan's strongly connected components, keeping only actual cycles. */
function cycles(graph: Map<string, string[]>): string[][] {
  let counter = 0
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const found: string[][] = []

  const visit = (node: string) => {
    index.set(node, counter)
    low.set(node, counter)
    counter++
    stack.push(node)
    onStack.add(node)
    for (const next of graph.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next)
        low.set(node, Math.min(low.get(node)!, low.get(next)!))
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node)!, index.get(next)!))
      }
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = []
      let member: string
      do {
        member = stack.pop()!
        onStack.delete(member)
        component.push(member)
      } while (member !== node)
      if (component.length > 1 || (graph.get(node) ?? []).includes(node)) found.push(component.sort())
    }
  }

  for (const node of graph.keys()) if (!index.has(node)) visit(node)
  return found
}

const graph = new Map<string, string[]>()
for (const file of sourceFiles(SRC)) {
  const edges = runtimeImports(scriptOf(file))
    .map((specifier) => resolveImport(file, specifier))
    .filter((target): target is string => Boolean(target))
  graph.set(relative(SRC, file), [...new Set(edges.map((target) => relative(SRC, target)))])
}
const found = cycles(graph)

describe('reading imports', () => {
  it('keeps a bare side-effect import that another import follows', () => {
    expect(runtimeImports("import './register'\nimport { x } from './x'")).toEqual(['./register', './x'])
  })

  it('keeps a runtime import that follows an exported type', () => {
    expect(runtimeImports("export type T = number\nexport { a } from './a'")).toEqual(['./a'])
    expect(runtimeImports("export type T = number\nimport { a } from './a'")).toEqual(['./a'])
  })

  it('drops imports that are erased, and only those', () => {
    expect(runtimeImports("import type { A } from './a'")).toEqual([])
    expect(runtimeImports("import { type A, type B } from './a'")).toEqual([])
    expect(runtimeImports("import { type A, b } from './a'")).toEqual(['./a'])
    expect(runtimeImports("export type { A } from './a'")).toEqual([])
    expect(runtimeImports("export * from './a'")).toEqual(['./a'])
    expect(runtimeImports("const later = () => import('./a')")).toEqual([])
  })
})

describe('import cycles', () => {
  it('walks the source tree', () => {
    expect(graph.size).toBeGreaterThan(150)
    expect(graph.get('terminal/registry.ts')).toContain('terminal/commands/index.ts')
  })

  it('has none beyond the ones allowed on purpose', () => {
    const unexpected = found.filter((members) => !ALLOWED.some((allowed) => allowed.matches(members)))
    expect(unexpected, unexpected.map((members) => `cycle: ${members.join(' → ')}`).join('\n')).toEqual([])
  })

  // A stale entry would quietly allow a future cycle with the same shape.
  it.each(ALLOWED.map((allowed) => [allowed.name, allowed] as const))('still needs the %s entry', (_name, allowed) => {
    expect(found.some((members) => allowed.matches(members))).toBe(true)
  })
})
