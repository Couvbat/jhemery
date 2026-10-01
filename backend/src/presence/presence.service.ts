import { Injectable } from '@nestjs/common';
import { BehaviorSubject, merge, Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { PresenceFrame, WaveFrame } from './presence.types';
import { UnitHealth } from '../common/health';

/**
 * Apache sits in front of this app and will close an idle connection. A message
 * every 25 seconds keeps the stream alive without being chatty.
 */
const HEARTBEAT_MS = 25_000;

/**
 * However many visitors run `wall`, the site ripples at most this often: once
 * every 15 s, the most any visitor's tab shows anyway (`SHOW_EVERY_MS` in the
 * frontend), so this is the ceiling that holds whoever is sending, from however
 * many addresses.
 */
export const WAVE_EVERY_MS = 15_000;

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
  /** Not replayed: a wave is a moment, and someone arriving after it missed it. */
  private readonly waves = new Subject<void>();
  private lastWave = -Infinity;

  /**
   * One subscription per connected visitor. Arriving and leaving both push a
   * new count to everyone, so the number moves the moment someone opens or
   * closes the page rather than on the next heartbeat. A wave rides the same
   * connection as a named event.
   */
  stream(): Observable<PresenceFrame> {
    return new Observable<PresenceFrame>((subscriber) => {
      this.online += 1;
      this.counts.next(this.online);

      const sub = merge(
        merge(this.counts, this.heartbeat).pipe(
          map((online): PresenceFrame => ({ data: { online } })),
        ),
        // A fresh frame for each connection, never one shared object: Nest stamps a
        // connection's own frame counter onto a frame with no id, in place, so a shared
        // one would carry the first visitor's counter to everybody, for good.
        this.waves.pipe(map((): WaveFrame => ({ type: 'wave', data: {} }))),
      ).subscribe(subscriber);

      return () => {
        sub.unsubscribe();
        // Nest unsubscribes when the response closes, so this is the disconnect
        // hook. Floored at zero so a double-teardown cannot drive it negative.
        this.online = Math.max(0, this.online - 1);
        this.counts.next(this.online);
      };
    });
  }

  /**
   * `wall`: every connection gets an empty `wave` event, the sender's included —
   * nothing here can tell connections apart, which is the point, so the tab that
   * sent it ignores its own echo. Coalesced site-wide: a wave inside
   * `WAVE_EVERY_MS` of the last one is dropped, and the caller is not told, so
   * the route says nothing about anyone else's waves either.
   */
  wave(now = Date.now()): void {
    if (now - this.lastWave < WAVE_EVERY_MS) return;
    this.lastWave = now;
    this.waves.next();
  }

  /** Exposed for the test; nothing in the app reads it. */
  get connections(): number {
    return this.online;
  }

  /** Always running: the count is the only thing it holds. */
  health(): UnitHealth {
    return {
      unit: 'presence',
      state: 'active',
      detail: { online: this.online },
    };
  }
}
