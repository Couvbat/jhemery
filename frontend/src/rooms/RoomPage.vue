<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { findView, profile } from '@/content'
import type { Localised } from '@/content/types'
import { useLocale } from '@/i18n'
import type { RoomKind, RoomPatch } from '@/lib/api'
import CopyButton from '@/tools/CopyButton.vue'
import SoundCloudPlayer from './SoundCloudPlayer.vue'
import YouTubePlayer from './YouTubePlayer.vue'
import type { PlayerHandle, PlayerReading } from './players'
import {
  expectedPosition,
  formatClock,
  isSeek,
  itemLabel,
  mediaSource,
  moveItem,
  normaliseCode,
  parseMedia,
  reconcile,
} from './sync'
import { useRoom } from './useRoom'
import WindowDots from '@/components/WindowDots.vue'

/**
 * Both room pages. The `kind` decides what a host may load and the words, and each
 * item's source decides its player; everything else — the lobby, the code, the head
 * count, and the loop that keeps a guest's player on the host's second — is the same
 * feature twice (spec §6).
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
/** Titles render by interpolation only, never as markup: they are a third party's text. */
const titles = computed(() => snapshot.value?.titles)
const label = (media: string) => itemLabel(media, titles.value)
/** A button's label naming its item. The replacer is a function so a `$&` or `$$` in a
 *  title is printed as written rather than read as a replacement pattern. */
const naming = (message: Localised<string>, media: string) => t(message).replace('{item}', () => label(media))
const members = computed(() => snapshot.value?.members ?? 0)
/** The current item's embed. Per item, not per room: a radio queue mixes the two. */
const source = computed(() => (state.value?.media ? mediaSource(state.value.media) : null))
const Player = computed(() => (source.value === 'youtube' ? YouTubePlayer : SoundCloudPlayer))
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
/**
 * A new source is a new player with its own clock, mounted from scratch. Its first
 * readings must not be weighed against the old one's: the anchor timer starts over,
 * and a guest's seek cooldown, set against the old player, no longer applies.
 */
watch(source, () => {
  last = null
  lastAnchor = 0
  seekCooldownUntil = 0
})

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

/**
 * True while a queue edit is on its way to the server. The state route replaces the
 * whole queue, so every edit is built from the last snapshot, and two quick clicks
 * would both start from the same one: the second would quietly undo the first. So
 * the sidebar's buttons go inert until the answer lands.
 */
const queueBusy = ref(false)
let queueEdits = 0
let lastEdit: Promise<void> = Promise.resolve()

/**
 * Runs one queue edit after any still in flight, building its patch only once those
 * have landed, from the queue as it stands by then. The buttons are inert meanwhile,
 * but a track that ends on its own or a link added to the queue must not be dropped,
 * so those wait their turn instead.
 */
function editQueue(build: () => RoomPatch): Promise<void> {
  queueEdits += 1
  queueBusy.value = true
  const run = lastEdit
    .then(() => room.update(build()))
    .finally(() => {
      queueEdits -= 1
      queueBusy.value = queueEdits > 0
    })
  lastEdit = run.catch(() => undefined)
  return run
}

async function enqueue() {
  const media = parsed()
  if (!media) return
  mediaInput.value = ''
  await editQueue(() => ({ queue: [...queue.value, media] }))
}

function next(): Promise<void> {
  return editQueue(() => {
    const [head, ...rest] = queue.value
    return { media: head ?? null, queue: rest, position: 0, playing: head !== undefined }
  })
}

const queueList = ref<HTMLOListElement | null>(null)

/**
 * Puts focus back on the same button of the item that moved, wherever the list put
 * it. Without this, a keyboard user would lose their place after every press: the
 * buttons go inert mid-edit and the rows are re-rendered in their new order.
 */
async function refocus(index: number, action: 'up' | 'down' | 'remove') {
  await nextTick()
  const rows = queueList.value?.children
  if (!rows?.length) return
  const row = rows[Math.min(index, rows.length - 1)]
  row?.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)?.focus()
}

async function moveAt(index: number, to: number) {
  if (queueBusy.value || to < 0 || to >= queue.value.length) return
  const direction = to < index ? 'up' : 'down'
  await editQueue(() => ({ queue: moveItem(queue.value, index, to) }))
  await refocus(to, direction)
}

async function removeAt(index: number) {
  if (queueBusy.value) return
  await editQueue(() => ({ queue: queue.value.filter((_, i) => i !== index) }))
  await refocus(index, 'remove')
}

function skip() {
  if (!queueBusy.value) void next()
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
        <h1 tabindex="-1" class="text-2xl md:text-3xl font-bold glow-cyan text-accent rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
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
        <p v-else-if="status === 'off'" class="text-sm text-warning">{{ t(m.rooms.off) }}</p>
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
            <WindowDots />
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
              <!--
                Two columns from `lg` only: inside max-w-5xl, a 17rem sidebar at `md`
                would leave the video under about 450 px. Below that the sidebar
                stacks under the player and its controls, in reading order.
              -->
              <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
                <div class="min-w-0 space-y-4">
                  <component
                    :is="Player"
                    v-if="state?.media"
                    ref="player"
                    :media="state.media"
                    :host="isHost"
                    :autoplay="autoplay"
                    :compact="kind === 'radio'"
                    @reading="onReading"
                    @finished="onFinished"
                  />
                  <div
                    v-else
                    class="aspect-video w-full rounded border border-dashed border-border grid place-items-center text-muted-foreground"
                  >
                    {{ isHost ? t(m.rooms.nothing) : t(m.rooms.waiting) }}
                  </div>

                  <p class="text-xs text-muted-foreground">
                    {{ isHost ? t(m.rooms.youAreHost) : t(m.rooms.youAreGuest) }}
                  </p>

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
                    </form>
                    <p v-if="mediaError" class="text-xs text-destructive">{{ badLink }}</p>
                    <p v-else-if="error" class="text-xs text-destructive">{{ error }}</p>
                  </template>
                </div>

                <!--
                  Buttons rather than drag and drop: they work with a keyboard, a screen
                  reader and a thumb at no extra cost, and the queue holds 50 at most.
                  They are `aria-disabled` rather than `disabled` while an edit is in
                  flight, so the focused one keeps focus.
                -->
                <aside
                  :aria-label="t(m.rooms.upNext)"
                  class="min-w-0 space-y-4 text-xs lg:border-l lg:border-border lg:pl-4"
                >
                  <div class="space-y-1">
                    <h2 class="text-muted-foreground">--{{ t(m.rooms.nowPlaying) }}</h2>
                    <template v-if="state?.media">
                      <!-- One item, so a long title wraps here rather than being cut as in the list. -->
                      <p class="font-mono text-sm text-foreground break-words" :title="state.media">
                        {{ label(state.media) }}
                      </p>
                      <p class="flex items-center gap-2 text-muted-foreground tabular-nums">
                        <span :class="state.playing ? 'text-primary' : ''">{{ state.playing ? '▶' : '❚❚' }}</span>
                        <span>{{ formatClock(position) }}</span>
                      </p>
                    </template>
                    <p v-else class="text-muted-foreground">{{ t(m.rooms.nothingPlaying) }}</p>
                  </div>

                  <div class="space-y-2">
                    <div class="flex items-center gap-2">
                      <h2 class="text-muted-foreground">--{{ t(m.rooms.upNext) }}</h2>
                      <button
                        v-if="isHost && queue.length"
                        type="button"
                        :aria-disabled="queueBusy"
                        class="ml-auto px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors aria-disabled:opacity-40 aria-disabled:cursor-not-allowed"
                        @click="skip"
                      >
                        {{ t(m.rooms.next) }} →
                      </button>
                    </div>
                    <ol v-if="queue.length" ref="queueList" class="font-mono space-y-1">
                      <li v-for="(item, index) in queue" :key="`${index}-${item}`" class="flex items-center gap-1">
                        <span class="text-muted-foreground tabular-nums">{{ index + 1 }}.</span>
                        <span class="flex-1 min-w-0 truncate" :title="item">{{ label(item) }}</span>
                        <template v-if="isHost">
                          <button
                            type="button"
                            data-action="up"
                            :aria-disabled="queueBusy || index === 0"
                            :aria-label="naming(m.rooms.moveUp, item)"
                            class="w-6 h-6 shrink-0 grid place-items-center rounded text-muted-foreground hover:text-foreground aria-disabled:opacity-40 aria-disabled:cursor-not-allowed"
                            @click="moveAt(index, index - 1)"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            data-action="down"
                            :aria-disabled="queueBusy || index === queue.length - 1"
                            :aria-label="naming(m.rooms.moveDown, item)"
                            class="w-6 h-6 shrink-0 grid place-items-center rounded text-muted-foreground hover:text-foreground aria-disabled:opacity-40 aria-disabled:cursor-not-allowed"
                            @click="moveAt(index, index + 1)"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            data-action="remove"
                            :aria-disabled="queueBusy"
                            :aria-label="naming(m.rooms.remove, item)"
                            class="w-6 h-6 shrink-0 grid place-items-center rounded text-muted-foreground hover:text-destructive aria-disabled:opacity-40 aria-disabled:cursor-not-allowed"
                            @click="removeAt(index)"
                          >
                            ×
                          </button>
                        </template>
                      </li>
                    </ol>
                    <p v-else class="text-muted-foreground">
                      {{ isHost ? t(m.rooms.queueEmptyHost) : t(m.rooms.queueEmptyGuest) }}
                    </p>
                  </div>
                </aside>
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
