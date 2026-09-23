import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Observable, Subject } from 'rxjs';
import {
  PlaybackState,
  RoomCreated,
  RoomKind,
  RoomSnapshot,
} from './rooms.types';

/**
 * No 0/O, no 1/I/L: a code is read out loud across a room as often as it is
 * pasted. Five of these is about 28 million codes, plenty for a cap of 200 rooms.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;
/** What a code looks like after upper-casing; the controller 404s anything else
 *  before it reaches the map, so a junk path never costs a lookup. */
export const CODE_PATTERN = /^[A-Z0-9]{5}$/;

/** A room dies this long after its last host action or arrival/departure. */
export const IDLE_TTL_MS = 2 * 60 * 60 * 1000;
/** Rooms are memory; this bounds it. Each is a few hundred bytes plus its connections. */
export const MAX_ROOMS = 200;
export const MAX_QUEUE = 50;
/** Apache closes idle connections; a frame every 25 s keeps the stream open. Same
 *  figure as `/presence`. */
const HEARTBEAT_MS = 25_000;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const SOUNDCLOUD_HOSTS = new Set([
  'soundcloud.com',
  'www.soundcloud.com',
  'm.soundcloud.com',
  'api.soundcloud.com',
]);

/**
 * Whether a host may put this string in front of every guest. It ends up as an
 * iframe `src` on every member's page, so this is an allowlist per kind, not a
 * sanitiser: a YouTube id is eleven characters from a known alphabet, a SoundCloud
 * item is an https URL on soundcloud.com. Anything else is a 400, whatever the
 * host's own page thought of it.
 */
export function validMedia(kind: RoomKind, media: string): boolean {
  if (kind === 'watch') return YOUTUBE_ID.test(media);
  if (media.length > 300) return false;
  let url: URL;
  try {
    url = new URL(media);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && SOUNDCLOUD_HOSTS.has(url.hostname);
}

export interface RoomPatch {
  media?: string | null;
  position?: number;
  playing?: boolean;
  queue?: string[];
}

interface Room {
  code: string;
  kind: RoomKind;
  hostToken: string;
  state: PlaybackState;
  queue: string[];
  members: number;
  expiresAt: number;
  /** Every change, pushed to every open stream. Completed when the room ends. */
  readonly updates: Subject<RoomSnapshot>;
}

/**
 * Rooms in memory: a `Map`, a `Subject` per room, and nothing on disk. A restart
 * empties them all, which is the documented deal (spec §6) for a feature that is a
 * shared play button. There is no member list — the count is the whole model of
 * who is here, exactly as in `/presence`.
 */
@Injectable()
export class RoomsService {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<string>('ROOMS_ENABLED') === 'true';
  }

  /** Exposed for the tests; nothing in the app reads it. */
  get count(): number {
    return this.rooms.size;
  }

  create(kind: RoomKind, now = Date.now()): RoomCreated {
    this.sweep(now);
    if (this.rooms.size >= MAX_ROOMS) {
      throw new ServiceUnavailableException('No room left — try again later');
    }
    const room: Room = {
      code: this.freshCode(),
      kind,
      hostToken: randomBytes(24).toString('base64url'),
      state: { media: null, position: 0, playing: false, at: now },
      queue: [],
      members: 0,
      expiresAt: now + IDLE_TTL_MS,
      updates: new Subject<RoomSnapshot>(),
    };
    this.rooms.set(room.code, room);
    return { ...this.snapshotOf(room), hostToken: room.hostToken };
  }

  snapshot(code: string): RoomSnapshot | undefined {
    const room = this.rooms.get(code);
    return room && this.snapshotOf(room);
  }

  /**
   * The host's only verb. Whatever is not in the patch carries forward — and a
   * position that is not given is *recomputed* to now rather than copied, so that a
   * bare `{ playing: false }` pauses where the item actually is, not where it was
   * when the host last spoke. A new item starts from the top unless told otherwise.
   */
  update(
    code: string,
    token: string | undefined,
    patch: RoomPatch,
    now = Date.now(),
  ): RoomSnapshot {
    const room = this.host(code, token);
    if (patch.media != null && !validMedia(room.kind, patch.media)) {
      throw new BadRequestException(
        room.kind === 'watch'
          ? 'Not a YouTube video id'
          : 'Not a soundcloud.com URL',
      );
    }
    if (patch.queue) {
      if (patch.queue.length > MAX_QUEUE) {
        throw new BadRequestException(
          `The queue holds ${MAX_QUEUE} items at most`,
        );
      }
      const bad = patch.queue.find((item) => !validMedia(room.kind, item));
      if (bad !== undefined) {
        throw new BadRequestException(
          'The queue holds something that is not playable here',
        );
      }
    }

    const mediaChanged =
      patch.media !== undefined && patch.media !== room.state.media;
    room.state = {
      media: patch.media === undefined ? room.state.media : patch.media,
      position:
        patch.position ?? (mediaChanged ? 0 : positionAt(room.state, now)),
      playing: patch.playing ?? room.state.playing,
      at: now,
    };
    if (patch.queue) room.queue = [...patch.queue];
    this.touch(room, now);
    this.publish(room);
    return this.snapshotOf(room);
  }

  /** Closes the room for everyone: every stream completes, the code stops resolving. */
  end(code: string, token: string | undefined): void {
    this.remove(this.host(code, token));
  }

  /**
   * One subscription per member. Subscribing announces the new count to everyone
   * (the newcomer included, which is how it learns the room's state); the teardown
   * — Nest unsubscribes when the response closes — announces the departure.
   */
  stream(code: string): Observable<{ data: RoomSnapshot }> | undefined {
    const room = this.rooms.get(code);
    if (!room) return undefined;

    return new Observable<{ data: RoomSnapshot }>((subscriber) => {
      const sub = room.updates.subscribe({
        next: (snapshot) => subscriber.next({ data: snapshot }),
        complete: () => subscriber.complete(),
      });
      room.members += 1;
      this.touch(room);
      this.publish(room);

      const timer = setInterval(() => {
        // The sweep rides on the heartbeat: a room with members is alive, and a
        // room without them has no timer at all — creation sweeps for those.
        this.sweep();
        if (this.rooms.get(room.code) === room) {
          subscriber.next({ data: this.snapshotOf(room) });
        }
      }, HEARTBEAT_MS);
      // The connection keeps the process alive, not this timer; without `unref` a
      // stream torn down abnormally would hold the event loop open.
      timer.unref();

      return () => {
        clearInterval(timer);
        sub.unsubscribe();
        if (this.rooms.get(room.code) !== room) return;
        room.members = Math.max(0, room.members - 1);
        this.touch(room);
        this.publish(room);
      };
    });
  }

  /** Drops every room past its idle deadline, closing its streams. */
  sweep(now = Date.now()): void {
    for (const room of this.rooms.values()) {
      if (room.expiresAt <= now) this.remove(room);
    }
  }

  private remove(room: Room): void {
    this.rooms.delete(room.code);
    room.updates.complete();
  }

  private host(code: string, token: string | undefined): Room {
    const room = this.rooms.get(code);
    if (!room) throw new NotFoundException('No such room');
    if (!token || !sameToken(token, room.hostToken)) {
      throw new ForbiddenException('Only the host can do that');
    }
    return room;
  }

  private touch(room: Room, now = Date.now()): void {
    room.expiresAt = now + IDLE_TTL_MS;
  }

  private publish(room: Room): void {
    room.updates.next(this.snapshotOf(room));
  }

  private snapshotOf(room: Room): RoomSnapshot {
    return {
      code: room.code,
      kind: room.kind,
      state: { ...room.state },
      queue: [...room.queue],
      members: room.members,
    };
  }

  private freshCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i += 1) {
        code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }
}

/** Where the item is at `now`, given the last state the host reported. */
export function positionAt(state: PlaybackState, now: number): number {
  if (!state.playing) return state.position;
  return Math.max(0, state.position + (now - state.at) / 1000);
}

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
