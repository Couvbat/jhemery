import { Subscription } from 'rxjs';
import { PresenceService } from './presence.service';
import { PresenceUpdate } from './presence.types';

describe('PresenceService', () => {
  let service: PresenceService;
  const open: Subscription[] = [];

  const connect = (seen: PresenceUpdate[] = []) => {
    const sub = service.stream().subscribe(({ data }) => seen.push(data));
    open.push(sub);
    return { sub, seen };
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
    // alongside `online`, this fails.
    const { seen } = connect();
    expect(Object.keys(seen[seen.length - 1])).toEqual(['online']);
  });
});
