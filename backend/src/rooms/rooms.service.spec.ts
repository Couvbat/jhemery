import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CODE_ALPHABET,
  IDLE_TTL_MS,
  MAX_QUEUE,
  MAX_ROOMS,
  RoomsService,
  positionAt,
  validMedia,
} from './rooms.service';
import { RoomSnapshot } from './rooms.types';

function build(env: Record<string, string> = { ROOMS_ENABLED: 'true' }) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new RoomsService(config);
}

/** Subscribes like a member would and keeps every snapshot it is sent. */
function join(service: RoomsService, code: string) {
  const seen: RoomSnapshot[] = [];
  let completed = false;
  const sub = service.stream(code)!.subscribe({
    next: ({ data }) => seen.push(data),
    complete: () => {
      completed = true;
    },
  });
  return {
    seen,
    leave: () => sub.unsubscribe(),
    get completed() {
      return completed;
    },
  };
}

const T0 = 1_700_000_000_000;
const YT = 'aqz-KE-bpKQ';
const SC = 'https://soundcloud.com/couvbat/abysses';

describe('RoomsService', () => {
  it('reads the flag literally', () => {
    expect(build({ ROOMS_ENABLED: 'true' }).enabled).toBe(true);
    expect(build({ ROOMS_ENABLED: 'yes' }).enabled).toBe(false);
    expect(build({}).enabled).toBe(false);
  });

  describe('create', () => {
    it('hands out an unambiguous five-character code and a host token, nothing loaded', () => {
      const room = build().create('watch', T0);

      expect(room.code).toHaveLength(5);
      for (const char of room.code) expect(CODE_ALPHABET).toContain(char);
      expect(room.hostToken.length).toBeGreaterThanOrEqual(32);
      expect(room).toMatchObject({
        kind: 'watch',
        state: { media: null, position: 0, playing: false, at: T0 },
        queue: [],
        members: 0,
      });
    });

    it('gives every room a different code', () => {
      const service = build();
      const codes = new Set(
        Array.from({ length: 50 }, () => service.create('radio').code),
      );
      expect(codes.size).toBe(50);
    });

    it('refuses past the cap, and the cap counts live rooms only', () => {
      const service = build();
      for (let i = 0; i < MAX_ROOMS; i += 1) service.create('watch', T0);

      expect(() => service.create('watch', T0)).toThrow(
        ServiceUnavailableException,
      );
      // Everything above idles out; the sweep on create makes room again.
      expect(service.create('watch', T0 + IDLE_TTL_MS).code).toHaveLength(5);
      expect(service.count).toBe(1);
    });
  });

  describe('update', () => {
    it("is the host's alone", () => {
      const service = build();
      const room = service.create('watch', T0);

      expect(() =>
        service.update(room.code, 'nope', { playing: true }),
      ).toThrow(ForbiddenException);
      expect(() =>
        service.update(room.code, undefined, { playing: true }),
      ).toThrow(ForbiddenException);
      expect(() => service.update('ZZZZZ', room.hostToken, {})).toThrow(
        NotFoundException,
      );
      expect(service.snapshot(room.code)!.state.playing).toBe(false);
    });

    it("allowlists media per kind rather than trusting the host's page", () => {
      const service = build();
      const watch = service.create('watch', T0);
      const radio = service.create('radio', T0);

      expect(
        service.update(watch.code, watch.hostToken, { media: YT }).state.media,
      ).toBe(YT);
      for (const bad of [
        'https://youtube.com/watch?v=aqz-KE-bpKQ',
        'javascript:1',
        'short',
        SC,
      ]) {
        expect(() =>
          service.update(watch.code, watch.hostToken, { media: bad }),
        ).toThrow(BadRequestException);
      }

      expect(
        service.update(radio.code, radio.hostToken, { media: SC }).state.media,
      ).toBe(SC);
      for (const bad of [
        YT,
        'http://soundcloud.com/x',
        'https://evil.com/?soundcloud.com',
        'https://soundcloud.com.evil.com/x',
      ]) {
        expect(() =>
          service.update(radio.code, radio.hostToken, { media: bad }),
        ).toThrow(BadRequestException);
      }
      // Clearing is always allowed.
      expect(
        service.update(radio.code, radio.hostToken, { media: null }).state
          .media,
      ).toBeNull();
    });

    it("checks every queued item too, and the queue's length", () => {
      const service = build();
      const room = service.create('watch', T0);
      const ok = Array.from(
        { length: MAX_QUEUE },
        (_, i) => `abcdefghij${i % 10}`,
      );

      expect(
        service.update(room.code, room.hostToken, { queue: ok }).queue,
      ).toEqual(ok);
      expect(() =>
        service.update(room.code, room.hostToken, {
          queue: [...ok, 'abcdefghij0'],
        }),
      ).toThrow(BadRequestException);
      expect(() =>
        service.update(room.code, room.hostToken, { queue: [YT, SC] }),
      ).toThrow(BadRequestException);
    });

    it('starts a new item from the top and stamps the server clock', () => {
      const service = build();
      const room = service.create('watch', T0);
      service.update(
        room.code,
        room.hostToken,
        { media: YT, position: 40, playing: true },
        T0,
      );

      const next = service.update(
        room.code,
        room.hostToken,
        { media: 'zyxwvutsrq9' },
        T0 + 5_000,
      );

      expect(next.state).toEqual({
        media: 'zyxwvutsrq9',
        position: 0,
        playing: true,
        at: T0 + 5_000,
      });
    });

    it('carries a running position forward when the patch does not name one', () => {
      const service = build();
      const room = service.create('watch', T0);
      service.update(
        room.code,
        room.hostToken,
        { media: YT, position: 10, playing: true },
        T0,
      );

      // Pausing ten seconds later pauses at 20, not back at 10.
      const paused = service.update(
        room.code,
        room.hostToken,
        { playing: false },
        T0 + 10_000,
      );
      expect(paused.state).toEqual({
        media: YT,
        position: 20,
        playing: false,
        at: T0 + 10_000,
      });

      // And a paused position does not move on its own.
      const later = service.update(
        room.code,
        room.hostToken,
        { playing: true },
        T0 + 60_000,
      );
      expect(later.state.position).toBe(20);
    });

    it('pushes every change to every member', () => {
      const service = build();
      const room = service.create('watch', T0);
      const guest = join(service, room.code);

      service.update(room.code, room.hostToken, { media: YT, playing: true });

      expect(guest.seen.at(-1)!.state).toMatchObject({
        media: YT,
        playing: true,
      });
      guest.leave();
    });
  });

  describe('stream', () => {
    it('is undefined for a code that is not a room', () => {
      expect(build().stream('ZZZZZ')).toBeUndefined();
    });

    it('counts members in and out, and tells everyone each time', () => {
      const service = build();
      const room = service.create('radio', T0);

      const a = join(service, room.code);
      expect(a.seen.map((s) => s.members)).toEqual([1]);

      const b = join(service, room.code);
      expect(b.seen.map((s) => s.members)).toEqual([2]);
      expect(a.seen.map((s) => s.members)).toEqual([1, 2]);

      b.leave();
      expect(a.seen.map((s) => s.members)).toEqual([1, 2, 1]);
      expect(service.snapshot(room.code)!.members).toBe(1);
      a.leave();
      expect(service.snapshot(room.code)!.members).toBe(0);
    });

    it('completes for everyone when the host ends the room', () => {
      const service = build();
      const room = service.create('watch', T0);
      const guest = join(service, room.code);

      expect(() => service.end(room.code, 'nope')).toThrow(ForbiddenException);
      service.end(room.code, room.hostToken);

      expect(guest.completed).toBe(true);
      expect(service.snapshot(room.code)).toBeUndefined();
      expect(service.stream(room.code)).toBeUndefined();
    });
  });

  describe('expiry', () => {
    it('drops idle rooms and closes their streams, keeping the active ones', () => {
      // Joining touches a room on the real clock, so this test is anchored there
      // rather than on T0.
      const now = Date.now();
      const service = build();
      const idle = service.create('watch', now);
      const busy = service.create('watch', now);
      const guest = join(service, idle.code);

      service.update(
        busy.code,
        busy.hostToken,
        { playing: true },
        now + IDLE_TTL_MS + 5_000,
      );
      service.sweep(now + IDLE_TTL_MS + 1_000);

      expect(service.snapshot(idle.code)).toBeUndefined();
      expect(guest.completed).toBe(true);
      expect(service.snapshot(busy.code)).toBeDefined();
    });
  });
});

describe('validMedia', () => {
  it('knows a YouTube id and a soundcloud.com URL, and nothing else', () => {
    expect(validMedia('watch', YT)).toBe(true);
    expect(validMedia('watch', 'a'.repeat(12))).toBe(false);
    expect(
      validMedia('radio', 'https://m.soundcloud.com/couvbat/sets/mon-bruit'),
    ).toBe(true);
    expect(validMedia('radio', 'https://api.soundcloud.com/tracks/1')).toBe(
      true,
    );
    expect(
      validMedia('radio', `https://soundcloud.com/${'a'.repeat(300)}`),
    ).toBe(false);
    expect(validMedia('radio', 'not a url')).toBe(false);
  });
});

describe('positionAt', () => {
  it('advances while playing and holds while paused', () => {
    expect(
      positionAt(
        { media: YT, position: 10, playing: true, at: T0 },
        T0 + 2_500,
      ),
    ).toBe(12.5);
    expect(
      positionAt(
        { media: YT, position: 10, playing: false, at: T0 },
        T0 + 2_500,
      ),
    ).toBe(10);
    expect(
      positionAt(
        { media: YT, position: 10, playing: true, at: T0 },
        T0 - 50_000,
      ),
    ).toBe(0);
  });
});
