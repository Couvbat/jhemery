/**
 * What x-ray mode's build writes and its page reads: `vite-plugins/xray.ts` stamps these
 * attributes and serves the map, `lib/xray.ts` reads them. On its own, with no DOM in
 * it and no imports, because the plugin loads it in Node, outside the `@` alias.
 */

/** On each root element of a template: the repo path of the file that wrote it. */
export const SRC_ATTR = 'data-src'

/**
 * On a component's root when that root is itself a component (`HashTool.vue`'s template
 * is one `<ToolFrame>`): the outer file. An attribute on a component falls through onto
 * the inner one's root element, and under `data-src` it would overwrite the inner name,
 * so the frame would read `HashTool.vue` and `ToolFrame.vue` would never show.
 */
export const OUTER_ATTR = 'data-src-outer'

/** What the build resolves for each component, by repo path: the files its words come from. */
export type XrayMap = Record<string, string[]>
