/**
 * The colour schemes `theme` switches between: the site's own neon, plus the palettes
 * r/unixporn keeps coming back to. A scheme names a dozen colours and every CSS token is
 * derived from them (`themeTokens`), so adding one is a single object here — nothing in
 * the stylesheet or the components needs to know it exists.
 *
 * The values are the upstream palettes, with three deliberate exceptions, each a text
 * colour that would otherwise sit under the contrast floor `themes.spec.ts` enforces:
 * Dracula's comment grey is lifted from #6272a4 (3.0:1) to #8490c0, Tokyo Night's muted
 * text borrows the Moon variant's `fg_dark`, and Catppuccin Latte's yellow — 2.3:1 on its
 * own base — is replaced by a darker amber in the same family.
 */

export type ThemeMode = 'dark' | 'light'

/** The dozen colours a scheme has to name. */
export interface ThemeColours {
  background: string
  /** Cards, popovers, the terminal window. */
  surface: string
  /** Hover rows, inputs, `bg-muted`. */
  raised: string
  border: string
  foreground: string
  /** `text-muted-foreground` — the most-used colour on the site, so it has to be readable. */
  muted: string
  primary: string
  accent: string
  secondary: string
  /** The fourth hue. Only the wireframes, the confetti and `--chart-5` use it, never text. */
  highlight: string
  warning: string
  destructive: string
}

export interface Theme {
  id: string
  name: string
  mode: ThemeMode
  colours: ThemeColours
}

export const DEFAULT_THEME = 'cyberpunk'

export const themes: Theme[] = [
  {
    id: DEFAULT_THEME,
    name: 'Cyberpunk',
    mode: 'dark',
    // A mirror of `:root` in main.css, for the swatches only: applying the default
    // clears every override rather than writing these, so the stylesheet stays the one
    // place the default lives and a visitor who never types `theme` gets the page as
    // shipped. `highlight` is `--neon-pink`; `warning` is Tailwind's yellow-400, which is
    // what `text-yellow-400` painted before the token existed.
    colours: {
      background: 'oklch(0.1 0.01 145)',
      surface: 'oklch(0.13 0.01 145)',
      raised: 'oklch(0.18 0.01 145)',
      border: 'oklch(0.28 0.08 145)',
      foreground: 'oklch(0.85 0.18 145)',
      muted: 'oklch(0.55 0.1 145)',
      primary: 'oklch(0.85 0.3 145)',
      accent: 'oklch(0.85 0.2 200)',
      secondary: 'oklch(0.6 0.3 300)',
      highlight: '#ff0080',
      warning: 'oklch(0.852 0.199 91.936)',
      destructive: 'oklch(0.6 0.22 30)',
    },
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    mode: 'dark',
    colours: {
      background: '#282828',
      surface: '#32302f',
      raised: '#3c3836',
      border: '#504945',
      foreground: '#ebdbb2',
      muted: '#a89984',
      primary: '#fe8019',
      accent: '#8ec07c',
      secondary: '#d3869b',
      highlight: '#fabd2f',
      warning: '#fabd2f',
      destructive: '#fb4934',
    },
  },
  {
    id: 'gruvbox-light',
    name: 'Gruvbox Light',
    mode: 'light',
    // Gruvbox's "faded" accents, which exist for exactly this background.
    colours: {
      background: '#fbf1c7',
      surface: '#f2e5bc',
      raised: '#ebdbb2',
      border: '#d5c4a1',
      foreground: '#3c3836',
      muted: '#665c54',
      primary: '#af3a03',
      accent: '#427b58',
      secondary: '#8f3f71',
      highlight: '#b57614',
      warning: '#b57614',
      destructive: '#9d0006',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    mode: 'dark',
    colours: {
      background: '#2e3440',
      surface: '#3b4252',
      raised: '#434c5e',
      border: '#4c566a',
      foreground: '#d8dee9',
      muted: '#a3adbf',
      primary: '#88c0d0',
      accent: '#a3be8c',
      secondary: '#b48ead',
      highlight: '#d08770',
      warning: '#ebcb8b',
      destructive: '#bf616a',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    mode: 'dark',
    colours: {
      background: '#282a36',
      surface: '#21222c',
      raised: '#343746',
      border: '#44475a',
      foreground: '#f8f8f2',
      muted: '#8490c0',
      primary: '#bd93f9',
      accent: '#8be9fd',
      secondary: '#ff79c6',
      highlight: '#50fa7b',
      warning: '#f1fa8c',
      destructive: '#ff5555',
    },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin Mocha',
    mode: 'dark',
    colours: {
      background: '#1e1e2e',
      surface: '#181825',
      raised: '#313244',
      border: '#45475a',
      foreground: '#cdd6f4',
      muted: '#a6adc8',
      primary: '#cba6f7',
      accent: '#89dceb',
      secondary: '#f5c2e7',
      highlight: '#fab387',
      warning: '#f9e2af',
      destructive: '#f38ba8',
    },
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    mode: 'light',
    colours: {
      background: '#eff1f5',
      surface: '#e6e9ef',
      raised: '#dce0e8',
      border: '#bcc0cc',
      foreground: '#4c4f69',
      muted: '#6c6f85',
      primary: '#8839ef',
      accent: '#1e66f5',
      secondary: '#179299',
      highlight: '#ea76cb',
      warning: '#c96400',
      destructive: '#d20f39',
    },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    mode: 'dark',
    colours: {
      background: '#1a1b26',
      surface: '#16161e',
      raised: '#292e42',
      border: '#3b4261',
      foreground: '#c0caf5',
      muted: '#828bb8',
      primary: '#7aa2f7',
      accent: '#7dcfff',
      secondary: '#bb9af7',
      highlight: '#ff9e64',
      warning: '#e0af68',
      destructive: '#f7768e',
    },
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    mode: 'dark',
    colours: {
      background: '#191724',
      surface: '#1f1d2e',
      raised: '#26233a',
      border: '#403d52',
      foreground: '#e0def4',
      muted: '#908caa',
      primary: '#ebbcba',
      accent: '#9ccfd8',
      secondary: '#c4a7e7',
      highlight: '#eb6f92',
      warning: '#f6c177',
      destructive: '#eb6f92',
    },
  },
  {
    id: 'everforest',
    name: 'Everforest',
    mode: 'dark',
    colours: {
      background: '#2d353b',
      surface: '#343f44',
      raised: '#3d484d',
      border: '#475258',
      foreground: '#d3c6aa',
      muted: '#9da9a0',
      primary: '#a7c080',
      accent: '#83c092',
      secondary: '#d699b6',
      highlight: '#e69875',
      warning: '#dbbc7f',
      destructive: '#e67e80',
    },
  },
  {
    id: 'solarized',
    name: 'Solarized Dark',
    mode: 'dark',
    // Cyan rather than the more famous blue for primary: every Solarized accent sits
    // near 4:1 on base03 by design, and cyan is the one that clears 4.5.
    colours: {
      background: '#002b36',
      surface: '#073642',
      raised: '#0a3c48',
      border: '#586e75',
      foreground: '#93a1a1',
      muted: '#839496',
      primary: '#2aa198',
      accent: '#268bd2',
      secondary: '#6c71c4',
      highlight: '#d33682',
      warning: '#b58900',
      destructive: '#dc322f',
    },
  },
]

export function findTheme(id: string): Theme | undefined {
  return themes.find((theme) => theme.id === id.toLowerCase())
}

/** A scheme's colours in the order its swatch strip shows them: `theme`'s listing and the
 *  navbar's scheme menu both draw from this, so the two strips can't disagree. */
export function swatch({ colours: c }: Theme): string[] {
  return [c.primary, c.accent, c.secondary, c.highlight, c.warning, c.destructive, c.foreground, c.muted]
}

/**
 * Every custom property a scheme writes, derived from its dozen colours. Text laid on a
 * filled `primary`/`accent`/`secondary` uses the page background, which is what keeps
 * those buttons legible in both modes without a second set of colours per scheme.
 *
 * The `--neon-*` names are historical — they are the four hue slots the glows, the
 * wireframes and the confetti read, and under Gruvbox `--neon-green` is orange.
 */
export function themeTokens({ colours: c }: Theme): Record<string, string> {
  return {
    '--background': c.background,
    '--foreground': c.foreground,
    '--card': c.surface,
    '--card-foreground': c.foreground,
    '--popover': c.surface,
    '--popover-foreground': c.foreground,
    '--primary': c.primary,
    '--primary-foreground': c.background,
    '--secondary': c.secondary,
    '--secondary-foreground': c.background,
    '--muted': c.raised,
    '--muted-foreground': c.muted,
    '--accent': c.accent,
    '--accent-foreground': c.background,
    '--destructive': c.destructive,
    '--warning': c.warning,
    '--border': c.border,
    '--input': c.raised,
    '--ring': c.primary,
    '--chart-1': c.primary,
    '--chart-2': c.accent,
    '--chart-3': c.secondary,
    '--chart-4': c.warning,
    '--chart-5': c.highlight,
    '--sidebar': c.surface,
    '--sidebar-foreground': c.foreground,
    '--sidebar-primary': c.primary,
    '--sidebar-primary-foreground': c.background,
    '--sidebar-accent': c.raised,
    '--sidebar-accent-foreground': c.foreground,
    '--sidebar-border': c.border,
    '--sidebar-ring': c.primary,
    '--neon-green': c.primary,
    '--neon-cyan': c.accent,
    '--neon-purple': c.secondary,
    '--neon-pink': c.highlight,
  }
}
