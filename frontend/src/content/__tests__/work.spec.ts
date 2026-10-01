import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolvePath } from '@/composables/useViewSwing'
import { sourceUrl } from '@/lib/source'
import { isLinkable, resolveLink } from '@/terminal/registry'
import { workLines } from '@/terminal/work'
import { findDecision } from '../decisions'
import { headingSlugs } from '../docs'
import { work } from '../work'

const repo = join(process.cwd(), '..')
const t = <T,>(value: { en: T; fr: T }) => value.en

/**
 * Where each number in the copy comes from, as `part: { value: [file, the code that says
 * so] }`. Typed figures go stale (roadmap §H: "wherever a number can come from the build,
 * it should"), and none of these is a count the build has to hand, so instead each is held
 * to the line it was read from: change the constant and this fails until the copy follows.
 * A number with no code behind it (a fact about vim, or the standard) is `null`, so a new
 * number has to be one or the other.
 */
const PINNED: Record<string, Record<string, [file: string, pattern: RegExp] | null>> = {
  vim: {
    E37: ['frontend/src/terminal/commands/eggs.ts', /'E37: No write since last change/],
    E45: ['frontend/src/terminal/commands/eggs.ts', /"E45: 'readonly' option is set/],
    '60': ['frontend/src/components/terminal/VimPane.vue', /TILDE_COUNT = 60\b/],
  },
  qr: {
    '1–40': ['frontend/src/tools/qr/qr.ts', /MIN_VERSION = 1\b[\s\S]*MAX_VERSION = 40\b/],
    '2,953 bytes': ['frontend/src/tools/__tests__/qr.spec.ts', /40: \[2953,/],
    'x⁸ + x⁴ + x³ + x² + 1 (0x11D)': ['frontend/src/tools/qr/qr.ts', /\* 0x11d\)/],
    '4 modules': ['frontend/src/tools/qr/qr.ts', /QUIET_ZONE = 4\b/],
  },
  rooms: {
    '2 s': ['frontend/src/rooms/sync.ts', /DRIFT_SECONDS = 2\b/],
    '25 s': ['backend/src/rooms/rooms.service.ts', /HEARTBEAT_MS = 25_000\b/],
    '2 h': ['backend/src/rooms/rooms.service.ts', /IDLE_TTL_MS = 2 \* 60 \* 60 \* 1000\b/],
    '200': ['backend/src/rooms/rooms.service.ts', /MAX_ROOMS = 200\b/],
  },
  ffmpeg: {
    '32,232,419 bytes': ['frontend/src/tools/ffmpeg/media.ts', /CORE_BYTES = 32_232_419\b/],
    // Deflate's output, measured once over the wire; nothing in the repo computes it.
    'about 10 MB': null,
    '@ffmpeg/core 0.12.10, single-thread': ['frontend/package.json', /"@ffmpeg\/core": "\^0\.12\.10"/],
  },
  prism: {
    '650 ms': ['frontend/src/composables/useViewSwing.ts', /SWING_MS = 650\b/],
    '90° / 40°': ['frontend/src/components/ThreeBackground.vue', /FIELD_YAW = \(40 \* Math\.PI\)/],
    '1200px': ['frontend/src/assets/main.css', /perspective: 1200px/],
  },
  mcp: {
    '2025-06-18': ['backend/src/mcp/mcp.service.ts', /PROTOCOL_VERSIONS = \['2025-06-18', '[\d-]+', '[\d-]+'\]/],
    '60 / min': ['backend/src/mcp/mcp.controller.ts', /limit: 60, windowMs: 60 \* 1000\b/],
    '10 min': ['backend/src/mcp/mcp.content.ts', /CONTENT_TTL_MS = 10 \* 60 \* 1000\b/],
    '5 s': ['backend/src/mcp/mcp.content.ts', /REQUEST_TIMEOUT_MS = 5_000\b/],
  },
  presence: {
    '1': ['backend/src/presence/presence.service.spec.ts', /toEqual\(\['online'\]\)/],
    '25 s': ['backend/src/presence/presence.service.ts', /HEARTBEAT_MS = 25_000\b/],
    '3': ['frontend/src/composables/usePresence.ts', /MAX_FAILURES = 3\b/],
    '12': ['frontend/src/composables/useSceneControl.ts', /MAX_VISITOR_SHAPES = 12\b/],
  },
  wordlists: {
    '5': ['frontend/scripts/build-wordlists.mjs', /WORDLE_LENGTH = 5\b/],
    '35 / 70 / 10': [
      'frontend/scripts/build-wordlists.mjs',
      /EN_ANSWER_SIZE = 35\b[\s\S]*EN_ACCEPTED_SIZE = 70\b[\s\S]*EN_TYPING_SIZE = 10\b/,
    ],
    '≥ 10 / ≥ 200': ['frontend/scripts/build-wordlists.mjs', /FR_ANSWER_MIN_FREQ = 10\b[\s\S]*FR_TYPING_MIN_FREQ = 200\b/],
    '2–9': ['frontend/scripts/build-wordlists.mjs', /TYPING_MIN_LENGTH = 2\b\s*const TYPING_MAX_LENGTH = 9\b/],
  },
}

describe('case studies', () => {
  it('has a handful of parts with unique, typeable ids', () => {
    expect(work.length).toBeGreaterThanOrEqual(8)
    const ids = work.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it.each(work.map((p) => [p.id, p] as const))('%s says everything in both languages', (_id, part) => {
    for (const value of [part.name, part.summary, ...part.numbers.map((n) => n.label)]) {
      expect(value.en.trim()).toBeTruthy()
      expect(value.fr.trim()).toBeTruthy()
    }
    expect(part.hard.en.length).toBeGreaterThan(0)
    expect(part.hard.fr.length).toBe(part.hard.en.length)
  })

  // A page shows backticked runs as code (`lib/codeSpans.ts`), and a stray one as a backtick.
  it.each(work.map((p) => [p.id, p] as const))('%s pairs every backtick', (_id, part) => {
    const copy = [part.name, part.summary, part.hard, ...part.numbers.map((n) => n.label)].flatMap((v) => [v.en, v.fr].flat())
    for (const text of copy) expect(text.split('`').length % 2, text).toBe(1)
  })

  // `try` is an ordinary link: a place on the site, or a command a link could run, resolved
  // the way runLink resolves it.
  it.each(work.filter((p) => p.try).map((p) => [p.id, p.try!] as const))('%s: try %s is reachable from a link', (_id, target) => {
    if (resolvePath(target)) return
    const resolved = resolveLink(target)
    expect(resolved, target).toBeDefined()
    expect(isLinkable(resolved!.command, resolved!.args), target).toBe(true)
  })

  it.each(work.map((p) => [p.id, p] as const))('%s links code that exists and a design heading that exists', (_id, part) => {
    for (const path of part.code) expect(existsSync(join(repo, path)), path).toBe(true)
    const doc = join(repo, part.spec.doc)
    expect(existsSync(doc), part.spec.doc).toBe(true)
    expect(headingSlugs(readFileSync(doc, 'utf8'))).toContain(part.spec.anchor)
    for (const id of part.decisions ?? []) expect(findDecision(id), id).toBeDefined()
  })

  it.each(work.map((p) => [p.id, p] as const))('%s: every number is the code’s, or says it isn’t', (id, part) => {
    for (const { value } of part.numbers) {
      const pin = PINNED[id]?.[value]
      expect(pin, `${id}: ${value} is neither pinned to code nor marked null`).not.toBeUndefined()
      if (!pin) continue
      const [file, pattern] = pin
      expect(readFileSync(join(repo, file), 'utf8'), `${id}: ${value} in ${file}`).toMatch(pattern)
    }
  })

  // Pinned to the build's commit, never a branch that moves under the link. The unit
  // tests' `__BUILD_SHA__` is 'dev', which falls back to master, so render at a real one.
  it('links the code at the build’s commit, never a branch', () => {
    const sha = 'a'.repeat(40)
    for (const part of work) {
      const hrefs = workLines(part, t, sha).flatMap((l) => (l.href ? [l.href] : []))
      for (const path of part.code) expect(hrefs, part.id).toContain(sourceUrl(path, sha))
      for (const href of hrefs) expect(href, part.id).not.toMatch(/\/(tree|blob)\/master\//)
    }
  })
})
