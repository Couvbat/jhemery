<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { eventStart, isLive, soonestEvent, upcomingLabels } from '@/content/upcoming'
import { useLocale } from '@/i18n'
import { relative } from '@/tools/time/time'

/**
 * The footer's event, once one is a week away or on (`content/upcoming.ts`). Its own chunk,
 * built only while `content/events.ts` lists something (`__HAS_EVENTS__`), so an empty list
 * costs the home page nothing. It re-reads the clock every minute, as the uptime beside it
 * does, so "in 5 minutes" turns into "live" on a tab left open.
 */

const { t, locale } = useLocale()

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 60_000)
})
onUnmounted(() => clearInterval(timer))

const soon = computed(() => {
  const at = new Date(now.value)
  const event = soonestEvent(at)
  if (!event) return null
  const live = isLive(event, at)
  const when = live ? t(upcomingLabels.footerLive) : relative(eventStart(event), at, locale.value)
  return { live, label: `${when} · ${t(event.title)}` }
})
</script>

<template>
  <template v-if="soon">
    <RouterLink
      to="/now"
      data-testid="footer-event"
      :class="['hover:text-primary transition-colors', soon.live ? 'text-primary' : 'text-accent']"
    >
      {{ soon.live ? '●' : '◆' }} {{ soon.label }}
    </RouterLink>
    <span class="text-muted-foreground/40" aria-hidden="true">·</span>
  </template>
</template>
