# Design spec — easter egg achievements

Status: proposed.

## Context

The site's terminal (see [features-spec.md](features-spec.md) §5) hides a dozen easter eggs behind
hidden commands, a keyboard sequence, and a hidden file. Finding them is unguided and, once found,
leaves no trace — nothing tells a visitor how many they've found or what they're missing. This adds
a lightweight achievement tracker: a modal listing all 12 eggs (locked ones show a hint, not the
answer), a nav button to open it, and a toast at the moment of discovery.

This is visitor-facing chrome around an already-shipped feature, not a change to the eggs
themselves — no new easter eggs are added, no existing one changes behaviour.

## Achievement list

Fixed order, one entry per existing hidden trigger. `hint` is shown for locked entries instead of
`name`/`description`; `name` + `description` replace it once unlocked.

| id | name | hint | description | trigger |
|---|---|---|---|---|
| `sudo` | Superuser | Some commands need elevated privileges. | Tried to sudo your way in. | Running `sudo <anything>` (the standard denial path) |
| `rm-rf` | Kernel Panic | Don't run this on a real machine. | Ran `sudo rm -rf /` and survived. | The `sudo rm -rf /` easter egg |
| `matrix` | Red Pill | Follow the white rabbit. | Entered the Matrix. | `matrix` |
| `vim` | Stuck In Vim | Real developers use ed. | Opened vim and made it out (eventually). | Opening the `vim` trap |
| `secret` | Curious | Not everything shows up in `ls`. | Found the hidden file. | `cat .secret` |
| `konami` | Cheat Code | ↑↑↓↓←→←→ rings a bell? | Entered the Konami code. | Konami code, anywhere on the page |
| `hack` | Script Kiddie | Some targets are worth an nmap. | Breached the mainframe (not really). | `hack [target]` reaching `ACCESS DENIED` |
| `coffee` | I'm a Teapot | Try brewing something. | Asked the server for coffee. | `coffee` |
| `cowsay` | Moo | Ask a cow for its opinion. | Made a cow say something. | `cowsay <text>` |
| `fortune` | Dubious Wisdom | Ask the terminal for advice. | Received a dubious aphorism. | `fortune` |
| `sl` | Choo Choo | Typo `ls` and see what happens. | Watched the train go by. | `sl` |
| `rickroll` | Never Gonna | Curiosity killed the cat. | Got rickrolled on purpose. | Confirming `rickroll` with `y` |

Explicitly excluded: `play` (a real navigation command, not hidden) and the DevTools console art
(not an interactive trigger — there's nothing reliable to detect, and trying to detect open
DevTools is the kind of fragile hack this site's "progressive, never blocking" principle argues
against).

Localisation: `name`, `hint`, `description` are all `Localised<string>` per the existing content
convention (§1 of features-spec.md).

## Architecture

### `frontend/src/content/achievements.ts`

New content module, same shape as the rest of `content/*`: dependency-free, exports
`achievements: Achievement[]` in the fixed order above. No import of Vue or `@` aliases, consistent
with the build-time résumé generator's requirement on this directory.

```ts
interface Achievement {
  id: string
  name: Localised<string>
  hint: Localised<string>
  description: Localised<string>
}
```

### `frontend/src/composables/useAchievements.ts`

A module-level singleton, matching the existing pattern of `useTerminal()` / `useCrt()` (state
shared across every caller, not per-component).

- `unlocked: Ref<Set<string>>` — hydrated once from `localStorage['couvbat:achievements']` (a JSON
  array of ids) on first access; falls back to an empty set if absent or unparsable.
- `unlock(id: string): void` — no-op if `id` is already in `unlocked` (including unknown ids, as a
  guard against typos silently no-oping rather than throwing); otherwise adds it, persists the full
  set back to `localStorage`, and pushes `{ id, name }` onto `toastQueue`.
- `isUnlocked(id: string): boolean`.
- `progress: ComputedRef<{ count: number; total: number }>`.
- `toastQueue: Ref<{ id: string; name: Localised<string> }[]>` and `dismissToast(id)` — the toast
  component owns display timing, this just owns the queue.

Persistence mirrors how terminal `history` already persists to `localStorage` — same mechanism,
new key, no shared code needed since the read/write is a handful of lines.

### Wiring unlocks

Each trigger calls `unlock(id)` inline, at the point the egg already fires. No event bus, no
scanning command history after the fact (Approach A from the brainstorm — rejected alternatives:
inferring unlocks from terminal history breaks for the Konami code, which isn't a terminal command
at all; an event bus adds indirection with no benefit since these call sites already import
composables directly).

Call sites, all in files that already exist:

- `frontend/src/terminal/commands/eggs.ts`
  - `sudo` command, generic denial branch → `unlock('sudo')`
  - `sudo` command, `rm -rf /` branch (before the fake deletion sequence) → `unlock('rm-rf')`
  - `matrix` command → `unlock('matrix')` (unconditionally — discovery counts even when
    `prefers-reduced-motion` shows the static fallback line instead of the animation)
  - `vim` command, both the no-file and file-open branches → `unlock('vim')`
  - `hack` command, after the paced stages resolve to `ACCESS DENIED` → `unlock('hack')`
  - `coffee`, `cowsay`, `fortune`, `sl` commands → `unlock('coffee')` / `unlock('cowsay')` /
    `unlock('fortune')` / `unlock('sl')` respectively
  - `rickroll` command, the `y`/`yes` branch only → `unlock('rickroll')`
- `frontend/src/terminal/commands/secret.ts` — `secretContents()` → `unlock('secret')`
- `frontend/src/App.vue` — `useKonami(() => { setCrt(); unlock('konami') })`

## UI

### `frontend/src/components/AchievementsModal.vue`

A fixed-position dialog, hand-rolled to match `TerminalOverlay.vue`'s existing pattern exactly
rather than introducing a new dialog primitive (there is none in `components/ui/` today, and one
component doesn't justify adding shadcn-vue's Dialog):

- `role="dialog"`, `aria-modal="true"`, `aria-label` from a new i18n key.
- Manual focus trap on `Tab`/`Shift+Tab` cycling within the panel; focus moves to the panel on open
  and restores to the button that opened it on close — same `previouslyFocused` pattern as
  `TerminalOverlay.vue`.
- `Esc` closes.
- Header: `{count}/12 found` from `progress`.
- Body: the 12 entries in fixed order. Unlocked rows show `name` + `description` + a ✓. Locked rows
  show a 🔒 + `hint` only — never `name` or `description`, so the modal itself can't spoil what an
  egg does.

### Nav button

A small trophy-icon button in `NavBar.vue`, placed next to the existing language toggle, in both
the desktop (`hidden md:flex`) list and the mobile controls row. Shown unconditionally on mobile
too, even though none of the 12 are reachable there without a keyboard — the terminal launcher is
`md:`-hidden per §9 of features-spec.md, but the achievements button isn't gated the same way, so a
mobile visitor still sees "0/12 found" with locked hints as a nudge to come back on desktop. This
was a deliberate choice (confirmed during design), not an oversight.

### `frontend/src/components/AchievementToast.vue`

Mounted once in `App.vue`. Watches `toastQueue`; shows one "🏆 Achievement unlocked: *name*" toast
at a time, auto-dismissing after ~3.5s, then advances to the next queued one if any. Positioned
top-right so it never overlaps the terminal launcher (bottom-right) or the terminal overlay itself
(bottom-anchored). `aria-live="polite"` region. Under `prefers-reduced-motion`, skips the
slide/fade transition — the toast still appears and dismisses on the same timer, just without
motion, consistent with how `matrix`/`sl`/CRT overdrive already degrade.

## i18n

New keys under a `m.achievements` namespace: modal title, the `{count}/{total} found` template, the
nav button's `aria-label`/`title`, and the toast's "Achievement unlocked" prefix. Achievement
`name`/`hint`/`description` strings live in `content/achievements.ts` itself, following the existing
convention that content data carries its own `Localised<T>` fields rather than routing through the
`m.*` i18n message tree.

## Accessibility

- Modal: see focus-trap details above — this is the same treatment `TerminalOverlay.vue` already
  has, applied to a second dialog.
- Toast: `aria-live="polite"`, non-interactive (no dismiss button needed since it self-clears), so
  it doesn't compete for keyboard focus.
- Nav button: real `<button>`, `aria-label`, reachable by keyboard on both breakpoints.

## Out of scope

- No cross-device or account sync — `localStorage` only, per browser, matching how terminal history
  already persists.
- No progress reset UI (a hidden terminal command for this could be a later addition, not required
  now).
- No new achievements beyond the 12 listed — this specs the tracker, not new easter eggs.
