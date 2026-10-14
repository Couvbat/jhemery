import type { Localised } from '@/content/types'
import { digest, digestText, toHex } from '../hash/hash'

/**
 * What any page can read about a browser without a permission prompt, row by row, and
 * what each value is for. The panel and the shell's `/proc/self` files both read from
 * here, so `cat /proc/self/gpu` and the page cannot disagree about a value.
 *
 * Pure: the browser comes in as a `FingerprintEnv` (`environment.ts` builds the real
 * one), so the specs hand it fakes, and nothing is read until a function here is called.
 * The site reads none of this anywhere else: the panel opening or a `/proc/self` file
 * being read is the only time it happens. Nothing here sends anything anywhere, and
 * `fingerprint.spec.ts` holds the folder to that.
 *
 * There is deliberately no uniqueness score. An honest one needs to know how many other
 * browsers share each value, which this site doesn't, and "1 in 200 000" without that is
 * the kind of number the case studies refuse to print. The page shows a combined hash
 * instead, and which rows feed it.
 */

export type Group = 'browser' | 'locale' | 'screen' | 'hardware' | 'preferences' | 'gpu' | 'render'

/** Whether a site has any ordinary use for a value: the page's one-word answer per row. */
export type Verdict = 'common' | 'rare' | 'none'

interface UserAgentDataLike {
  brands?: ReadonlyArray<{ brand: string; version: string }>
  mobile?: boolean
  platform?: string
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>
}

/** `Navigator`, plus the two Chromium-only fields the DOM typings don't carry. */
export interface NavigatorLike {
  userAgent?: string
  language?: string
  languages?: readonly string[]
  hardwareConcurrency?: number
  maxTouchPoints?: number
  deviceMemory?: number
  userAgentData?: UserAgentDataLike
}

export interface FingerprintEnv {
  navigator: NavigatorLike
  screen?: Pick<Screen, 'width' | 'height' | 'colorDepth'>
  devicePixelRatio?: number
  matchMedia?: (query: string) => { matches: boolean }
  intl: Pick<typeof Intl, 'DateTimeFormat'>
  /** A fresh, detached canvas, or null where there is none (jsdom). */
  canvas: () => HTMLCanvasElement | null
  /** A fresh offline (silent) audio context, or null where there is none. */
  offlineAudio: (channels: number, length: number, sampleRate: number) => OfflineAudioContext | null
  /** Web Crypto's digests, which only exist in a secure context. */
  subtle?: SubtleCrypto
}

export interface Row {
  /** The key `/proc/self` prints and the combined hash is built from. */
  id: string
  group: Group
  /** Where the value comes from, as code. */
  source: string
  label: Localised
  /** What the value is, and whether a site has an ordinary use for it. */
  use: Localised
  verdict: Verdict
}

/** A row as read: `value` is null when this browser doesn't give it. */
export interface Reading extends Row {
  value: string | null
}

type Value = string | null

/** What a read can draw on. WebGL is shared by two rows and opened once per read. */
interface Probe {
  env: FingerprintEnv
  gl: () => { vendor: Value; renderer: Value } | null
}

/** A row read synchronously (`now`), or one that has to render or ask first (`later`). */
export type Spec = Row & ({ now: (probe: Probe) => Value } | { later: (probe: Probe) => Promise<Value> })

export const GROUPS: Record<Group, Localised> = {
  browser: { en: 'Browser', fr: 'Navigateur' },
  locale: { en: 'Language and time', fr: 'Langue et heure' },
  screen: { en: 'Screen', fr: 'Écran' },
  hardware: { en: 'Hardware', fr: 'Matériel' },
  preferences: { en: 'Preferences', fr: 'Préférences' },
  gpu: { en: 'Graphics', fr: 'Graphisme' },
  render: { en: 'Renders', fr: 'Rendus' },
}

/**
 * The groups the shell has a `/proc/self/<group>` file for, in `ls` order. `cat` can't
 * wait on a render, so every row in them is read at once; `proc.spec.ts` holds them to it.
 */
export const SHELL_GROUPS = ['gpu', 'hardware', 'locale', 'screen'] as const satisfies readonly Group[]

/** What a row reads as when this browser doesn't give it — on the page and in the shell. */
export const NOT_AVAILABLE: Localised = { en: 'not available', fr: 'non disponible' }

/** The value a media feature takes, out of the ones it can: null if none matches, which
 *  is how a browser that doesn't know the feature answers. */
function media(env: FingerprintEnv, feature: string, values: readonly string[]): Value {
  if (!env.matchMedia) return null
  return values.find((value) => env.matchMedia!(`(${feature}: ${value})`).matches) ?? null
}

function preference(
  feature: string,
  values: readonly string[],
  label: Localised,
  use: Localised,
): Spec {
  return {
    id: feature,
    group: 'preferences',
    source: `matchMedia('(${feature})')`,
    label,
    use,
    verdict: 'common',
    now: ({ env }) => media(env, feature, values),
  }
}

/** A positive number as the browser gave it, or null. */
function count(value: number | undefined): Value {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? String(value) : null
}

/** Long enough to tell renders apart on screen; the combined hash takes all of it. */
function shortHex(buffer: ArrayBuffer): string {
  return toHex(buffer).slice(0, 16)
}

/** Resolves null after `ms`: an offline render a backgrounded Safari tab never finishes
 *  must not leave its row saying "reading…" for good. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * The vendor and renderer strings. The plain `VENDOR`/`RENDERER` come first: Chromium
 * and Safari mask them as "WebKit…", and only then is the debug extension asked for the
 * real ones. Firefox answers the plain parameters directly and warns in the console
 * when the deprecated extension is requested, so it never is there.
 */
function readGl(env: FingerprintEnv): { vendor: Value; renderer: Value } | null {
  const canvas = env.canvas()
  const gl = (canvas?.getContext('webgl') ?? null) as WebGLRenderingContext | null
  if (!gl) return null
  try {
    const text = (value: unknown): Value => (typeof value === 'string' && value ? value : null)
    let vendor = text(gl.getParameter(gl.VENDOR))
    let renderer = text(gl.getParameter(gl.RENDERER))
    if (!renderer || renderer.startsWith('WebKit')) {
      const debug = gl.getExtension('WEBGL_debug_renderer_info')
      if (debug) {
        vendor = text(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) ?? vendor
        renderer = text(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) ?? renderer
      }
    }
    return { vendor, renderer }
  } finally {
    // Browsers cap live WebGL contexts, and the background holds one already.
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

/**
 * Text and overlapping shapes drawn off-screen, read back and hashed. Fonts,
 * anti-aliasing and the GPU each nudge the pixels. The colours are never shown to
 * anyone, so they are not the theme's: only the bytes they produce matter.
 */
async function canvasRender({ env }: Probe): Promise<Value> {
  const canvas = env.canvas()
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx || !env.subtle) return null
  canvas.width = 240
  canvas.height = 60
  const text = 'Cwm fjordbank glyphs vext quiz, 😃 ½ é'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#f60'
  ctx.fillRect(110, 1, 62, 20)
  ctx.fillStyle = '#069'
  ctx.font = '14px Arial'
  ctx.fillText(text, 2, 15)
  ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
  ctx.font = '18px "Times New Roman"'
  ctx.fillText(text, 4, 45)
  ctx.globalCompositeOperation = 'multiply'
  for (const [x, colour] of [[40, '#f0f'], [70, '#0ff'], [55, '#ff0']] as const) {
    ctx.fillStyle = colour
    ctx.beginPath()
    ctx.arc(x, 30, 22, 0, Math.PI * 2)
    ctx.fill()
  }
  return shortHex(await digestText('SHA-256', canvas.toDataURL(), env.subtle))
}

/**
 * A triangle wave at 10 kHz through a hard compressor, rendered offline (nothing is
 * played) and the tail of its samples hashed. Engines and processors round the
 * floating-point maths slightly differently.
 */
async function audioRender({ env }: Probe): Promise<Value> {
  const context = env.offlineAudio(1, 5000, 44_100)
  if (!context || !env.subtle) return null
  const oscillator = context.createOscillator()
  oscillator.type = 'triangle'
  oscillator.frequency.value = 10_000
  const compressor = context.createDynamicsCompressor()
  compressor.threshold.value = -50
  compressor.knee.value = 40
  compressor.ratio.value = 12
  compressor.attack.value = 0
  compressor.release.value = 0.25
  oscillator.connect(compressor)
  compressor.connect(context.destination)
  oscillator.start(0)
  const buffer = await within(context.startRendering(), 2_000)
  if (!buffer) return null
  return shortHex(await digest('SHA-256', buffer.getChannelData(0).slice(4_500), env.subtle))
}

/** `getHighEntropyValues`: the detail the frozen user agent dropped, handed to any page
 *  that asks, with no prompt. */
async function fullHints({ env }: Probe): Promise<Value> {
  const data = env.navigator.userAgentData
  if (!data?.getHighEntropyValues) return null
  const v = await data.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion', 'fullVersionList'])
  const str = (key: string) => (typeof v[key] === 'string' && v[key] ? (v[key] as string) : '')
  const versions = Array.isArray(v.fullVersionList)
    ? (v.fullVersionList as Array<{ brand: string; version: string }>).map((b) => `${b.brand} ${b.version}`).join(', ')
    : ''
  const parts = [
    [str('platform'), str('platformVersion')].filter(Boolean).join(' '),
    [str('architecture'), str('bitness') && `${str('bitness')}-bit`].filter(Boolean).join(' '),
    str('model'),
    versions,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

export const ROWS: readonly Spec[] = [
  {
    id: 'user_agent',
    group: 'browser',
    source: 'navigator.userAgent',
    label: { en: 'User agent', fr: 'User agent' },
    use: {
      en: 'Browser, version and system in one string, which every request sends anyway. Browsers have frozen much of it since reading it became tracking. Ordinary use: working around one browser’s bug, which feature detection does better.',
      fr: 'Navigateur, version et système en une chaîne, que chaque requête envoie de toute façon. Les navigateurs en ont figé une bonne partie depuis que la lire sert à pister. Usage ordinaire : contourner le bug d’un navigateur, ce que la détection de fonctionnalités fait mieux.',
    },
    verdict: 'rare',
    now: ({ env }) => env.navigator.userAgent || null,
  },
  {
    id: 'client_hints',
    group: 'browser',
    source: 'navigator.userAgentData',
    label: { en: 'Client hints', fr: 'Client hints' },
    use: {
      en: 'The user agent’s replacement: brands, platform and whether it is a phone, without the version detail. Chromium only. Ordinary use: the same as the user agent’s.',
      fr: 'Le remplaçant du user agent : marques, plateforme et s’il s’agit d’un téléphone, sans le détail des versions. Chromium uniquement. Usage ordinaire : le même que le user agent.',
    },
    verdict: 'rare',
    now: ({ env }) => {
      const data = env.navigator.userAgentData
      if (!data?.brands?.length) return null
      const brands = data.brands.map((b) => `${b.brand} ${b.version}`).join(', ')
      return [brands, data.platform, data.mobile ? 'mobile' : ''].filter(Boolean).join(' · ')
    },
  },
  {
    id: 'client_hints_full',
    group: 'browser',
    source: 'userAgentData.getHighEntropyValues()',
    label: { en: 'Client hints, on request', fr: 'Client hints, sur demande' },
    use: {
      en: 'What a page gets by asking: exact versions, the system’s version, the processor, a phone’s model. No prompt is shown, so the freeze above only holds for pages that don’t ask. Ordinary use: offering the right installer to download.',
      fr: 'Ce qu’une page obtient en demandant : versions exactes, version du système, processeur, modèle du téléphone. Aucune invite ne s’affiche, donc le gel ci-dessus ne vaut que pour les pages qui ne demandent pas. Usage ordinaire : proposer le bon installateur à télécharger.',
    },
    verdict: 'rare',
    later: fullHints,
  },
  {
    id: 'languages',
    group: 'locale',
    source: 'navigator.languages',
    label: { en: 'Languages', fr: 'Langues' },
    use: {
      en: 'Your preferred languages, in order. Ordinary use: choosing the page’s language. This site reads the first one, once, to pick English or French.',
      fr: 'Vos langues préférées, dans l’ordre. Usage ordinaire : choisir la langue de la page. Ce site lit la première, une fois, pour choisir l’anglais ou le français.',
    },
    verdict: 'common',
    now: ({ env }) => {
      const { languages, language } = env.navigator
      const list = languages?.length ? languages : language ? [language] : []
      return list.length ? list.join(', ') : null
    },
  },
  {
    id: 'time_zone',
    group: 'locale',
    source: 'Intl.DateTimeFormat().resolvedOptions().timeZone',
    label: { en: 'Time zone', fr: 'Fuseau horaire' },
    use: {
      en: 'Where your clock is set, by region. Ordinary use: showing times in your zone. This site’s cron tool names it beside the next runs.',
      fr: 'Le réglage de votre horloge, par région. Usage ordinaire : afficher les heures dans votre fuseau. L’outil cron de ce site le nomme à côté des prochaines exécutions.',
    },
    verdict: 'common',
    now: ({ env }) => new env.intl.DateTimeFormat().resolvedOptions().timeZone || null,
  },
  {
    id: 'screen_size',
    group: 'screen',
    source: 'screen.width × screen.height',
    label: { en: 'Screen size', fr: 'Taille de l’écran' },
    use: {
      en: 'The whole screen in CSS pixels, not the window. Layout follows the window, through media queries, so a page rarely needs this.',
      fr: 'L’écran entier en pixels CSS, pas la fenêtre. La mise en page suit la fenêtre, par les media queries, donc une page en a rarement besoin.',
    },
    verdict: 'rare',
    now: ({ env }) => (env.screen?.width && env.screen.height ? `${env.screen.width}×${env.screen.height}` : null),
  },
  {
    id: 'pixel_ratio',
    group: 'screen',
    source: 'devicePixelRatio',
    label: { en: 'Pixel ratio', fr: 'Densité de pixels' },
    use: {
      en: 'Device pixels per CSS pixel; zooming changes it. Ordinary use: drawing a canvas sharp. This site reads it for the wireframes, the confetti and the matrix rain, capped at 2.',
      fr: 'Pixels physiques par pixel CSS ; le zoom le change. Usage ordinaire : dessiner un canvas net. Ce site le lit pour les formes filaires, les confettis et la pluie matrix, plafonné à 2.',
    },
    verdict: 'common',
    now: ({ env }) => {
      const ratio = env.devicePixelRatio
      return typeof ratio === 'number' && ratio > 0 ? String(Math.round(ratio * 100) / 100) : null
    },
  },
  {
    id: 'colour_depth',
    group: 'screen',
    source: 'screen.colorDepth',
    label: { en: 'Colour depth (bits)', fr: 'Profondeur de couleur (bits)' },
    use: {
      en: 'Bits per pixel. Most screens report 24, which makes it a weak signal, but some report 30 or 48. Nothing ordinary depends on it: HDR is asked with a media query.',
      fr: 'Bits par pixel. La plupart des écrans annoncent 24, ce qui en fait un signal faible, mais certains annoncent 30 ou 48. Rien d’ordinaire n’en dépend : le HDR se demande par une media query.',
    },
    verdict: 'none',
    now: ({ env }) => (env.screen?.colorDepth ? String(env.screen.colorDepth) : null),
  },
  {
    id: 'cores',
    group: 'hardware',
    source: 'navigator.hardwareConcurrency',
    label: { en: 'Logical cores', fr: 'Cœurs logiques' },
    use: {
      en: 'How many threads the processor runs at once. Ordinary use: sizing a pool of workers. This site runs one worker at a time and never asks.',
      fr: 'Combien de fils d’exécution le processeur mène à la fois. Usage ordinaire : dimensionner un pool de workers. Ce site lance un worker à la fois et ne le demande jamais.',
    },
    verdict: 'rare',
    now: ({ env }) => {
      const cores = env.navigator.hardwareConcurrency
      return cores ? count(cores) : null
    },
  },
  {
    id: 'memory_gb',
    group: 'hardware',
    source: 'navigator.deviceMemory',
    label: { en: 'Memory (GB, rounded)', fr: 'Mémoire (Go, arrondie)' },
    use: {
      en: 'Rounded to a power of two to blur it. Chromium only. Ordinary use: sending a lighter page to a small device.',
      fr: 'Arrondie à une puissance de deux pour la flouter. Chromium uniquement. Usage ordinaire : servir une page plus légère à un petit appareil.',
    },
    verdict: 'rare',
    now: ({ env }) => count(env.navigator.deviceMemory),
  },
  {
    id: 'touch_points',
    group: 'hardware',
    source: 'navigator.maxTouchPoints',
    label: { en: 'Touch points', fr: 'Points de contact' },
    use: {
      en: 'How many fingers the screen follows at once; 0 without a touch screen. Pages usually ask the pointer media query instead, which says what kind of pointer, not how many.',
      fr: 'Combien de doigts l’écran suit à la fois ; 0 sans écran tactile. Les pages interrogent plutôt la media query pointer, qui dit quel genre de pointeur, pas combien.',
    },
    verdict: 'rare',
    now: ({ env }) => count(env.navigator.maxTouchPoints),
  },
  preference(
    'prefers-color-scheme',
    ['dark', 'light'],
    { en: 'Colour scheme', fr: 'Thème de couleur' },
    {
      en: 'Your system’s light or dark setting. Ordinary use: matching it. This site doesn’t: `theme` picks the scheme, and the default is dark.',
      fr: 'Le réglage clair ou sombre du système. Usage ordinaire : s’y accorder. Ce site ne le fait pas : `theme` choisit le thème, et le défaut est sombre.',
    },
  ),
  preference(
    'prefers-reduced-motion',
    ['reduce', 'no-preference'],
    { en: 'Reduced motion', fr: 'Animations réduites' },
    {
      en: 'Whether you asked the system for less animation. Ordinary use: honouring it. This site does: it holds the background still and the shell’s animations to one frame.',
      fr: 'Si vous avez demandé moins d’animations au système. Usage ordinaire : le respecter. Ce site le fait : il fige le fond et réduit les animations du terminal à une image.',
    },
  ),
  preference(
    'prefers-contrast',
    ['more', 'less', 'custom', 'no-preference'],
    { en: 'Contrast', fr: 'Contraste' },
    {
      en: 'Whether you asked for more or less contrast. Ordinary use: honouring it. This site doesn’t read it: its colour schemes are held to contrast floors instead.',
      fr: 'Si vous avez demandé plus ou moins de contraste. Usage ordinaire : le respecter. Ce site ne le lit pas : ses thèmes sont tenus à des seuils de contraste.',
    },
  ),
  preference(
    'prefers-reduced-transparency',
    ['reduce', 'no-preference'],
    { en: 'Reduced transparency', fr: 'Transparence réduite' },
    {
      en: 'Whether you asked for fewer see-through surfaces. Ordinary use: making overlays opaque. A browser that doesn’t know the query reads as not available.',
      fr: 'Si vous avez demandé moins de surfaces translucides. Usage ordinaire : rendre les calques opaques. Un navigateur qui ignore la requête s’affiche comme non disponible.',
    },
  ),
  {
    id: 'webgl_vendor',
    group: 'gpu',
    source: 'WEBGL_debug_renderer_info',
    label: { en: 'WebGL vendor', fr: 'Fournisseur WebGL' },
    use: {
      en: 'Who made the graphics driver, as WebGL reports it. Ordinary use: a 3D page working around one driver’s bug. This site draws its background with WebGL and never asks.',
      fr: 'Qui a fait le pilote graphique, tel que WebGL le rapporte. Usage ordinaire : une page 3D qui contourne le bug d’un pilote. Ce site dessine son fond en WebGL et ne le demande jamais.',
    },
    verdict: 'rare',
    now: ({ gl }) => gl()?.vendor ?? null,
  },
  {
    id: 'webgl_renderer',
    group: 'gpu',
    source: 'WEBGL_debug_renderer_info',
    label: { en: 'WebGL renderer', fr: 'Moteur de rendu WebGL' },
    use: {
      en: 'Often the exact graphics card and driver, which is why it varies so much between machines. Ordinary use: picking a game’s quality settings.',
      fr: 'Souvent la carte graphique et le pilote exacts, d’où sa grande variété d’une machine à l’autre. Usage ordinaire : choisir les réglages de qualité d’un jeu.',
    },
    verdict: 'rare',
    now: ({ gl }) => gl()?.renderer ?? null,
  },
  {
    id: 'canvas',
    group: 'render',
    source: 'canvas.toDataURL()',
    label: { en: 'Canvas render (SHA-256)', fr: 'Rendu canvas (SHA-256)' },
    use: {
      en: 'A line of text and shapes drawn off-screen, read back and hashed. Drawing is ordinary; reading the pixels back to hash them is the fingerprint. Some browsers add noise here on purpose, so this one can change between visits.',
      fr: 'Une ligne de texte et des formes dessinées hors écran, relues et hachées. Dessiner est ordinaire ; relire les pixels pour les hacher, c’est l’empreinte. Certains navigateurs y ajoutent du bruit exprès, donc celle-ci peut changer d’une visite à l’autre.',
    },
    verdict: 'none',
    later: canvasRender,
  },
  {
    id: 'audio',
    group: 'render',
    source: 'OfflineAudioContext',
    label: { en: 'Audio render (SHA-256)', fr: 'Rendu audio (SHA-256)' },
    use: {
      en: 'A tone rendered silently through a compressor, then hashed: engines and processors round the maths slightly differently. Nothing is played, and no page needs to read this back.',
      fr: 'Un son rendu en silence à travers un compresseur, puis haché : moteurs et processeurs arrondissent les calculs un peu différemment. Rien n’est joué, et aucune page n’a besoin de relire ça.',
    },
    verdict: 'none',
    later: audioRender,
  },
]

function probe(env: FingerprintEnv): Probe {
  let gl: ReturnType<Probe['gl']> | undefined
  return {
    env,
    gl: () => {
      if (gl === undefined) {
        try {
          gl = readGl(env)
        } catch {
          gl = null
        }
      }
      return gl
    },
  }
}

function strip(spec: Spec): Row {
  const { id, group, source, label, use, verdict } = spec
  return { id, group, source, label, use, verdict }
}

/**
 * Every row that can be read at once, in order, optionally only those of `groups`: all
 * of them but the renders and the requested hints. A read that throws is not available,
 * never an exception, because whatever a browser blocks is a row's answer, not an error.
 */
export function readNow(env: FingerprintEnv, groups?: readonly Group[]): Reading[] {
  const shared = probe(env)
  return ROWS.filter((spec) => 'now' in spec && (!groups || groups.includes(spec.group))).map((spec) => {
    let value: Value
    try {
      value = 'now' in spec ? spec.now(shared) : null
    } catch {
      value = null
    }
    return { ...strip(spec), value }
  })
}

/** The rows that render or ask first, each settling on its own value or not available. */
export async function readLater(env: FingerprintEnv): Promise<Reading[]> {
  const shared = probe(env)
  const later = ROWS.filter((spec) => 'later' in spec)
  const values = await Promise.all(
    later.map(async (spec) => {
      try {
        return 'later' in spec ? await spec.later(shared) : null
      } catch {
        return null
      }
    }),
  )
  return later.map((spec, i) => ({ ...strip(spec), value: values[i] ?? null }))
}

/** Whether a reading can feed the combined hash: only one with a value. */
export function feeds(reading: Reading): boolean {
  return reading.value !== null
}

/**
 * SHA-256 over `id=value` lines of the readings that feed it, in the order given. The
 * ids are in it so two rows can't trade values unnoticed; the labels are not, so the
 * hash is the same in either language. Null without Web Crypto or with nothing to hash.
 */
export async function combinedHash(
  readings: readonly Reading[],
  subtle: SubtleCrypto | undefined,
): Promise<string | null> {
  const fed = readings.filter(feeds)
  if (!subtle || !fed.length) return null
  return toHex(await digestText('SHA-256', fed.map((r) => `${r.id}=${r.value}`).join('\n'), subtle))
}
