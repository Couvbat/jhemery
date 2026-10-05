/**
 * Everything this feature knows about anyone: how many connections are open.
 *
 * There is deliberately no visitor id, no session token, no IP, no user agent
 * and nothing written to disk — not as a policy bolted on afterwards, but
 * because a single integer is genuinely all a presence counter needs. The `ask`
 * route's "questions and answers are never logged" sets the same bar.
 */
export interface PresenceUpdate {
  /** Connections currently open, this one included. */
  online: number;
}

/**
 * A count frame: unnamed, so it arrives as the stream's plain `message`, exactly
 * as it always has.
 */
export interface CountFrame {
  data: PresenceUpdate;
}

/**
 * `wall`'s wave: a *named* event whose data is empty. Named, so the count frames
 * stay exactly `{ online }` and an old bundle, which only listens to `message`,
 * never sees one. Empty, because a wave carries nothing — no text, no sender, not
 * even a time: that someone, somewhere on the site, waved is all there is to say.
 */
export interface WaveFrame {
  type: 'wave';
  data: Record<string, never>;
}

export type PresenceFrame = CountFrame | WaveFrame;

/** `POST /presence/wall` on a deployment that hasn't opted in. Enabled, it is a bare 204. */
export interface WallOff {
  configured: false;
}
