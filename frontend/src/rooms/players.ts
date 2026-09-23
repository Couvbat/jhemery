/** What a player tells the page, several times a second while it moves. */
export interface PlayerReading {
  /** Seconds into the item. */
  position: number
  playing: boolean
  /** Local clock, ms. */
  at: number
}

/** What the page tells a player. Both players expose exactly this; the sync logic
 *  in `RoomPage.vue` never knows which one it is driving. */
export interface PlayerHandle {
  play(): void
  pause(): void
  seekTo(seconds: number): void
}
