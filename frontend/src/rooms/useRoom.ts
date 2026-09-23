import { computed, onUnmounted, ref, shallowRef, watch, type Ref } from 'vue'
import {
  ApiError,
  api,
  roomEventsUrl,
  type RoomKind,
  type RoomPatch,
  type RoomSnapshot,
} from '@/lib/api'
import { ClockSkew } from './sync'

/**
 * A room, from the page's side: the feature flag, the held SSE connection, the
 * host token and the server clock. The composable owns the network; `RoomPage`
 * owns what to do with it.
 *
 * `checking` → `off` | `lobby` when there is no code; `connecting` → `live` when
 * there is one; `gone` when the room has ended (the stream fails and the room
 * 404s), `lost` when the backend itself cannot be reached.
 */
export type RoomStatus = 'checking' | 'off' | 'lobby' | 'connecting' | 'live' | 'gone' | 'lost'

/** Reconnects EventSource makes on its own before this gives up and asks why. */
const MAX_FAILURES = 3

/**
 * The host token lives in sessionStorage, keyed by code: a reload keeps the host
 * hosting, closing the tab forgets it, and it never sits in a URL anyone could
 * share by accident.
 */
function tokenKey(code: string): string {
  return `couvbat:room:${code}`
}
function storedToken(code: string): string | null {
  try {
    return sessionStorage.getItem(tokenKey(code))
  } catch {
    return null
  }
}
function storeToken(code: string, token: string): void {
  try {
    sessionStorage.setItem(tokenKey(code), token)
  } catch {
    // Private mode or blocked storage: hosting still works until the tab reloads.
  }
}

export function useRoom(kind: RoomKind, code: Ref<string | null>) {
  const status = ref<RoomStatus>('checking')
  const snapshot = shallowRef<RoomSnapshot | null>(null)
  const hostToken = ref<string | null>(null)
  const error = ref<string | null>(null)
  const skew = new ClockSkew()

  let source: EventSource | null = null
  let failures = 0

  function close() {
    source?.close()
    source = null
  }

  async function checkEnabled() {
    status.value = 'checking'
    try {
      const info = await api.rooms()
      status.value = info.enabled ? 'lobby' : 'off'
    } catch {
      status.value = 'off'
    }
  }

  function connect(target: string) {
    close()
    failures = 0
    status.value = 'connecting'
    if (typeof EventSource === 'undefined') {
      status.value = 'lost'
      return
    }
    source = new EventSource(roomEventsUrl(target))
    source.onmessage = (event) => {
      failures = 0
      try {
        const data = JSON.parse(event.data as string) as RoomSnapshot
        skew.sample(data.state.at, Date.now())
        snapshot.value = data
        status.value = 'live'
      } catch {
        // A malformed frame is not worth dropping the room for.
      }
    }
    source.onerror = () => {
      // Two different failures arrive here. An HTTP error — the 404 of a room that
      // has ended — closes the source for good and EventSource never retries, so
      // waiting for more attempts would wait forever. A dropped connection leaves it
      // reconnecting on its own, and gets three tries before the room is asked about
      // directly. Either way "ended" and "the API is down" deserve different words.
      failures += 1
      if (source?.readyState !== EventSource.CLOSED && failures < MAX_FAILURES) return
      close()
      void explain(target)
    }
  }

  async function explain(target: string) {
    try {
      await api.room(target)
      status.value = 'lost'
    } catch (caught) {
      status.value = caught instanceof ApiError && caught.status === 404 ? 'gone' : 'lost'
    }
  }

  /** Creates a room of this page's kind and remembers being its host. */
  async function create(): Promise<string | null> {
    error.value = null
    try {
      const room = await api.createRoom(kind)
      storeToken(room.code, room.hostToken)
      hostToken.value = room.hostToken
      return room.code
    } catch (caught) {
      error.value = caught instanceof ApiError ? caught.message : 'unreachable'
      return null
    }
  }

  async function update(patch: RoomPatch): Promise<void> {
    const target = code.value
    const token = hostToken.value
    if (!target || !token) return
    try {
      snapshot.value = await api.updateRoom(target, token, patch)
    } catch (caught) {
      // A refused token means this tab is not the host after all — a room made in
      // another tab, say. Demoted rather than stuck retrying.
      if (caught instanceof ApiError && caught.status === 403) hostToken.value = null
      else error.value = caught instanceof ApiError ? caught.message : 'unreachable'
    }
  }

  async function end(): Promise<void> {
    const target = code.value
    const token = hostToken.value
    if (!target || !token) return
    close()
    try {
      await api.endRoom(target, token)
    } catch {
      // The room will idle out on its own; nothing to tell the host.
    }
  }

  watch(
    code,
    (next) => {
      snapshot.value = null
      error.value = null
      if (next) {
        hostToken.value = storedToken(next)
        connect(next)
      } else {
        close()
        hostToken.value = null
        void checkEnabled()
      }
    },
    { immediate: true },
  )

  onUnmounted(close)

  return {
    status: computed(() => status.value),
    snapshot: computed(() => snapshot.value),
    isHost: computed(() => hostToken.value !== null),
    error: computed(() => error.value),
    create,
    update,
    end,
    retry: () => {
      if (code.value) connect(code.value)
    },
    /** The server's clock, as best the stream has taught us. */
    serverNow: () => skew.serverNow(Date.now()),
  }
}
