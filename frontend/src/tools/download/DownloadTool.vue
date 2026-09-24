<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useLocale } from '@/i18n'
import { adminPassword, isAdmin, lockAdmin, unlockAdmin } from '@/lib/admin'
import { ApiError, api, fetchJobFile, type DownloadJob } from '@/lib/api'
import ToolFrame from '../ToolFrame.vue'
import { formatBytes } from '../image/image'

/**
 * The admin tier's one tool. Locked, it is a password field; unlocked, it is a
 * thin client for the jobs API: start, poll while something moves, save once.
 * The server does the fetching and the deleting — this panel never holds a file
 * for longer than it takes to hand it to the browser's download.
 */
const { t, m } = useLocale()

// ---- unlock -----------------------------------------------------------------

const candidate = ref('')
const unlocking = ref(false)
const unlockError = ref<string | null>(null)

async function unlock() {
  if (!candidate.value) return
  unlocking.value = true
  unlockError.value = null
  const result = await unlockAdmin(candidate.value)
  unlocking.value = false
  if (result !== 'ok') {
    unlockError.value = t(result === 'wrong' ? m.toolDownload.wrong : m.toolDownload.unreachable)
    return
  }
  candidate.value = ''
  await refresh()
}

function lock() {
  lockAdmin()
  jobs.value = []
  configured.value = null
}

// ---- jobs -------------------------------------------------------------------

/** Null until the first answer; false is the documented "off on this deployment". */
const configured = ref<boolean | null>(null)
const jobs = ref<DownloadJob[]>([])
const url = ref('')
const starting = ref(false)
const fetching = ref<string | null>(null)
const error = ref<string | null>(null)
let timer: ReturnType<typeof setInterval> | undefined

const moving = computed(() => jobs.value.some((job) => job.status === 'queued' || job.status === 'running'))

function describe(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : t(m.toolDownload.unreachable)
}

async function refresh() {
  const password = adminPassword()
  if (!password) return
  try {
    const info = await api.jobs(password)
    configured.value = info.configured
    jobs.value = info.jobs
  } catch (caught) {
    // A password the server no longer takes — it changed — is a lock, not an error.
    if (caught instanceof ApiError && caught.status === 403) lock()
    else error.value = describe(caught)
  }
}

async function start() {
  const password = adminPassword()
  const target = url.value.trim()
  if (!password || !target) return
  starting.value = true
  error.value = null
  try {
    const job = await api.startJob(password, target)
    url.value = ''
    jobs.value = [job, ...jobs.value.filter((other) => other.id !== job.id)]
  } catch (caught) {
    error.value = describe(caught)
  } finally {
    starting.value = false
  }
}

/** Fetch-once: the server deletes the file as this completes, so the job goes too. */
async function save(job: DownloadJob) {
  const password = adminPassword()
  if (!password) return
  fetching.value = job.id
  error.value = null
  try {
    const blob = await fetchJobFile(password, job.id)
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = job.filename ?? 'download.mp3'
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(href), 10_000)
    jobs.value = jobs.value.filter((other) => other.id !== job.id)
  } catch (caught) {
    error.value = describe(caught)
  } finally {
    fetching.value = null
  }
}

/** Cancels a moving job or dismisses a finished one — the API has one verb for both. */
async function remove(job: DownloadJob) {
  const password = adminPassword()
  if (!password) return
  try {
    await api.cancelJob(password, job.id)
  } catch (caught) {
    if (!(caught instanceof ApiError && caught.status === 404)) error.value = describe(caught)
  }
  jobs.value = jobs.value.filter((other) => other.id !== job.id)
}

function statusClass(job: DownloadJob): string {
  if (job.status === 'done') return 'text-primary'
  if (job.status === 'failed') return 'text-destructive'
  return 'text-muted-foreground'
}

onMounted(() => {
  if (isAdmin.value) void refresh()
  // Polling only while something is moving keeps an idle open panel silent.
  timer = setInterval(() => {
    if (isAdmin.value && moving.value) void refresh()
  }, 1500)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <ToolFrame title="download.sh">
    <template #status>
      <span v-if="isAdmin" class="text-primary">root</span>
    </template>

    <template v-if="!isAdmin">
      <p class="text-muted-foreground">{{ t(m.toolDownload.locked) }}</p>
      <form class="flex flex-wrap gap-2" @submit.prevent="unlock">
        <input
          v-model="candidate"
          type="password"
          autocomplete="current-password"
          :placeholder="t(m.toolDownload.password)"
          :aria-label="t(m.toolDownload.password)"
          class="flex-1 min-w-48 h-9 rounded border border-border bg-transparent px-2 font-mono text-sm text-foreground focus:border-primary outline-none"
        />
        <button
          type="submit"
          :disabled="unlocking || !candidate"
          class="px-3 py-1.5 rounded border border-primary/50 text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
        >
          {{ t(m.toolDownload.unlock) }}
        </button>
      </form>
      <p v-if="unlockError" class="text-xs text-destructive">{{ unlockError }}</p>
    </template>

    <template v-else>
      <p v-if="configured === false" class="text-warning">{{ t(m.toolDownload.off) }}</p>

      <template v-else>
        <p class="text-muted-foreground">{{ t(m.toolDownload.intro) }}</p>
        <form class="flex flex-wrap gap-2" @submit.prevent="start">
          <input
            v-model="url"
            type="url"
            autocomplete="off"
            spellcheck="false"
            :placeholder="t(m.toolDownload.url)"
            :aria-label="t(m.toolDownload.url)"
            class="flex-1 min-w-48 h-9 rounded border border-border bg-transparent px-2 text-sm text-foreground focus:border-primary outline-none"
          />
          <button
            type="submit"
            :disabled="starting || !url.trim()"
            class="px-3 py-1.5 rounded border border-primary/50 text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
          >
            {{ starting ? t(m.toolDownload.starting) : t(m.toolDownload.start) }}
          </button>
        </form>
        <p v-if="error" class="text-xs text-destructive">{{ error }}</p>

        <ul v-if="jobs.length" class="space-y-2" :aria-label="t(m.toolDownload.jobs)">
          <li v-for="job in jobs" :key="job.id" class="rounded border border-border p-3 space-y-2">
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span class="font-mono truncate max-w-full text-foreground">{{ job.filename ?? job.url }}</span>
              <span :class="statusClass(job)">{{ t(m.toolDownload[job.status]) }}</span>
              <span v-if="job.size" class="text-muted-foreground">{{ formatBytes(job.size) }}</span>
              <span class="ml-auto flex gap-2">
                <button
                  v-if="job.status === 'done'"
                  type="button"
                  :disabled="fetching === job.id"
                  class="px-2 py-0.5 rounded border border-primary/50 text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                  @click="save(job)"
                >
                  {{ fetching === job.id ? t(m.toolDownload.fetching) : t(m.toolDownload.fetch) }}
                </button>
                <button
                  type="button"
                  class="px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
                  @click="remove(job)"
                >
                  {{ job.status === 'queued' || job.status === 'running' ? t(m.toolDownload.cancel) : t(m.toolDownload.remove) }}
                </button>
              </span>
            </div>
            <div
              v-if="job.status === 'queued' || job.status === 'running'"
              class="h-1.5 rounded bg-muted overflow-hidden"
              role="progressbar"
              :aria-valuenow="job.progress === null ? undefined : Math.round(job.progress * 100)"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div
                class="h-full bg-primary transition-[width] duration-500"
                :class="job.progress === null && 'animate-pulse'"
                :style="{ width: job.progress === null ? '100%' : `${Math.round(job.progress * 100)}%` }"
              ></div>
            </div>
            <p v-if="job.error" class="text-xs text-destructive">{{ job.error }}</p>
          </li>
        </ul>
        <p v-else class="text-xs text-muted-foreground">{{ t(m.toolDownload.empty) }}</p>
        <p class="text-xs text-muted-foreground">{{ t(m.toolDownload.ttl) }}</p>
      </template>

      <div class="pt-2 border-t border-border">
        <button
          type="button"
          class="px-2 py-0.5 text-xs rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          @click="lock"
        >
          {{ t(m.toolDownload.lock) }}
        </button>
      </div>
    </template>
  </ToolFrame>
</template>
