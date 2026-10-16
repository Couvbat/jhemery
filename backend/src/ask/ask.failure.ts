import {
  BadGatewayException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * Why `ask` didn't answer, as a closed set (`docs/superpowers/specs/2026-10-15-ask-my-lab-design.md`
 * §4). Every failure used to render the same "asleep" line, and the only record of which hop
 * failed was a warn line in Passenger's stderr on the host: each outage was diagnosed again
 * from black-box probes. Now the reason travels in the error body, in the log line, and in
 * `/health`'s `last`.
 */
export type AskReason =
  /** `ASK_ENABLED` off, or no URL or model. */
  | 'unconfigured'
  /** The one slot is taken. */
  | 'busy'
  /** A detached cold load from an earlier question is still running. */
  | 'warming'
  /** No HTTP answer at all: DNS, connect, TLS. */
  | 'unreachable'
  /** The model host's edge answered 401 or 403: a Cloudflare rule that no longer admits the API. */
  | 'refused'
  /** Any other status from the runtime, the proxy or the tunnel, 5xx and 524 included. */
  | 'upstream'
  /** No first token within the deadline, so the request detached to finish loading. */
  | 'timeout'
  /** The stream ended with no answer, or only thinking. */
  | 'empty'
  /** The controller's silence ceiling answered for the service. */
  | 'silent';

export const ASK_REASONS: readonly AskReason[] = [
  'unconfigured',
  'busy',
  'warming',
  'unreachable',
  'refused',
  'upstream',
  'timeout',
  'empty',
  'silent',
];

/** What went wrong, as the service sees it, before it has a name. */
export type AskFault =
  | { kind: 'disabled' }
  | { kind: 'busy' }
  | { kind: 'warming' }
  | { kind: 'deadline' }
  | { kind: 'status'; status: number }
  | { kind: 'thrown'; error: unknown }
  | { kind: 'empty' }
  | { kind: 'ceiling' };

/** The one place a fault becomes a reason, so the specs can drive it row by row. */
export function classify(fault: AskFault): AskReason {
  switch (fault.kind) {
    case 'disabled':
      return 'unconfigured';
    case 'busy':
      return 'busy';
    case 'warming':
      return 'warming';
    case 'deadline':
      return 'timeout';
    case 'empty':
      return 'empty';
    case 'ceiling':
      return 'silent';
    case 'status':
      return fault.status === 401 || fault.status === 403
        ? 'refused'
        : 'upstream';
    case 'thrown': {
      // Already named on the way up.
      const named = reasonOf(fault.error);
      return named ?? 'unreachable';
    }
  }
}

/**
 * The exception for a reason. The statuses are the ones each failure had before reasons
 * existed (503 for busy, 502 for the rest), so a frontend that predates this still
 * degrades correctly: the two apps deploy in no fixed order. The body gains `reason`.
 */
export function askFailure(reason: AskReason, detail: string): HttpException {
  const busy = reason === 'busy';
  const body = {
    statusCode: busy ? 503 : 502,
    error: busy ? 'Service Unavailable' : 'Bad Gateway',
    message: detail,
    reason,
  };
  const failure = busy
    ? new ServiceUnavailableException(body)
    : new BadGatewayException(body);
  return Object.assign(failure, { reason });
}

/** The reason an error already carries, when `askFailure` made it. */
export function reasonOf(error: unknown): AskReason | undefined {
  const reason = (error as { reason?: unknown } | null)?.reason;
  return typeof reason === 'string' &&
    (ASK_REASONS as readonly string[]).includes(reason)
    ? (reason as AskReason)
    : undefined;
}
