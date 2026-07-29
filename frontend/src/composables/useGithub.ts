import { computed, ref } from 'vue'
import { api, type GithubCommit, type GithubContributions } from '@/lib/api'

const commits = ref<GithubCommit[] | null>(null)
const contributions = ref<GithubContributions | null>(null)
let commitsInFlight: Promise<void> | null = null
let contributionsInFlight: Promise<void> | null = null

export function fetchCommits(): Promise<void> {
  if (commits.value) return Promise.resolve()
  if (commitsInFlight) return commitsInFlight

  commitsInFlight = api
    .githubActivity()
    .then((data) => {
      if (data.configured && data.commits?.length) commits.value = data.commits
    })
    .catch(() => {
      // Unconfigured or rate-limited — the card stays hidden.
    })
    .finally(() => {
      commitsInFlight = null
    })

  return commitsInFlight
}

export function fetchContributions(): Promise<void> {
  if (contributions.value) return Promise.resolve()
  if (contributionsInFlight) return contributionsInFlight

  contributionsInFlight = api
    .githubContributions()
    .then((data) => {
      contributions.value = data
    })
    .catch(() => {
      contributions.value = { configured: false }
    })
    .finally(() => {
      contributionsInFlight = null
    })

  return contributionsInFlight
}

export function relativeTime(iso: string, justNow = 'just now'): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return justNow
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function shortRepo(repo: string): string {
  return repo.split('/')[1] ?? repo
}

export function useGithub(autoFetch = true) {
  if (autoFetch) {
    void fetchCommits()
    void fetchContributions()
  }
  return {
    commits: computed(() => commits.value),
    contributions: computed(() => contributions.value),
    fetchCommits,
    fetchContributions,
  }
}
