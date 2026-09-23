<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { PlayerReading } from './players'
import { YOUTUBE_ORIGIN, youtubeEmbed } from './sync'

/**
 * The YouTube embed, driven over its message API — the protocol the official
 * IFrame API script speaks on a page's behalf, spoken directly. No third-party
 * script runs on this origin (the same call `MusicSection` made about the
 * SoundCloud widget), and the CSP grows by one `frame-src`, not a `script-src`.
 * `enablejsapi=1` and an `origin` equal to ours are what make the frame listen.
 */
const props = defineProps<{ media: string; host: boolean; autoplay: boolean }>()
const emit = defineEmits<{ reading: [reading: PlayerReading]; finished: [] }>()

const frame = ref<HTMLIFrameElement | null>(null)
const src = computed(() => {
  const url = youtubeEmbed(props.media, window.location.origin, props.host)
  return props.autoplay ? `${url}&autoplay=1` : url
})

/** YT.PlayerState: 1 playing, 3 buffering on its way to playing, 0 ended. */
const PLAYING = new Set([1, 3])
let position = 0
let playing = false
let lastState: number | null = null
let ready = false
let handshake: ReturnType<typeof setInterval> | undefined

function post(message: Record<string, unknown>) {
  frame.value?.contentWindow?.postMessage(
    JSON.stringify({ ...message, id: 1, channel: 'widget' }),
    YOUTUBE_ORIGIN,
  )
}

function command(func: string, args: unknown[] = []) {
  post({ event: 'command', func, args })
}

/** The frame reports nothing until told to, and its `load` event is not the same
 *  moment as its player being ready to hear it — so it is asked until it answers. */
function onLoad() {
  ready = false
  clearInterval(handshake)
  post({ event: 'listening' })
  handshake = setInterval(() => {
    if (ready) clearInterval(handshake)
    else post({ event: 'listening' })
  }, 500)
}

function report() {
  emit('reading', { position, playing, at: Date.now() })
}

function onState(state: number) {
  playing = PLAYING.has(state)
  if (state === 0 && lastState !== 0) emit('finished')
  lastState = state
}

function onMessage(event: MessageEvent) {
  if (event.origin !== YOUTUBE_ORIGIN || event.source !== frame.value?.contentWindow) return
  let data: { event?: string; info?: unknown }
  try {
    data = JSON.parse(String(event.data)) as { event?: string; info?: unknown }
  } catch {
    return
  }
  if (data.event === 'onReady') {
    ready = true
    clearInterval(handshake)
    return
  }
  if (data.event === 'infoDelivery' && data.info && typeof data.info === 'object') {
    const info = data.info as { currentTime?: number; playerState?: number }
    if (typeof info.currentTime === 'number') position = info.currentTime
    if (typeof info.playerState === 'number') onState(info.playerState)
    report()
  } else if (data.event === 'onStateChange' && typeof data.info === 'number') {
    onState(data.info)
    report()
  }
}

onMounted(() => window.addEventListener('message', onMessage))
onUnmounted(() => {
  window.removeEventListener('message', onMessage)
  clearInterval(handshake)
})

defineExpose({
  play: () => command('playVideo'),
  pause: () => command('pauseVideo'),
  seekTo: (seconds: number) => command('seekTo', [seconds, true]),
})
</script>

<template>
  <iframe
    ref="frame"
    :key="media"
    :src="src"
    class="aspect-video w-full rounded border border-border bg-black"
    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
    allowfullscreen
    referrerpolicy="strict-origin-when-cross-origin"
    title="YouTube"
    @load="onLoad"
  ></iframe>
</template>
