<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { findView, profile } from '@/content'
import { useLocale } from '@/i18n'
import type { RoomKind, RoomPatch } from '@/lib/api'
import CopyButton from '@/tools/CopyButton.vue'
import SoundCloudPlayer from './SoundCloudPlayer.vue'
import YouTubePlayer from './YouTubePlayer.vue'
import type { PlayerHandle, PlayerReading } from './players'
import { expectedPosition, formatClock, isSeek, mediaLabel, normaliseCode, parseMedia, reconcile } from './sync'
import { useRoom } from './useRoom'

/**
 * Both room pages. The `kind` decides the player and the words; everything else —
 * the lobby, the code, the head count, and the loop that keeps a guest's player on
 * the host's second — is the same feature twice (spec §6).
 */
const props = defineProps<{ kind: RoomKind }>()

const route = useRoute()
const router = useRouter()
const { t, m } = useLocale()
const view = findView(props.kind)!

const rawCode = computed(() => {
  const param = route.params.code
  return Array.isArray(param) ? param[0] : param
})
const code = computed(() => (rawCode.value ? normaliseCode(rawCode.value) : null))
/** Something code-shaped enough to be in the URL, but not a code. */
const badCode = computed(() => Boolean(rawCode.value) && code.value === null)

const room = useRoom(props.kind, code)
const { status, snapshot, isHost, error } = room
const state = computed(() => snapshot.value?.state ?? null)
const queue = computed(() => snapshot.value?.queue ?? [])
const members = computed(() => snapshot.value?.members ?? 0)
const Player = computed(() => (props.kind === 'watch' ? YouTubePlayer : SoundCloudPlayer))
const player = ref<PlayerHandle | null>(null)
/** Whether the item was already rolling when its frame was made; the player then
 *  asks to autoplay, so a guest who just joined mid-video does not open on pause. */
const autoplay = ref(false)
watch(
  () => state.value?.media,
  () => {
    autoplay.value = state.value?.playing ?? false
    last = null
  },
)

// ---- lobby ----------------------------------------------------------------------

const joinInput = ref('')
const joinError = ref(false)
const creating = ref(false)

async function create() {
  creating.value = true
  try {
    const made = await room.create()
    if (made) await router.push(`${view.path}/${made}`)
  } finally {
    creating.value = false
  }
}

function join() {
  const target = normaliseCode(joinInput.value)
  joinError.value = target === null
  if (target) void router.push(`${view.path}/${target}`)
}

// ---- host controls --------------------------------------------------------------

const mediaInput = ref('')
const mediaError = ref(false)

function parsed(): string | null {
  const media = parseMedia(props.kind, mediaInput.value)
  mediaError.value = media === null
  return media
}

async function playNow() {
  const media = parsed()
  if (!media) return
  mediaInput.value = ''
  await room.update({ media, position: 0, playing: true })
}

async function enqueue() {
  const media = parsed()
  if (!media) return
  mediaInput.value = ''
  await room.update({ queue: [...queue.value, media] })
}

async function next() {
  const [head, ...rest] = queue.value
  await room.update({ media: head ?? null, queue: rest, position: 0, playing: head !== undefined })
}

async function removeAt(index: number) {
  await room.update({ queue: queue.value.filter((_, i) => i !== index) })
}

/** The host's play/pause button drives the host's own player; the reading loop
 *  below sees the flip and tells the room, the same way it would for a click on the
 *  player itself. */
function toggle() {
  if (!state.value) return
  if (state.value.playing) player.value?.pause()
  else player.value?.play()
}

async function endRoom() {
  await room.end()
  await router.push(view.path)
}

// ---- the sync loop --------------------------------------------------------------

let last: PlayerReading | null = null
let lastAnchor = 0
let seekCooldownUntil = 0
let pending: ReturnType<typeof setTimeout> | undefined
let pendingPatch: RoomPatch | null = null

/** Host changes are coalesced for a quarter second: a dragged seek bar is one
 *  message, not thirty, and the rate limit on the state route is never in play. */
function broadcast(patch: RoomPatch) {
  pendingPatch = { ...pendingPatch, ...patch }
  clearTimeout(pending)
  pending = setTimeout(() => {
    const patchToSend = pendingPatch
    pendingPatch = null
    if (patchToSend) void room.update(patchToSend)
  }, 250)
}

function onReading(reading: PlayerReading) {
  const previous = last
  last = reading
  if (isHost.value) {
    if (!previous) return
    const flipped = previous.playing !== reading.playing
    const jumped = isSeek(previous, reading, previous.playing)
    if (flipped || jumped) {
      lastAnchor = reading.at
      broadcast({ position: reading.position, playing: reading.playing })
    } else if (reading.playing && reading.at - lastAnchor > 15_000) {
      // A fresh anchor every 15 s while playing: the host's own buffering is drift
      // too, and guests should follow the host, not the host's last message.
      lastAnchor = reading.at
      broadcast({ position: reading.position, playing: true })
    }
  } else {
    follow(reading)
  }
}

/** A guest matching the room: seek when out by more than the threshold — at most
 *  once every 1.5 s, since the player needs a moment to land — and follow play/pause. */
function follow(reading: PlayerReading) {
  const current = state.value
  const handle = player.value
  if (!current?.media || !handle) return
  const { seekTo, play } = reconcile(current, reading, room.serverNow())
  if (seekTo !== null && Date.now() > seekCooldownUntil) {
    seekCooldownUntil = Date.now() + 1500
    handle.seekTo(seekTo)
  }
  if (play === true) handle.play()
  else if (play === false) handle.pause()
}

// A paused player says nothing on its own, so guests also re-check on every frame
// the room sends and once a second.
watch(state, () => {
  if (!isHost.value && last) follow(last)
})

const position = ref(0)
const tick = setInterval(() => {
  if (!isHost.value && last) follow(last)
  position.value = state.value ? expectedPosition(state.value, room.serverNow()) : 0
}, 1000)

function onFinished() {
  if (isHost.value) void next()
}

onUnmounted(() => {
  clearInterval(tick)
  clearTimeout(pending)
})

// ---- chrome ---------------------------------------------------------------------

const link = computed(() => `${window.location.origin}${view.path}/${code.value ?? ''}`)
const intro = computed(() => t(props.kind === 'watch' ? m.rooms.introWatch : m.rooms.introRadio))
const inputLabel = computed(() => t(props.kind === 'watch' ? m.rooms.inputWatch : m.rooms.inputRadio))
const badLink = computed(() => t(props.kind === 'watch' ? m.rooms.badLinkWatch : m.rooms.badLinkRadio))
</script>

<template>
  <main class="scanlines min-h-screen pt-14">
    <div class="max-w-5xl mx-auto px-4 py-16 md:py-20 space-y-8">
      <header>
        <p class="text-muted-foreground text-sm mb-1">
          <span class="text-primary">{{ profile.handle }}</span
          ><span class="text-muted-foreground">:~$</span>
          <span class="ml-2 text-foreground">{{ view.prompt }}</span>
        </p>
        <h1 class="text-2xl md:text-3xl font-bold glow-cyan text-accent">
          <span class="text-accent">#</span> {{ t(view.heading) }}
        </h1>
        <p class="mt-3 text-sm text-muted-foreground max-w-2xl">{{ intro }}</p>
      </header>

      <!-- No code: the lobby, or the reasons there is none. -->
      <section v-if="!code" :aria-label="t(m.rooms.lobby)" class="space-y-4">
        <p v-if="badCode" class="font-mono text-sm text-destructive">
          bash: cd: {{ view.label.en }}/{{ rawCode }}: No such file or directory
        </p>
        <p v-if="status === 'checking'" class="text-sm text-muted-foreground">…</p>
        <p v-else-if="status === 'off'" class="text-sm text-yellow-400">{{ t(m.rooms.off) }}</p>
        <div v-else class="grid gap-4 sm:grid-cols-2">
          <div class="rounded border border-border bg-card p-4 md:p-6 space-y-3">
            <h2 class="font-semibold text-foreground">{{ t(m.rooms.host) }}</h2>
            <p class="text-sm text-muted-foreground">{{ t(m.rooms.hostHint) }}</p>
            <button
              type="button"
              :disabled="creating"
              class="px-3 py-1.5 rounded border border-primary/50 text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
              @click="create"
            >
              {{ creating ? t(m.rooms.creating) : t(m.rooms.create) }}
            </button>
            <p v-if="error" class="text-xs text-destructive">{{ t(m.rooms.createFailed) }} {{ error }}</p>
          </div>
          <form class="rounded border border-border bg-card p-4 md:p-6 space-y-3" @submit.prevent="join">
            <h2 class="font-semibold text-foreground">{{ t(m.rooms.guest) }}</h2>
            <p class="text-sm text-muted-foreground">{{ t(m.rooms.guestHint) }}</p>
            <div class="flex gap-2">
              <input
                v-model="joinInput"
                type="text"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                :placeholder="t(m.rooms.codePlaceholder)"
                :aria-label="t(m.rooms.codePlaceholder)"
                class="flex-1 min-w-0 h-9 rounded border border-border bg-transparent px-2 font-mono text-sm uppercase text-foreground focus:border-primary outline-none"
              />
              <button
                type="submit"
                class="px-3 py-1.5 rounded border border-primary/50 text-primary hover:bg-primary/10 transition-colors"
              >
                {{ t(m.rooms.join) }}
              </button>
            </div>
            <p v-if="joinError" class="text-xs text-destructive">{{ t(m.rooms.badCode) }}</p>
          </form>
        </div>
        <p class="text-xs text-muted-foreground max-w-2xl">{{ t(m.rooms.privacy) }}</p>
      </section>

      <!-- A code: the room, in whichever state the stream says it is. -->
      <section v-else :aria-label="`${t(view.heading)} ${code}`" class="space-y-4">
        <div class="rounded border border-border bg-card overflow-hidden border-glow">
          <div class="flex flex-wrap items-center gap-2 px-4 py-2 bg-muted border-b border-border">
            <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
            <span class="ml-3 font-mono text-sm text-foreground tracking-widest">{{ code }}</span>
            <CopyButton :text="link" />
            <span
              v-if="isHost"
              class="text-[10px] uppercase tracking-wider text-primary border border-primary/40 rounded px-1"
            >
              {{ t(m.rooms.host) }}
            </span>
            <span class="ml-auto text-xs text-muted-foreground tabular-nums">
              <template v-if="status === 'live'">{{ members }} {{ t(m.rooms.members) }}</template>
              <template v-else-if="status === 'connecting'">{{ t(m.rooms.joining) }}…</template>
            </span>
          </div>

          <div class="p-4 md:p-6 space-y-4 text-sm">
            <template v-if="status === 'gone' || status === 'lost'">
              <p class="text-destructive">{{ t(status === 'gone' ? m.rooms.gone : m.rooms.lost) }}</p>
              <div class="flex gap-3">
                <button
                  v-if="status === 'lost'"
                  type="button"
                  class="px-3 py-1.5 rounded border border-primary/50 text-primary hover:bg-primary/10 transition-colors"
                  @click="room.retry()"
                >
                  {{ t(m.rooms.retry) }}
                </button>
                <RouterLink :to="view.path" class="px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors">
                  {{ t(m.rooms.leave) }}
                </RouterLink>
              </div>
            </template>

            <template v-else>
              <component
                :is="Player"
                v-if="state?.media"
                ref="player"
                :media="state.media"
                :host="isHost"
                :autoplay="autoplay"
                @reading="onReading"
                @finished="onFinished"
              />
              <div
                v-else
                class="aspect-video w-full rounded border border-dashed border-border grid place-items-center text-muted-foreground"
              >
                {{ isHost ? t(m.rooms.nothing) : t(m.rooms.waiting) }}
              </div>

              <div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span v-if="state?.media" class="font-mono truncate max-w-full">{{ mediaLabel(kind, state.media) }}</span>
                <span v-if="state?.media" class="tabular-nums">{{ formatClock(position) }}</span>
                <span v-if="state?.media" :class="state.playing ? 'text-primary' : ''">
                  {{ state.playing ? '▶' : '❚❚' }}
                </span>
                <span class="ml-auto">{{ isHost ? t(m.rooms.youAreHost) : t(m.rooms.youAreGuest) }}</span>
              </div>

              <template v-if="isHost">
                <form class="flex flex-wrap gap-2" @submit.prevent="playNow">
                  <input
                    v-model="mediaInput"
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    :placeholder="inputLabel"
                    :aria-label="inputLabel"
                    class="flex-1 min-w-48 h-9 rounded border border-border bg-transparent px-2 text-sm text-foreground focus:border-primary outline-none"
                  />
                  <button
                    type="submit"
                    class="px-3 py-1.5 rounded border border-primary/50 text-primary hover:bg-primary/10 transition-colors"
                  >
                    {{ t(m.rooms.playNow) }}
                  </button>
                  <button
                    type="button"
                    class="px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                    @click="enqueue"
                  >
                    {{ t(m.rooms.enqueue) }}
                  </button>
                  <button
                    v-if="state?.media"
                    type="button"
                    class="px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                    @click="toggle"
                  >
                    {{ state.playing ? t(m.rooms.pause) : t(m.rooms.play) }}
                  </button>
                  <button
                    v-if="queue.length"
                    type="button"
                    class="px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                    @click="next"
                  >
                    {{ t(m.rooms.next) }} →
                  </button>
                </form>
                <p v-if="mediaError" class="text-xs text-destructive">{{ badLink }}</p>
                <p v-else-if="error" class="text-xs text-destructive">{{ error }}</p>
              </template>

              <div v-if="queue.length" class="space-y-1">
                <p class="text-xs text-muted-foreground">--{{ t(m.rooms.upNext) }}</p>
                <ol class="font-mono text-xs space-y-1">
                  <li v-for="(item, index) in queue" :key="`${index}-${item}`" class="flex items-center gap-2">
                    <span class="text-muted-foreground">{{ index + 1 }}.</span>
                    <span class="truncate">{{ mediaLabel(kind, item) }}</span>
                    <button
                      v-if="isHost"
                      type="button"
                      class="ml-auto text-muted-foreground hover:text-destructive"
                      :aria-label="t(m.rooms.remove)"
                      @click="removeAt(index)"
                    >
                      ×
                    </button>
                  </li>
                </ol>
              </div>

              <div class="flex flex-wrap gap-3 pt-2 border-t border-border">
                <RouterLink
                  :to="view.path"
                  class="px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
                >
                  {{ t(m.rooms.leave) }}
                </RouterLink>
                <button
                  v-if="isHost"
                  type="button"
                  class="px-3 py-1.5 rounded border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors"
                  @click="endRoom"
                >
                  {{ t(m.rooms.end) }}
                </button>
              </div>
            </template>
          </div>
        </div>
        <p class="text-xs text-muted-foreground max-w-2xl">{{ t(m.rooms.privacy) }}</p>
      </section>
    </div>
  </main>
</template>
