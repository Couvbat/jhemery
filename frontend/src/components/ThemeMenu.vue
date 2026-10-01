<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useLocale } from '@/i18n'
import { useTheme } from '@/composables/useTheme'
import { MOTION_SETTINGS, useMotion, type MotionSetting } from '@/composables/useMotion'
import { swatch, type Theme } from '@/lib/themes'
import { tryTheme } from '@/terminal/achievements'

/**
 * The navbar's way to `theme`, and on a phone the only one: the terminal launcher is
 * `hidden` below `md` (spec §9), so without this a phone visitor could never leave the
 * default. It applies through the same `setTheme` and records through the same
 * `tryTheme` as the command, so the flash, the saved choice and both achievements come
 * along. Unlocks reach the floating toast on their own — `unlock()` queues it.
 *
 * The menu is positioned against the nearest positioned ancestor rather than this
 * component, so that it can hang from the bar's right edge wherever the button sits:
 * `NavBar`'s `<nav>` is `relative` for it. Attributes land on the button, which is the
 * part the navbar styles.
 *
 * Under the schemes, the same menu sets motion (*full · calm · paused*), as `motion`
 * does. Under the OS's reduced-motion setting the level is `paused` whatever is picked,
 * so the other two are `aria-disabled` and point at a note saying why, rather than
 * hidden: a visitor wondering where the animations went should find the answer here.
 */
defineOptions({ inheritAttrs: false })

const { t, m } = useLocale()
// The menu shows and compares the visitor's choice, not a scheme `tour` is previewing:
// picking the scheme on show has to keep it, and the check mark has to stay theirs.
const { chosen: active, theme: painted, themes, setTheme } = useTheme()
const { level: motion, osReduced, setMotion } = useMotion()

/** Held at `paused` by the OS: picking either of the others would change nothing. */
function motionHeld(id: MotionSetting): boolean {
  return osReduced.value && id !== 'paused'
}

function pickMotion(id: MotionSetting) {
  if (motionHeld(id)) return
  setMotion(id)
}

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const triggerEl = ref<HTMLButtonElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)

onClickOutside(rootEl, () => (open.value = false))

/** From the DOM, not a `v-for` ref array: Vue doesn't promise those keep the list's order. */
function items(): HTMLButtonElement[] {
  return [...(menuEl.value?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])]
}

async function show() {
  open.value = true
  await nextTick()
  // Into the menu, on the scheme in use — the WAI-ARIA menu button pattern.
  menuEl.value?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
}

function hide() {
  open.value = false
  triggerEl.value?.focus()
}

/** Stays open on a pick: the page repaints behind the menu, so it is a live preview, and
 *  `ricer` wants five of them. */
function pick(theme: Theme) {
  if (theme.id === active.value.id && theme.id === painted.value.id) return
  tryTheme(setTheme(theme.id)!)
}

function move(event: KeyboardEvent) {
  const list = items()
  const at = list.indexOf(document.activeElement as HTMLButtonElement)
  const to = {
    ArrowDown: (at + 1) % list.length,
    ArrowUp: (at - 1 + list.length) % list.length,
    Home: 0,
    End: list.length - 1,
  }[event.key]
  if (to === undefined) return
  event.preventDefault()
  list[to]?.focus()
}

function onKeydown(event: KeyboardEvent) {
  if (!open.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    hide()
  } else if (event.key === 'Tab') {
    // Focus leaves for the next thing on the page, and the menu doesn't stay behind.
    open.value = false
  } else if (menuEl.value?.contains(event.target as Node)) {
    move(event)
  }
}
</script>

<template>
  <div ref="rootEl" @keydown="onKeydown">
    <button
      ref="triggerEl"
      v-bind="$attrs"
      type="button"
      :title="t(m.nav.theme)"
      :aria-label="t(m.nav.theme)"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="open ? (open = false) : show()"
      @keydown.down.prevent="show"
    >
      🎨
    </button>

    <div
      v-if="open"
      class="absolute right-4 top-full mt-1 z-10 w-64 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-4.5rem)] overflow-y-auto rounded border border-border bg-card p-1 text-xs shadow-lg"
    >
      <!-- The command this menu stands in for, with the scheme on screen as its
           argument. Decoration for the eye; the menu's label says the same for a reader. -->
      <p class="px-2 pt-1 pb-1.5 text-muted-foreground" aria-hidden="true">
        $ theme <span class="text-foreground">{{ active.id }}</span>
      </p>
      <div ref="menuEl" role="menu" :aria-label="t(m.nav.theme)">
        <!-- Two groups, because menuitemradios that share a parent are one set: without
             them, picking a scheme would read as unchecking the motion. -->
        <div role="group" :aria-label="t(m.nav.theme)">
          <button
            v-for="theme in themes"
            :key="theme.id"
            type="button"
            role="menuitemradio"
            :aria-checked="theme.id === active.id"
            tabindex="-1"
            class="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:bg-primary/15 focus-visible:outline-none"
            @click="pick(theme)"
          >
            <!-- `git branch`'s marker, as in `theme`'s own listing. -->
            <span class="w-2 text-primary" aria-hidden="true">{{ theme.id === active.id ? '*' : '' }}</span>
            <span :class="['flex-1 truncate', theme.id === active.id ? 'text-primary' : 'text-foreground']">
              {{ theme.id }}
            </span>
            <!-- The strip on the scheme's own background, so a light scheme looks light
                 before it whites the page out. Literal colours, like the terminal's. -->
            <span
              class="flex shrink-0 gap-px rounded-sm border p-0.5"
              :style="{ backgroundColor: theme.colours.background, borderColor: theme.colours.border }"
              aria-hidden="true"
            >
              <span
                v-for="(colour, i) in swatch(theme)"
                :key="i"
                class="size-2 rounded-[1px]"
                :style="{ backgroundColor: colour }"
              />
            </span>
          </button>
        </div>

        <div role="separator" class="my-1 border-t border-border"></div>
        <p class="px-2 pt-1 pb-1.5 text-muted-foreground" aria-hidden="true">
          $ motion <span class="text-foreground">{{ motion }}</span>
        </p>
        <div role="group" :aria-label="t(m.motion.label)">
          <button
            v-for="id in MOTION_SETTINGS"
            :key="id"
            type="button"
            role="menuitemradio"
            :aria-checked="id === motion"
            :aria-disabled="motionHeld(id) || undefined"
            :aria-describedby="motionHeld(id) ? 'motion-held' : undefined"
            tabindex="-1"
            :class="[
              'w-full flex items-baseline gap-2 rounded px-2 py-1.5 text-left transition-colors focus-visible:bg-primary/15 focus-visible:outline-none',
              motionHeld(id) ? 'cursor-not-allowed opacity-60' : 'hover:bg-muted',
            ]"
            @click="pickMotion(id)"
          >
            <span class="w-2 text-primary" aria-hidden="true">{{ id === motion ? '*' : '' }}</span>
            <span :class="['w-12 shrink-0', id === motion ? 'text-primary' : 'text-foreground']">{{ id }}</span>
            <span class="flex-1 truncate text-muted-foreground">{{ t(m.motion[id]) }}</span>
          </button>
        </div>
      </div>
      <p v-if="osReduced" id="motion-held" class="px-2 pt-1 pb-1.5 text-muted-foreground">
        {{ t(m.motion.os) }}
      </p>
    </div>
  </div>
</template>
