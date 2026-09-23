import { computed, ref } from 'vue'
import { ApiError, api } from './api'

/**
 * The owner's unlock. One password — `ADMIN_PASSWORD` on the API — checked by
 * asking `GET /jobs`, the admin surface itself, whether it is right: a 200 is
 * yes, a 403 is no. Kept in sessionStorage, so a reload keeps the tools page
 * unlocked, closing the tab locks it, and it never sits in a URL. The
 * guestbook's `sudo rm` predates this and still asks every time, which for a
 * one-off delete is the right amount of friction.
 */
const KEY = 'couvbat:sudo'

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

function write(value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(KEY)
    else sessionStorage.setItem(KEY, value)
  } catch {
    // Blocked storage: unlocked for this page load, locked again after a reload.
  }
}

const password = ref<string | null>(read())

export const isAdmin = computed(() => password.value !== null)

export function adminPassword(): string | null {
  return password.value
}

export type UnlockResult = 'ok' | 'wrong' | 'unreachable'

export async function unlockAdmin(candidate: string): Promise<UnlockResult> {
  try {
    await api.jobs(candidate)
  } catch (caught) {
    return caught instanceof ApiError && caught.status === 403 ? 'wrong' : 'unreachable'
  }
  password.value = candidate
  write(candidate)
  return 'ok'
}

export function lockAdmin(): void {
  password.value = null
  write(null)
}
