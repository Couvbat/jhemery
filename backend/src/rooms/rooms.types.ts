export type RoomKind = 'watch' | 'radio' | 'connect4';

/**
 * A two-player game's whole state, which is public by the nature of the game: every
 * move, in order, as a column number. The server keeps this list and enforces only
 * what it can without the rules — whose turn it is, and that the column is on the
 * board and not full. Who has won is the pure frontend module's to work out from the
 * same list, as it is for every other game here.
 */
export interface GameState {
  moves: number[];
  /** 1 until someone takes the second seat, then 2. */
  seats: 1 | 2;
  /** Which seat opened this round: 0 is the host. Swaps on a rematch. */
  starter: 0 | 1;
}

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
  /** Only on a game room. */
  game?: GameState;
}

/**
 * The answer to `POST /rooms/:code/join` on a game room: the second seat's token,
 * handed out once, to whoever asks first. It proves that seat on `/move` the way the
 * host token proves the first.
 */
export interface RoomJoined extends RoomSnapshot {
  seatToken: string;
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
