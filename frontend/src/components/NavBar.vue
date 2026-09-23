<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { sections, profile, views } from '@/content'
import { useLocale } from '@/i18n'
import { activeSection } from '@/composables/useActiveSection'
import { activeView, goTo } from '@/composables/useViewSwing'
import AchievementsModal from '@/components/AchievementsModal.vue'

const { t, m, locale, toggleLocale } = useLocale()

const menuOpen = ref(false)
const achievementsOpen = ref(false)

/** The other faces of the prism; `home` is the section links themselves. */
const pages = views.filter((v) => v.id !== 'home')

/** `goTo` knows whether a section is on the page showing — from `/tools` a section
 *  link routes home first, then scrolls once the swing has settled. */
function go(target: string) {
  goTo(target)
  menuOpen.value = false
}

function onScroll() {
  // Only the home page has sections to track. Elsewhere the loop would find nothing
  // and leave `activeSection` alone anyway; this just says so.
  if (activeView.value !== 'home') return
  for (const s of [...sections].reverse()) {
    const el = document.getElementById(s.id)
    if (el && window.scrollY >= el.offsetTop - 120) {
      activeSection.value = s.id
      break
    }
  }
}

onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <header
    class="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur border-b border-border"
  >
    <nav class="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
      <!-- Logo / Name -->
      <button
        @click="go('')"
        class="text-primary font-bold glow-green tracking-wider hover:opacity-80 transition-opacity"
      >
        <span class="text-muted-foreground">~/</span>{{ profile.alias }}
      </button>

      <!-- Desktop links.
           `lg`, not `md`: six sections plus three pages plus the two buttons need
           about 940px of bar, and the container is capped at `max-w-5xl` — 992px
           inside its padding. At `md` the bar was 40px short of its own contents,
           which pushed the language and achievement buttons off the right edge on a
           1024-wide window, and split every link between its `./` and its label on
           fonts a little wider than this one. Below `lg` the same destinations are
           all in the menu below, `pages` included.
           `gap-0.5` rather than `gap-1` for the same reason: it buys 20px, which
           takes the slack from 3% of the bar to 5%, and this broke on a machine
           whose monospace renders a little wider than the one measured on. -->
      <ul class="hidden lg:flex gap-0.5 items-center">
        <li v-for="s in sections" :key="s.id">
          <button
            @click="go(s.id)"
            :class="[
              'px-2 py-1 text-sm rounded whitespace-nowrap transition-colors',
              activeView === 'home' && activeSection === s.id
                ? 'text-primary glow-green'
                : 'text-muted-foreground hover:text-foreground',
            ]"
          >
            <span class="text-muted-foreground">./</span>{{ t(s.label) }}
          </button>
        </li>
        <!-- Real hrefs, so a crawler can reach the page; the click still goes through
             the router (and the prism) rather than a full load. -->
        <li v-for="v in pages" :key="v.id">
          <a
            :href="v.path"
            :aria-current="activeView === v.id ? 'page' : undefined"
            :class="[
              'inline-block px-2 py-1 text-sm rounded whitespace-nowrap transition-colors',
              activeView === v.id
                ? 'text-accent glow-cyan'
                : 'text-muted-foreground hover:text-foreground',
            ]"
            @click.prevent="go(v.id)"
          >
            <span class="text-muted-foreground">./</span>{{ t(v.label) }}
          </a>
        </li>
        <li>
          <button
            @click="toggleLocale"
            :title="t(m.nav.language)"
            :aria-label="t(m.nav.language)"
            class="ml-2 px-2 py-1 text-xs font-mono rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
          >
            {{ locale.toUpperCase() }}
          </button>
        </li>
        <li>
          <button
            @click="achievementsOpen = true"
            :title="t(m.achievements.open)"
            :aria-label="t(m.achievements.open)"
            class="ml-1 px-2 py-1 text-xs rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
          >
            🏆
          </button>
        </li>
      </ul>

      <!-- Mobile controls -->
      <div class="flex items-center gap-2 lg:hidden">
        <button
          @click="achievementsOpen = true"
          :aria-label="t(m.achievements.open)"
          class="px-2 py-1 text-xs rounded border border-border text-muted-foreground"
        >
          🏆
        </button>
        <button
          @click="toggleLocale"
          :aria-label="t(m.nav.language)"
          class="px-2 py-1 text-xs font-mono rounded border border-border text-muted-foreground"
        >
          {{ locale.toUpperCase() }}
        </button>
        <button
          class="text-primary p-2"
          @click="menuOpen = !menuOpen"
          :aria-label="t(m.nav.toggleMenu)"
          :aria-expanded="menuOpen"
        >
          <svg
            v-if="!menuOpen"
            xmlns="http://www.w3.org/2000/svg"
            class="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg"
            class="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </nav>

    <!-- Mobile menu -->
    <div v-if="menuOpen" class="lg:hidden border-t border-border bg-background">
      <ul class="flex flex-col px-4 py-2">
        <li v-for="s in sections" :key="s.id">
          <button
            @click="go(s.id)"
            class="w-full text-left py-2 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <span>$ cd ./{{ t(s.label) }}</span>
          </button>
        </li>
        <li v-for="v in pages" :key="v.id">
          <a
            :href="v.path"
            class="block w-full text-left py-2 text-sm text-muted-foreground hover:text-primary transition-colors"
            @click.prevent="go(v.id)"
          >
            <span>$ cd ./{{ t(v.label) }}</span>
          </a>
        </li>
      </ul>
    </div>

    <AchievementsModal v-model:open="achievementsOpen" />
  </header>
</template>
