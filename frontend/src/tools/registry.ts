import type { AsyncComponentLoader } from 'vue'
import { toolInfo, type ToolInfo } from '@/content/tools'
import { isAdmin } from '@/lib/admin'

export type { ToolTier } from '@/content/tools'

export interface ToolMeta extends ToolInfo {
  /** The panel — one lazy chunk per tool, so nothing loads until one is opened. */
  load: AsyncComponentLoader
}

/** Each tool's panel, by id. Its name and description are in `content/tools.ts`. */
const panels: Record<string, AsyncComponentLoader> = {
  image: () => import('./image/ImageTool.vue'),
  hash: () => import('./hash/HashTool.vue'),
  encode: () => import('./encode/EncodeTool.vue'),
  json: () => import('./json/JsonTool.vue'),
  colour: () => import('./colour/ColourTool.vue'),
  time: () => import('./time/TimeTool.vue'),
  password: () => import('./password/PasswordTool.vue'),
  text: () => import('./text/TextTool.vue'),
  jwt: () => import('./jwt/JwtTool.vue'),
  regex: () => import('./regex/RegexTool.vue'),
  cron: () => import('./cron/CronTool.vue'),
  qr: () => import('./qr/QrTool.vue'),
  diff: () => import('./diff/DiffTool.vue'),
  acid: () => import('./acid/AcidTool.vue'),
  fingerprint: () => import('./fingerprint/FingerprintTool.vue'),
  ffmpeg: () => import('./ffmpeg/FfmpegTool.vue'),
  download: () => import('./download/DownloadTool.vue'),
}

/**
 * The tools, to the tools page what `commands/index.ts` is to the terminal: the page,
 * the `tools` command, `ls tools`, `cd tools/<id>` and Tab all derive from this array.
 * Adding a tool means one entry in `content/tools.ts`, one panel above and its folder —
 * never a special case anywhere else. `registry.spec.ts` fails on a tool with no panel.
 */
export const tools: ToolMeta[] = toolInfo.map((info) => ({ ...info, load: panels[info.id]! }))

/**
 * What a visitor is shown: everything but the admin tier, until the owner unlocks it
 * (`sudo -i` in the terminal, or the tool's own password field). `findTool` still
 * resolves a hidden tool by id — the gate is the password, not the listing — so
 * `cd tools/download` opens the panel, which asks for it.
 */
export function visibleTools(): ToolMeta[] {
  return tools.filter((tool) => tool.tier !== 'admin' || isAdmin.value)
}

export function findTool(id: string): ToolMeta | undefined {
  const needle = id.toLowerCase().replace(/\/+$/, '')
  return tools.find((tool) => tool.id === needle)
}
