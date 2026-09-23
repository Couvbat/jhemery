<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { PlayerReading } from './players'
import { SOUNDCLOUD_ORIGIN, soundcloudEmbed } from './sync'

/**
 * The SoundCloud widget, driven over the messages its own Widget API script would
 * send — `{ method, value }` in, `{ method, value, widgetId }` out. Same reasoning
 * as `MusicSection`, which embeds the iframe and not the script: nothing from
 * w.soundcloud.com runs on this origin.
 */
const props = defineProps<{ media: string; host: boolean; autoplay: boolean }>()
const emit = defineEmits<{ reading: [reading: PlayerReading]; finished: [] }>()

const frame = ref<HTMLIFrameElement | null>(null)
const src = computed(() => {
  const url = soundcloudEmbed(props.media)
  return props.autoplay ? url.replace('auto_play=false', 'auto_play=true') : url
})

const EVENTS = ['ready', 'play', 'pause', 'playProgress', 'finish', 'seek']
let position = 0
let playing = false
let heard = false
let handshake: ReturnType<typeof setInterval> | undefined

function post(message: Record<string, unknown>) {
  frame.value?.contentWindow?.postMessage(JSON.stringify(message), SOUNDCLOUD_ORIGIN)
}

function subscribe() {
  for (const value of EVENTS) post({ method: 'addEventListener', value })
}

/** Subscriptions sent before the widget is listening are lost, so they are
 *  repeated until the first event comes back. */
function onLoad() {
  heard = false
  clearInterval(handshake)
  subscribe()
  handshake = setInterval(() => {
    if (heard) clearInterval(handshake)
    else subscribe()
  }, 500)
}

function report() {
  emit('reading', { position, playing, at: Date.now() })
}

function onMessage(event: MessageEvent) {
  if (event.origin !== SOUNDCLOUD_ORIGIN || event.source !== frame.value?.contentWindow) return
  let data: { method?: string; value?: unknown }
  try {
    data = JSON.parse(String(event.data)) as { method?: string; value?: unknown }
  } catch {
    return
  }
  heard = true
  const ms = (data.value as { currentPosition?: number } | null)?.currentPosition
  switch (data.method) {
    case 'play':
      playing = true
      report()
      break
    case 'pause':
      playing = false
      report()
      break
    case 'playProgress':
      if (typeof ms === 'number') position = ms / 1000
      playing = true
      report()
      break
    case 'seek':
      if (typeof ms === 'number') position = ms / 1000
      report()
      break
    case 'finish':
      playing = false
      report()
      emit('finished')
      break
    default:
      break
  }
}

onMounted(() => window.addEventListener('message', onMessage))
onUnmounted(() => {
  window.removeEventListener('message', onMessage)
  clearInterval(handshake)
})

defineExpose({
  play: () => post({ method: 'play' }),
  pause: () => post({ method: 'pause' }),
  seekTo: (seconds: number) => post({ method: 'seekTo', value: Math.round(seconds * 1000) }),
})
</script>

<template>
  <iframe
    ref="frame"
    :key="media"
    :src="src"
    height="166"
    class="w-full rounded"
    allow="autoplay"
    title="SoundCloud"
    @load="onLoad"
  ></iframe>
</template>
