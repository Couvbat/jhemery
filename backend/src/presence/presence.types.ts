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
