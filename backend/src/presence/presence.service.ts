import { Injectable } from '@nestjs/common';
import { BehaviorSubject, merge, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PresenceUpdate } from './presence.types';

/**
 * Apache sits in front of this app and will close an idle connection. A message
 * every 25 seconds keeps the stream alive without being chatty.
 */
const HEARTBEAT_MS = 25_000;

/**
 * A count of open SSE connections, and nothing else — see `presence.types.ts`
 * for why that is the whole design rather than a trimmed-down version of one.
 *
 * The count lives in memory: a restart resets it, which is correct, because
 * every connection dies with the process anyway.
 */
@Injectable()
export class PresenceService {
  private online = 0;
  /** Replays the current count, so a new subscriber hears one immediately. */
  private readonly counts = new BehaviorSubject<number>(0);
  private readonly heartbeat = new Observable<number>((subscriber) => {
    const timer = setInterval(() => subscriber.next(this.online), HEARTBEAT_MS);
    return () => clearInterval(timer);
  });

  /**
   * One subscription per connected visitor. Arriving and leaving both push a
   * new count to everyone, so the number moves the moment someone opens or
   * closes the page rather than on the next heartbeat.
   */
  stream(): Observable<{ data: PresenceUpdate }> {
    return new Observable<{ data: PresenceUpdate }>((subscriber) => {
      this.online += 1;
      this.counts.next(this.online);

      const sub = merge(this.counts, this.heartbeat)
        .pipe(map((online) => ({ data: { online } })))
        .subscribe(subscriber);

      return () => {
        sub.unsubscribe();
        // Nest unsubscribes when the response closes, so this is the disconnect
        // hook. Floored at zero so a double-teardown cannot drive it negative.
        this.online = Math.max(0, this.online - 1);
        this.counts.next(this.online);
      };
    });
  }

  /** Exposed for the test; nothing in the app reads it. */
  get connections(): number {
    return this.online;
  }
}
