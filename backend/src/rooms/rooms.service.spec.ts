import {
  BadRequestException,
  ConflictException,
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
import { RoomTitles } from './room-titles';
import { RoomSnapshot } from './rooms.types';

function build(
  env: Record<string, string> = { ROOMS_ENABLED: 'true' },
  titles = new RoomTitles(),
) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new RoomsService(config, titles);
}

// Every update looks titles up. Nothing in this file may reach YouTube or SoundCloud:
// by default every oEmbed call is a 404, and the title tests supply their own.
const realFetch = global.fetch;
let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn(() =>
    Promise.resolve(new Response('{}', { status: 404 })),
  );
  global.fetch = fetchMock;
});
afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

/** An oEmbed fetch the test answers by hand, call by call. */
function oembedByHand() {
  const calls: { url: string; title: (title: string | null) => void }[] = [];
  fetchMock.mockImplementation(
    (url: string) =>
      new Promise<Response>((resolve) =>
        calls.push({
          url,
          title: (title) =>
            resolve(
              title === null
                ? new Response('{}', { status: 404 })
                : new Response(JSON.stringify({ title })),
            ),
        }),
      ),
  );
  return calls;
}

/** Lets the background lookups that have been answered run to the end. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

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
      // A radio plays YouTube too: the id is the same allowlisted shape watch takes.
      expect(
        service.update(radio.code, radio.hostToken, { media: YT }).state.media,
      ).toBe(YT);
      for (const bad of [
        'https://youtube.com/watch?v=aqz-KE-bpKQ',
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

    it('takes a mixed queue in radio and refuses it in watch', () => {
      const service = build();
      const radio = service.create('radio', T0);
      const watch = service.create('watch', T0);
      const mixed = [SC, YT, 'https://m.soundcloud.com/couvbat/sets/mon-bruit'];

      expect(
        service.update(radio.code, radio.hostToken, { queue: mixed }).queue,
      ).toEqual(mixed);
      // Promoting the YouTube item makes it the current one, as `next` does.
      expect(
        service.update(radio.code, radio.hostToken, {
          media: YT,
          queue: mixed.slice(2),
        }).state.media,
      ).toBe(YT);
      expect(() =>
        service.update(watch.code, watch.hostToken, { queue: mixed }),
      ).toThrow(BadRequestException);
      expect(() =>
        service.update(watch.code, watch.hostToken, { media: SC }),
      ).toThrow('Not a YouTube video id');
      // One bad item still sinks the whole radio queue.
      expect(() =>
        service.update(radio.code, radio.hostToken, {
          queue: [...mixed, 'https://youtube.com/watch?v=aqz-KE-bpKQ'],
        }),
      ).toThrow(BadRequestException);
      expect(() =>
        service.update(radio.code, radio.hostToken, { media: 'javascript:1' }),
      ).toThrow('Not a soundcloud.com URL or a YouTube video id');
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

describe('titles', () => {
  const OTHER = 'zyxwvutsrq9';

  it('answers an add before its lookup does, and publishes the title when it lands', async () => {
    const calls = oembedByHand();
    const service = build();
    const room = service.create('radio', T0);
    const guest = join(service, room.code);

    const added = service.update(room.code, room.hostToken, { queue: [YT] });
    expect(added.queue).toEqual([YT]);
    expect(added.titles).toEqual({});
    expect(calls).toHaveLength(1);

    calls[0].title('Big Buck Bunny');
    await settle();
    expect(service.snapshot(room.code)!.titles).toEqual({
      [YT]: 'Big Buck Bunny',
    });
    expect(guest.seen.at(-1)!.titles).toEqual({ [YT]: 'Big Buck Bunny' });
    guest.leave();
  });

  it('keeps the bare id when the lookup fails', async () => {
    const service = build();
    const room = service.create('watch', T0);
    service.update(room.code, room.hostToken, { media: YT, queue: [OTHER] });
    await settle();

    const after = service.snapshot(room.code)!;
    expect(after.queue).toEqual([OTHER]);
    expect(after.state.media).toBe(YT);
    expect(after.titles).toEqual({});
    expect(after.state).not.toHaveProperty('title');
  });

  it('carries the current item’s title on the state too, through next', async () => {
    const calls = oembedByHand();
    const service = build();
    const room = service.create('radio', T0);
    service.update(room.code, room.hostToken, { queue: [YT, SC] });
    calls[0].title('Video');
    calls[1].title('Track by couvbat');
    await settle();

    // `next`, as the page sends it: the head becomes the current item.
    const promoted = service.update(room.code, room.hostToken, {
      media: YT,
      queue: [SC],
      position: 0,
      playing: true,
    });
    expect(promoted.state.title).toBe('Video');
    expect(promoted.titles).toEqual({
      [YT]: 'Video',
      [SC]: 'Track by couvbat',
    });
  });

  it('starts no new lookup on a reorder, a pause or a seek', async () => {
    const calls = oembedByHand();
    const service = build();
    const room = service.create('radio', T0);
    service.update(room.code, room.hostToken, { queue: [YT, SC, OTHER] });
    expect(calls).toHaveLength(3);
    calls[0].title('One');
    calls[1].title('Two');
    calls[2].title(null);
    await settle();

    service.update(room.code, room.hostToken, { queue: [OTHER, SC, YT] });
    service.update(room.code, room.hostToken, { playing: false });
    service.update(room.code, room.hostToken, { position: 30 });
    await settle();
    expect(calls).toHaveLength(3);
    // A second room holding the same item asks nothing either.
    const other = service.create('radio', T0);
    expect(
      service.update(other.code, other.hostToken, { queue: [YT] }).titles,
    ).toEqual({ [YT]: 'One' });
    expect(calls).toHaveLength(3);
  });

  it('prunes titles for items the room no longer holds', async () => {
    const calls = oembedByHand();
    const service = build();
    const room = service.create('radio', T0);
    service.update(room.code, room.hostToken, { queue: [YT, SC] });
    calls[0].title('Video');
    calls[1].title('Track');
    await settle();

    expect(
      service.update(room.code, room.hostToken, { queue: [SC] }).titles,
    ).toEqual({ [SC]: 'Track' });
    expect(
      service.update(room.code, room.hostToken, { queue: [] }).titles,
    ).toEqual({});
  });

  it('drops a title that lands after its item has gone', async () => {
    const calls = oembedByHand();
    const service = build();
    const room = service.create('radio', T0);
    service.update(room.code, room.hostToken, { queue: [YT] });
    service.update(room.code, room.hostToken, { queue: [] });

    calls[0].title('Too late');
    await settle();
    expect(service.snapshot(room.code)!.titles).toEqual({});
  });

  it('publishes nothing for a room that has ended', async () => {
    const calls = oembedByHand();
    const service = build();
    const room = service.create('watch', T0);
    service.update(room.code, room.hostToken, { media: YT });
    service.end(room.code, room.hostToken);
    const publish = jest.spyOn(
      service as unknown as { publish: () => void },
      'publish',
    );

    calls[0].title('Nobody is listening');
    await settle();
    expect(publish).not.toHaveBeenCalled();
  });

  it('never puts titles on a game room', () => {
    const service = build();
    const room = service.create('connect4', T0);
    expect(service.snapshot(room.code)).not.toHaveProperty('titles');
  });
});

describe('validMedia', () => {
  it('knows a YouTube id and a soundcloud.com URL, and nothing else', () => {
    expect(validMedia('watch', YT)).toBe(true);
    expect(validMedia('radio', YT)).toBe(true);
    expect(validMedia('watch', SC)).toBe(false);
    expect(validMedia('connect4', YT)).toBe(false);
    expect(validMedia('watch', 'a'.repeat(12))).toBe(false);
    expect(validMedia('radio', 'a'.repeat(12))).toBe(false);
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

describe('game rooms (connect4)', () => {
  function game() {
    const service = build();
    const room = service.create('connect4', T0);
    return { service, code: room.code, host: room.hostToken };
  }

  it('opens with an empty board, one seat taken, the host to move', () => {
    const { service, code } = game();
    expect(service.snapshot(code)!.game).toEqual({
      moves: [],
      seats: 1,
      starter: 0,
    });
  });

  it('gives the second seat to the first to ask, and to nobody after', () => {
    const { service, code } = game();
    const joined = service.join(code, T0);
    expect(joined.seatToken).toBeTruthy();
    expect(joined.game!.seats).toBe(2);
    expect(() => service.join(code, T0)).toThrow(ConflictException);
  });

  it('refuses a move before anyone has joined', () => {
    const { service, code, host } = game();
    expect(() => service.move(code, host, 3, T0)).toThrow(ConflictException);
  });

  it('takes turns, host first, each seat proved by its own token', () => {
    const { service, code, host } = game();
    const seat = service.join(code, T0).seatToken;

    expect(service.move(code, host, 3, T0).game!.moves).toEqual([3]);
    // Twice in a row is refused, whichever token tries.
    expect(() => service.move(code, host, 4, T0)).toThrow(ConflictException);
    expect(service.move(code, seat, 4, T0).game!.moves).toEqual([3, 4]);
    expect(() => service.move(code, seat, 4, T0)).toThrow(ConflictException);
  });

  it('refuses anyone who is not one of the two players', () => {
    const { service, code } = game();
    service.join(code, T0);
    expect(() => service.move(code, 'guess', 0, T0)).toThrow(
      ForbiddenException,
    );
    expect(() => service.move(code, undefined, 0, T0)).toThrow(
      ForbiddenException,
    );
    expect(() => service.rematch(code, 'guess', T0)).toThrow(
      ForbiddenException,
    );
  });

  it('refuses a column off the board or already full', () => {
    const { service, code, host } = game();
    const seat = service.join(code, T0).seatToken;
    expect(() => service.move(code, host, 7, T0)).toThrow(BadRequestException);
    for (let i = 0; i < 6; i++) service.move(code, i % 2 ? seat : host, 0, T0);
    expect(() => service.move(code, host, 0, T0)).toThrow(BadRequestException);
  });

  it('stops at a full board', () => {
    const { service, code, host } = game();
    const seat = service.join(code, T0).seatToken;
    // Fill column by column; the rules module would have called a win long before,
    // but the server only knows the board is full.
    let turn = 0;
    for (let column = 0; column < 7; column++) {
      for (let row = 0; row < 6; row++) {
        service.move(code, turn % 2 ? seat : host, column, T0);
        turn++;
      }
    }
    expect(() => service.move(code, host, 0, T0)).toThrow(ConflictException);
  });

  it('starts a rematch on a fresh board with the other seat opening', () => {
    const { service, code, host } = game();
    const seat = service.join(code, T0).seatToken;
    service.move(code, host, 3, T0);
    expect(service.rematch(code, seat, T0).game).toEqual({
      moves: [],
      seats: 2,
      starter: 1,
    });
    expect(() => service.move(code, host, 3, T0)).toThrow(ConflictException);
    expect(service.move(code, seat, 3, T0).game!.moves).toEqual([3]);
  });

  it('never hands a seat token to the stream, only to the joiner', () => {
    const { service, code } = game();
    const member = join(service, code);
    const { seatToken } = service.join(code, T0);
    expect(JSON.stringify(member.seen)).not.toContain(seatToken);
    member.leave();
  });

  it('has no player to drive, and a playback room no board', () => {
    const { service, code, host } = game();
    expect(() => service.update(code, host, { playing: true }, T0)).toThrow(
      BadRequestException,
    );
    const watch = service.create('watch', T0);
    expect(() => service.join(watch.code, T0)).toThrow(BadRequestException);
    expect(service.snapshot(watch.code)!.game).toBeUndefined();
  });
});
