/// <reference types="vite/client" />

/** Injected by Vite `define` — see vite.config.ts. */
declare const __BUILD_SHA__: string
declare const __BUILD_TIME__: string
/** Whether `content/events.ts` and `content/stems.ts` list anything, at build time. */
declare const __HAS_EVENTS__: boolean
declare const __HAS_STEMS__: boolean

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** Umami tracker script URL. Unset disables analytics entirely — see src/lib/analytics.ts. */
  readonly VITE_UMAMI_SRC?: string
  /** Umami website UUID. Unset disables analytics entirely. */
  readonly VITE_UMAMI_WEBSITE_ID?: string
  /** Optional `data-domains` allowlist, comma-separated, no scheme. */
  readonly VITE_UMAMI_DOMAINS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** X-ray mode's words map, built by `vite-plugins/xray.ts`: component → the files its words come from. */
declare module 'virtual:xray-map' {
  const map: Record<string, string[]>
  export default map
}
