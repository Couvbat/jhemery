<script setup lang="ts">
import { computed, defineAsyncComponent, type Component } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { findView, profile } from '@/content'
import { useLocale } from '@/i18n'
import { findTool, visibleTools, type ToolMeta, type ToolTier } from '@/tools/registry'

const route = useRoute()
const { t, m } = useLocale()
const view = findView('tools')!

const requested = computed(() => {
  const param = route.params.tool
  return Array.isArray(param) ? param[0] : param
})
const tool = computed(() => (requested.value ? findTool(requested.value) : undefined))
const unknown = computed(() => Boolean(requested.value) && !tool.value)

// One async component per tool, made on first open and kept: a fresh
// `defineAsyncComponent` on every render would remount the panel and lose whatever
// the visitor had typed into it.
const panels = new Map<string, Component>()
function panelFor(meta: ToolMeta): Component {
  const existing = panels.get(meta.id)
  if (existing) return existing
  const created: Component = defineAsyncComponent(meta.load)
  panels.set(meta.id, created)
  return created
}
const panel = computed(() => (tool.value ? panelFor(tool.value) : null))
const listed = computed(() => visibleTools())

const TIER_LABEL: Record<ToolTier, keyof typeof m.tools> = {
  client: 'tierClient',
  wasm: 'tierWasm',
  admin: 'tierAdmin',
}
</script>

<template>
  <main class="scanlines min-h-screen pt-14">
    <div class="max-w-5xl mx-auto px-4 py-16 md:py-20 space-y-10">
      <header>
        <p class="text-muted-foreground text-sm mb-1">
          <span class="text-primary">{{ profile.handle }}</span
          ><span class="text-muted-foreground">:~$</span>
          <span class="ml-2 text-foreground">{{ view.prompt }}</span>
        </p>
        <h1 class="text-2xl md:text-3xl font-bold glow-cyan text-accent">
          <span class="text-accent">#</span> {{ t(view.heading) }}
        </h1>
        <p class="mt-3 text-sm text-muted-foreground max-w-2xl">{{ t(m.tools.subtitle) }}</p>
      </header>

      <section v-if="tool && panel" :aria-label="t(tool.name)" class="space-y-3">
        <p class="text-xs text-muted-foreground font-mono">
          <RouterLink to="/tools" class="text-primary hover:underline">~/tools</RouterLink>
          <span>/{{ tool.id }}</span>
        </p>
        <component :is="panel" />
      </section>

      <p v-else-if="unknown" class="font-mono text-sm text-destructive">
        bash: cd: tools/{{ requested }}: No such file or directory
      </p>

      <ul class="grid gap-4 sm:grid-cols-2" :aria-label="t(m.tools.list)">
        <li v-for="entry in listed" :key="entry.id">
          <RouterLink
            :to="`/tools/${entry.id}`"
            class="group block h-full rounded border bg-card overflow-hidden transition-colors"
            :class="entry.id === tool?.id ? 'border-primary/60 border-glow' : 'border-border hover:border-primary/60'"
            :aria-current="entry.id === tool?.id ? 'page' : undefined"
          >
            <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
              <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
              <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
              <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
              <span class="ml-3 text-xs text-muted-foreground">{{ entry.id }}.sh</span>
              <span class="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                {{ t(m.tools[TIER_LABEL[entry.tier]]) }}
              </span>
            </div>
            <div class="p-4">
              <h2 class="font-semibold text-foreground group-hover:text-primary transition-colors">
                {{ t(entry.name) }}
              </h2>
              <p class="mt-1 text-sm text-muted-foreground">{{ t(entry.description) }}</p>
            </div>
          </RouterLink>
        </li>
      </ul>

      <p class="text-xs text-muted-foreground hidden md:block">{{ t(m.tools.hint) }}</p>
    </div>
  </main>
</template>
