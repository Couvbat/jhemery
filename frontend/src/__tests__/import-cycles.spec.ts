// @vitest-environment node
// Reads source files off disk rather than importing them, like content/purity.spec.ts.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * No new import cycles. A cycle is harmless until something in it runs at import time,
 * and then it fails only in the one load order nobody tried; the registry's did, during
 * an HMR reload. The walk is dependency-free: static imports and re-exports, with type-only
 * ones skipped because they are erased, and dynamic `import()` skipped because it runs
 * later.
 *
 * The allowlist is the cycles that exist on purpose. The registry's is matched by
 * pattern, so a command module may import the registry (help, alias, and later strace,
 * why, tour and man do) while anything outside `terminal/commands/` joining it fails.
 * `terminal/__tests__/registry-load.spec.ts` is what proves that cycle loads safely.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url))

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

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path)
    return /\.(ts|vue)$/.test(name) && !name.endsWith('.d.ts') ? [path] : []
  })
}

/** The code a file contributes: all of a `.ts`, the `<script>` blocks of a `.vue`. */
function scriptOf(path: string): string {
  const source = readFileSync(path, 'utf8')
  if (!path.endsWith('.vue')) return source
  return [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n')
}

/** Runtime specifiers: `import … from`, `export … from` and bare `import '…'`, minus type-only ones. */
function runtimeImports(code: string): string[] {
  const out: string[] = []
  const statement = /(?:^|[\n;])\s*(import|export)\s+([\s\S]*?)\s*from\s*['"]([^'"]+)['"]|(?:^|[\n;])\s*import\s*['"]([^'"]+)['"]/g
  for (const m of code.matchAll(statement)) {
    if (m[4]) {
      out.push(m[4])
      continue
    }
    const clause = m[2]!
    if (/^type\b/.test(clause)) continue
    // `import { type A, type B } from` imports nothing at runtime.
    const named = clause.match(/^\{([\s\S]*)\}$/)
    if (named && named[1]!.split(',').every((part) => !part.trim() || /^type\b/.test(part.trim()))) continue
    out.push(m[3]!)
  }
  return out
}

function resolveImport(from: string, specifier: string): string | undefined {
  let base: string
  if (specifier.startsWith('@/')) base = join(SRC, specifier.slice(2))
  else if (specifier.startsWith('.')) base = resolve(dirname(from), specifier)
  else return undefined // a package, not ours
  for (const candidate of [base, `${base}.ts`, `${base}.vue`, join(base, 'index.ts')]) {
    if (/\.(ts|vue)$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return undefined // css, json, an asset
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
