/** What a player tells the page, several times a second while it moves. */
export interface PlayerReading {
  /** Seconds into the item. */
  position: number
  playing: boolean
  /** Local clock, ms. */
  at: number
}

/** What the page hands a player. Both take the same props, so `RoomPage` can swap
 *  one for the other per item without knowing which it mounted. */
export interface PlayerProps {
  media: string
  host: boolean
  autoplay: boolean
  /**
   * A small player rather than the room's centrepiece: a YouTube item in a radio
   * queue. Small, never hidden — YouTube's terms forbid hiding the video to keep the
   * sound, and set a 200×200 minimum. The SoundCloud widget is always this size.
   */
  compact?: boolean
}

/** What the page tells a player. Both players expose exactly this; the sync logic
 *  in `RoomPage.vue` never knows which one it is driving. */
export interface PlayerHandle {
  play(): void
  pause(): void
  seekTo(seconds: number): void
}
