import type { OutputLine, OutputSegment, Tone } from './types'

/**
 * The one ANSI palette: which SGR code stands for which tone. `curl` reads the real
 * `resume.txt` through `parseSgr()`, and the résumé plugin writes it with the same
 * codes, so a colour can't mean one thing in a real terminal and another in this one.
 *
 * Relative imports only, and types at that: `vite-plugins/` reaches this file from
 * outside the app's module graph, as it does `src/content/`.
 */
export const SGR_TONES = {
  primary: '38;5;46',
  accent: '38;5;51',
  muted: '2',
} as const satisfies Partial<Record<Tone, string>>

/** The 256-colour indexes the palette uses, read back. Any other colour is plain text. */
const INDEXED: Record<number, Tone> = { 46: 'primary', 51: 'accent' }

/**
 * Every escape a text file might carry: CSI sequences (`ESC [ … m` and the cursor
 * movers), OSC strings (titles, hyperlinks) up to BEL or ST, and the two-byte rest.
 * Only SGR (`m`) is read; the others are dropped.
 */
// eslint-disable-next-line no-control-regex
const ESCAPE = /\u001b\[([0-9;:?]*)([@-~])|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-_]/g
// Whatever control characters are left (a lone ESC, BEL, backspace), except tab.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g

interface State {
  tone: Tone
  /** SGR 8: text the terminal is told not to draw, such as the CTF's stage-3 flag. */
  concealed: boolean
}

function applySgr(state: State, params: string): void {
  const codes = params === '' ? [0] : params.split(/[;:]/).map((code) => Number(code) || 0)
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]!
    if (code === 0) Object.assign(state, { tone: 'default', concealed: false })
    else if (code === 2) state.tone = 'muted'
    else if (code === 22 || code === 39) state.tone = 'default'
    else if (code === 8) state.concealed = true
    else if (code === 28) state.concealed = false
    else if (code === 38 && codes[i + 1] === 5) {
      state.tone = INDEXED[codes[i + 2] ?? -1] ?? 'default'
      i += 2
    } else if (code === 38 && codes[i + 1] === 2) {
      // A true colour has no tone to map to.
      state.tone = 'default'
      i += 4
    }
  }
}

/**
 * Text with ANSI escapes as output lines: the palette's colours become tones, every other
 * escape is stripped, and a concealed run is dropped entirely rather than drawn. That
 * last one is the point of the CTF's stage 3: `curl jhemery.xyz` in a real terminal
 * hides the flag the same way, and `cat -v` is how you find it. Here there is no `-v`.
 */
export function parseSgr(text: string): OutputLine[] {
  const state: State = { tone: 'default', concealed: false }
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map((row) => {
      const segments: OutputSegment[] = []
      const push = (run: string) => {
        const clean = run.replace(CONTROL, '')
        if (!clean || state.concealed) return
        const last = segments[segments.length - 1]
        if (last && last.tone === state.tone) last.text += clean
        else segments.push({ text: clean, tone: state.tone })
      }
      let at = 0
      for (const match of row.matchAll(ESCAPE)) {
        push(row.slice(at, match.index))
        if (match[2] === 'm') applySgr(state, match[1] ?? '')
        at = match.index + match[0].length
      }
      push(row.slice(at))
      return { text: segments.map((s) => s.text).join(''), segments, pre: true }
    })
}
