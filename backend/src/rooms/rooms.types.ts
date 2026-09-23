export type RoomKind = 'watch' | 'radio';

/**
 * What the host's player is doing, anchored to the server clock so that every
 * guest can work out where it is *now*: `position + (now − at) / 1000` while
 * `playing`, `position` otherwise. Guests compare that with their own player and
 * seek when the two disagree by more than a couple of seconds.
 */
export interface PlaybackState {
  /** The current item: a YouTube video id for `watch`, a soundcloud.com URL for `radio`. */
  media: string | null;
  /** Seconds into the item, as of `at`. */
  position: number;
  playing: boolean;
  /** Server time in milliseconds when this state was set. */
  at: number;
}

/**
 * One frame of a room's SSE stream — everything a guest ever learns about a room.
 * `members` is a count, as in `/presence`: no ids, no names, nothing that tells
 * one guest from another, because a shared player needs none of that.
 */
export interface RoomSnapshot {
  code: string;
  kind: RoomKind;
  state: PlaybackState;
  /** What follows the current item, in order. */
  queue: string[];
  /** Open connections, this one included. */
  members: number;
}

/** The answer to `POST /rooms`: the snapshot plus the one secret in the design. */
export interface RoomCreated extends RoomSnapshot {
  /** Proves the host on `POST /rooms/:code/state` and `DELETE /rooms/:code`.
   *  Sent once, at creation, and never again — it lives in the host's tab. */
  hostToken: string;
}

export interface RoomsInfo {
  enabled: boolean;
}
