import { Subscription } from 'rxjs';
import { PresenceService, WAVE_EVERY_MS } from './presence.service';
import { PresenceFrame, PresenceUpdate } from './presence.types';

describe('PresenceService', () => {
  let service: PresenceService;
  const open: Subscription[] = [];

  /** One visitor: the count frames it hears, the waves, and every raw frame. */
  const connect = () => {
    const seen: PresenceUpdate[] = [];
    const waves: PresenceFrame[] = [];
    const frames: PresenceFrame[] = [];
    const sub = service.stream().subscribe((frame) => {
      frames.push(frame);
      if ('type' in frame) waves.push(frame);
      else seen.push(frame.data);
    });
    open.push(sub);
    return { sub, seen, waves, frames };
  };

  beforeEach(() => {
    service = new PresenceService();
  });

  afterEach(() => {
    while (open.length) open.pop()!.unsubscribe();
  });

  it('starts at nobody', () => {
    expect(service.connections).toBe(0);
  });

  it('counts a connection the moment it subscribes', () => {
    const { seen } = connect();
    expect(service.connections).toBe(1);
    expect(seen[seen.length - 1]).toEqual({ online: 1 });
  });

  it('tells everyone already connected when someone arrives', () => {
    const first = connect();
    connect();
    expect(first.seen[first.seen.length - 1]).toEqual({ online: 2 });
  });

  it('tells everyone left when someone leaves', () => {
    const first = connect();
    const second = connect();

    second.sub.unsubscribe();
    expect(service.connections).toBe(1);
    expect(first.seen[first.seen.length - 1]).toEqual({ online: 1 });
  });

  it('never goes negative if a teardown runs twice', () => {
    const { sub } = connect();
    sub.unsubscribe();
    sub.unsubscribe();
    expect(service.connections).toBe(0);
  });

  it('emits nothing but a count', () => {
    // The whole privacy claim in one assertion: if a field ever creeps in
    // alongside `online`, this fails. A wave doesn't change it: it is a frame of
    // its own, not a key in this one.
    const { frames } = connect();
    service.wave(0);
    const counts = frames.filter((frame) => !('type' in frame));
    for (const frame of counts) {
      expect(Object.keys(frame)).toEqual(['data']);
      expect(Object.keys(frame.data)).toEqual(['online']);
    }
  });

  describe('wave', () => {
    it('reaches every connection as a named event that carries nothing', () => {
      const first = connect();
      const second = connect();

      service.wave(0);

      for (const visitor of [first, second]) {
        expect(visitor.waves).toEqual([{ type: 'wave', data: {} }]);
        expect(Object.keys(visitor.waves[0].data)).toEqual([]);
      }
    });

    it('sends at most one every few seconds across the site', () => {
      const { waves } = connect();

      service.wave(0);
      service.wave(1_000);
      service.wave(WAVE_EVERY_MS - 1);
      expect(waves).toHaveLength(1);

      service.wave(WAVE_EVERY_MS);
      expect(waves).toHaveLength(2);
    });

    it('is a moment, not a state: someone arriving later does not hear it', () => {
      service.wave(0);
      const late = connect();
      expect(late.waves).toEqual([]);
      expect(late.seen[late.seen.length - 1]).toEqual({ online: 1 });
    });

    it('is fine with nobody listening', () => {
      expect(() => service.wave(0)).not.toThrow();
    });
  });
});
