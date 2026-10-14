import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import ts from 'typescript'

/**
 * Reading the source's imports off disk rather than importing it. Not a spec (the include
 * pattern wants `*.spec.ts`): the walk `import-cycles.spec.ts` draws its graph with, which
 * `fingerprint.spec.ts` follows out of the tool's folder too. Static imports, re-exports
 * and bare side-effect imports are read with TypeScript's own parser (a regex lost edges
 * across statements); type-only ones are skipped because they are erased, and dynamic
 * `import()` because it runs later.
 */

// From the working directory: under jsdom, which `fingerprint.spec.ts` runs in,
// `import.meta.url` is an http: URL.
export const SRC = join(process.cwd(), 'src')

export function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path)
    return /\.(ts|vue)$/.test(name) && !name.endsWith('.d.ts') ? [path] : []
  })
}

/** The code a file contributes: all of a `.ts`, the `<script>` blocks of a `.vue`. */
export function scriptOf(path: string): string {
  const source = readFileSync(path, 'utf8')
  if (!path.endsWith('.vue')) return source
  return [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n')
}

/** Runtime specifiers: `import … from`, `export … from` and bare `import '…'`, minus type-only ones. */
export function runtimeImports(code: string): string[] {
  const out: string[] = []
  const file = ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause
      // `import type …`, or `import { type A, type B }`, imports nothing at runtime.
      const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : undefined
      const typeOnly = clause?.isTypeOnly || (clause && !clause.name && named?.length && named.every((e) => e.isTypeOnly))
      if (!typeOnly) out.push(statement.moduleSpecifier.text)
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const named = statement.exportClause && ts.isNamedExports(statement.exportClause) ? statement.exportClause.elements : undefined
      const typeOnly = statement.isTypeOnly || (named?.length && named.every((e) => e.isTypeOnly))
      if (!typeOnly) out.push(statement.moduleSpecifier.text)
    }
  }
  return out
}

export function resolveImport(from: string, specifier: string): string | undefined {
  let base: string
  if (specifier.startsWith('@/')) base = join(SRC, specifier.slice(2))
  else if (specifier.startsWith('.')) base = resolve(dirname(from), specifier)
  else return undefined // a package, not ours
  for (const candidate of [base, `${base}.ts`, `${base}.vue`, join(base, 'index.ts')]) {
    if (/\.(ts|vue)$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return undefined // css, json, an asset
}
