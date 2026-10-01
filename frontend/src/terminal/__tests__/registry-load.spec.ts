import { describe, expect, it, vi } from 'vitest'

/**
 * `registry.ts`, `commands/index.ts` and `commands/core.ts` import each other (help and
 * alias need the registry). A clean page load enters the registry first, which is the
 * one order that always worked; an HMR reload once entered `core.ts` first and threw
 * `Cannot access 'coreCommands' before initialization`. Entering through every module
 * in turn, from an empty module cache, is what reproduces it.
 *
 * The loaders come from `import.meta.glob` so `vi.resetModules()` takes effect: a
 * static import at the top of this file would be evaluated once, in one order.
 */
const entries: Record<string, () => Promise<unknown>> = {
  ...import.meta.glob('../commands/**/*.ts'),
  '../registry.ts': () => import('../registry'),
}

describe('the command registry loads whichever module is entered first', () => {
  it('finds the modules to enter through', () => {
    expect(Object.keys(entries)).toContain('../commands/core.ts')
    expect(Object.keys(entries)).toContain('../commands/index.ts')
  })

  it.each(Object.keys(entries).sort())('entering through %s', async (entry) => {
    vi.resetModules()
    // Asserting that the import resolves, not on the message: under vitest's module
    // runner the failure is sometimes a TypeError rather than the browser's TDZ error.
    await expect(entries[entry]!()).resolves.toBeDefined()
    const registry = await import('../registry')
    expect(registry.allCommands().length).toBeGreaterThan(70)
    expect(registry.resolve('help')?.name).toBe('help')
  })
})
