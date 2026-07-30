# Design spec — achievements modal, nav button, and floating toast

Status: proposed. Supersedes an earlier draft of this file that assumed no achievement tracker
existed yet — it does, see below.

## Context

`frontend/src/terminal/achievements.ts` already ships (commit `f81d8a1`, same day as this spec) a
full achievement tracker: 18 achievements covering the terminal's easter eggs, the guestbook,
`mail`, `lang`, `crt`, `htop`, visiting every section (`explorer`), and a cascading `completionist`
meta-achievement. Unlocking is already wired into every relevant command
(`eggs.ts`, `navigate.ts`, `core.ts`, `live.ts`) and the Konami handler in `App.vue`. Progress is
already visible via a terminal `achievements` command (alias `trophies`), and unlocking already
prints a `🏆 achievement unlocked: …` line into the terminal's own output buffer.

What's missing, and what this spec covers:

1. **No hint for locked entries.** The terminal command currently shows locked rows as a bare
   `✗ ??? — locked`, telling a visitor nothing about how to earn them.
2. **No visibility outside the terminal.** There's no button or page chrome that surfaces
   achievements without knowing to open the terminal and type a command.
3. **Silent unlocks outside the terminal.** The Konami code unlocks `konami` from anywhere on the
   page, but nothing is shown — the toast line only exists inside the terminal's output buffer,
   which isn't rendered unless the terminal happens to be open.

This spec adds hints, a modal + nav button, and a floating toast — it does not add new
achievements, and does not change what already unlocks what.

## Achievements data

`Achievement` gains a `hint: Localised<string>` field, populated for all 18 existing entries.
Locked entries show `hint` instead of `title`/`description`; unlocked entries are unchanged
(`title` + `description`). This applies to **both** surfaces that render locked rows — the existing
terminal `achievements` command and the new modal — so the two don't show inconsistent information
for the same underlying data (§1 of features-spec.md: "one source of truth for content" applies to
achievement data the same way it applies to profile/project content).

Hints, matched to the 18 existing ids (`secret`, `explorer`, `sign`, `mail`, `lang`, `sudo`, `vim`,
`matrix`, `hack`, `cowsay`, `fortune`, `sl`, `coffee`, `rickroll`, `crt`, `htop`, `konami`,
`completionist`): each nudges toward the trigger without naming the exact command, mirroring the
terse register of the existing `description` strings (e.g. `sudo`'s hint is "Some commands should
never be run as root," not "type `sudo rm -rf /`"). Exact copy (English + French) is finalized in
the implementation plan, not enumerated here, since it's straightforward content work with no
architectural weight.

## Reactive access

`unlocked` (currently a module-private `Ref<Set<string>>`) is exported directly from
`achievements.ts` — the same pattern `history.ts` already uses for `export const history =
ref<string[]>(...)`. This lets Vue components read live unlock state reactively without a new
wrapper composable; `isUnlocked`/`unlockedCount` (the existing plain functions, used by the terminal
command which re-renders on each command rather than reactively) are untouched.

## Toast queue

`unlock()` already computes `newly: string[]` (the id just unlocked, plus `completionist` when it
cascades). It gains one more effect: pushing `{ id, title }` for each newly-unlocked achievement
onto a new exported `toastQueue: Ref<{ id: string; title: Localised<string> }[]>`, plus a
`dismissToast(id: string)` helper that filters it out.

This lives inside `unlock()` itself, not `announce()`/`toast()` (the existing terminal-rendering
helpers) — every call site funnels through `unlock()` regardless of whether it goes on to call
`announce`, including the raw `unlock('konami')` call in `App.vue` that currently has no rendering
step at all. Centralizing here means the floating toast (below) covers every unlock, including that
one, without touching any of the five existing call sites.

## UI

### `frontend/src/components/AchievementsModal.vue`

A fixed-position dialog, hand-rolled to match `TerminalOverlay.vue`'s existing focus-trap pattern
exactly (`role="dialog"`, `aria-modal`, manual `Tab`/`Shift+Tab` cycling, focus moved to the panel's
close button on open and restored to the triggering element on close, `Esc` closes) — there's no
dialog primitive in `components/ui/` today, and one component doesn't justify adding shadcn-vue's.
Takes `open` as a `v-model` (`defineModel`). Header shows `🏆 Achievements — {count}/18`. Body lists
all 18 in fixed order; unlocked rows show `title` + `description` + ✓, locked rows show `🔒` + `???`
+ `hint`.

### Nav button

A small `🏆` icon button in `NavBar.vue`, next to the existing language toggle, in both the
desktop (`hidden md:flex`) list and the mobile controls row — shown on mobile too, even though every
achievement currently requires the terminal or a keyboard (neither reliably available on a phone),
same reasoning as the original draft: locked entries with hints double as a "come back on desktop"
nudge rather than a dead end. Toggles a local `ref` that's passed to `AchievementsModal` via
`v-model:open`; no new global singleton state needed since there's exactly one place that opens it.

Icon choice: a plain `🏆` emoji character, not an SVG or `lucide-vue-next` icon (a declared but
currently unused dependency in this project). `NavBar.vue` already hand-rolls its hamburger icon as
inline SVG, and the terminal's own toast line already uses `🏆` for the same concept — matching
either existing convention is reasonable, and emoji is less code for a single-glyph button.

### `frontend/src/components/AchievementToast.vue`

Mounted once in `App.vue`. Watches `toastQueue`'s length; whenever it grows and nothing is
currently shown, displays the first entry's `title` as `🏆 Achievement unlocked: {title}`, calls
`dismissToast` and clears itself after a timeout, then checks the queue again — so a burst of
several unlocks (e.g. the `completionist` cascade) shows one at a time rather than overlapping.
Positioned top-right (`fixed top-16 right-4`, below the fixed navbar) so it never collides with the
terminal launcher (bottom-right) or the terminal overlay (bottom-anchored). `role="status"
aria-live="polite"`. Under `prefers-reduced-motion`, skips the slide/fade transition and uses a
shorter fixed display time — consistent with how `matrix`/`sl`/CRT overdrive already degrade.

## i18n

New `m.achievements` namespace in `messages.ts`: `title`, `open` (button label), `close`,
`toastPrefix`. Achievement `title`/`hint`/`description` strings stay on the `Achievement` objects
themselves, matching the existing convention already established by `achievements.ts` (content data
carries its own `Localised<T>` fields rather than routing through `m.*`).

## Out of scope

- No new achievements, and no change to what unlocks what — this is presentation only.
- No cross-device sync — unlock state is already `localStorage`-only in the existing
  implementation; unchanged here.
- No removal of the terminal `achievements` command — it stays, and gets the same hint treatment as
  the modal, so the two surfaces agree.
