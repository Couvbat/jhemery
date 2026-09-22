import type { AsyncComponentLoader } from 'vue'
import type { Localised } from '@/content/types'

/** Which tier of the design spec a tool sits in (§5). `wasm` tools announce their
 *  download before starting it; `admin` tools only exist after the owner unlocks them. */
export type ToolTier = 'client' | 'wasm' | 'admin'

export interface ToolMeta {
  /** URL segment (`/tools/<id>`) and what `cd tools/<id>` takes. Lowercase. */
  id: string
  name: Localised
  description: Localised
  /** Extra words the palette and `ls tools` match on; nothing else reads them. */
  keywords: string[]
  tier: ToolTier
  /** The panel — one lazy chunk per tool, so nothing loads until one is opened. */
  load: AsyncComponentLoader
}

/**
 * The tools, to the tools page what `commands/index.ts` is to the terminal: the page,
 * the `tools` command, `ls tools`, `cd tools/<id>` and Tab all derive from this array.
 * Adding a tool means adding one object here plus its folder — never a special case
 * anywhere else. It is not under `src/content` because `load` imports components.
 */
export const tools: ToolMeta[] = [
  {
    id: 'image',
    name: { en: 'Image converter', fr: "Convertisseur d'images" },
    description: {
      en: 'PNG, JPEG or WebP — resize, recompress, and drop the metadata',
      fr: 'PNG, JPEG ou WebP — redimensionner, recompresser, effacer les métadonnées',
    },
    keywords: ['png', 'jpeg', 'jpg', 'webp', 'resize', 'exif', 'compress'],
    tier: 'client',
    load: () => import('./image/ImageTool.vue'),
  },
  {
    id: 'hash',
    name: { en: 'Hash & checksum', fr: 'Hash & checksum' },
    description: {
      en: 'SHA-1, SHA-256 or SHA-512 of a text or a file',
      fr: "SHA-1, SHA-256 ou SHA-512 d'un texte ou d'un fichier",
    },
    keywords: ['sha256', 'sha1', 'sha512', 'checksum', 'digest'],
    tier: 'client',
    load: () => import('./hash/HashTool.vue'),
  },
  {
    id: 'encode',
    name: { en: 'Encode & decode', fr: 'Encoder & décoder' },
    description: {
      en: 'Base64, URL encoding and hex, both ways',
      fr: 'Base64, encodage URL et hexadécimal, dans les deux sens',
    },
    keywords: ['base64', 'url', 'hex', 'percent', 'utf-8'],
    tier: 'client',
    load: () => import('./encode/EncodeTool.vue'),
  },
  {
    id: 'json',
    name: { en: 'JSON formatter', fr: 'Formateur JSON' },
    description: {
      en: 'Pretty-print or minify, and point at the error when it is not JSON',
      fr: "Indenter ou minifier, et pointer l'erreur quand ce n'est pas du JSON",
    },
    keywords: ['json', 'format', 'pretty', 'minify', 'validate'],
    tier: 'client',
    load: () => import('./json/JsonTool.vue'),
  },
]

export function findTool(id: string): ToolMeta | undefined {
  const needle = id.toLowerCase().replace(/\/+$/, '')
  return tools.find((tool) => tool.id === needle)
}
