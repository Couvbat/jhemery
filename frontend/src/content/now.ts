import type { Localised, NowCategory, NowEntry } from './types'

/**
 * The /now page (nownownow.com): what Jules is doing at the moment, dated. Read by
 * `/now` and by `cat now.txt`, so the two cannot disagree.
 *
 * **Bump `updated` whenever this list changes.** It is the only thing that keeps the
 * page honest: past `STALE_AFTER_DAYS` both readers say how old the list is instead of
 * presenting it as current.
 */
export const now = {
  updated: '2026-09-24',
  entries: [
    {
      category: 'building',
      text: {
        en: 'This site: a CTF chain, a QR encoder written from the spec, and connect four over rooms.',
        fr: 'Ce site : une chaîne de CTF, un encodeur QR écrit depuis la norme, et un puissance 4 en ligne.',
      },
    },
    {
      category: 'building',
      text: {
        en: 'Web apps and internal tools at In-Leed.',
        fr: 'Des applications web et des outils internes chez In-Leed.',
      },
    },
    {
      category: 'playing',
      text: {
        en: 'Whatever the Steam card on the home page says — it is live.',
        fr: 'Ce que dit la carte Steam de la page d’accueil — elle est en direct.',
      },
    },
    {
      category: 'learning',
      text: {
        en: 'MCP, by serving this résumé over it.',
        fr: 'MCP, en servant ce CV avec.',
      },
    },
    {
      category: 'listening',
      text: {
        en: 'Hard techno and acidcore, mostly while producing it.',
        fr: 'De la hard techno et de l’acidcore, surtout en en produisant.',
      },
    },
  ] satisfies NowEntry[],
}

export const STALE_AFTER_DAYS = 90

export const nowCategories: Record<NowCategory, Localised> = {
  building: { en: 'building', fr: 'je construis' },
  playing: { en: 'playing', fr: 'je joue à' },
  learning: { en: 'learning', fr: 'j’apprends' },
  listening: { en: 'listening', fr: 'j’écoute' },
}

/** Whole days between `updated` (a `YYYY-MM-DD` date, read as UTC) and `at`. */
export function daysSince(updated: string, at: Date): number {
  const then = Date.parse(`${updated}T00:00:00Z`)
  return Math.max(0, Math.floor((at.getTime() - then) / 86_400_000))
}

/** How old the list is when it is too old to pass as current; `null` while it is fresh. */
export function staleDays(updated: string, at: Date): number | null {
  const days = daysSince(updated, at)
  return days > STALE_AFTER_DAYS ? days : null
}
