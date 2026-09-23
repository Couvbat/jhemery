import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

/**
 * The service spec owns the room model; these cover the two gates in front of it —
 * the feature flag and the shape of a code — and that the host header reaches the
 * service as given.
 */
describe('RoomsController', () => {
  let service: {
    enabled: boolean;
    create: jest.Mock;
    snapshot: jest.Mock;
    stream: jest.Mock;
    update: jest.Mock;
    end: jest.Mock;
  };
  let controller: RoomsController;

  beforeEach(() => {
    service = {
      enabled: true,
      create: jest.fn().mockReturnValue({ code: 'ABCDE', hostToken: 't' }),
      snapshot: jest.fn().mockReturnValue({ code: 'ABCDE' }),
      stream: jest.fn().mockReturnValue({}),
      update: jest.fn().mockReturnValue({ code: 'ABCDE' }),
      end: jest.fn(),
    };
    controller = new RoomsController(service as unknown as RoomsService);
  });

  it('reports the flag', () => {
    expect(controller.info()).toEqual({ enabled: true });
    service.enabled = false;
    expect(controller.info()).toEqual({ enabled: false });
  });

  it('refuses to create a room while the feature is off', () => {
    service.enabled = false;
    expect(() => controller.create({ kind: 'watch' })).toThrow(
      ForbiddenException,
    );
    expect(service.create).not.toHaveBeenCalled();
  });

  it('creates a room of the asked kind when on', () => {
    expect(controller.create({ kind: 'radio' })).toEqual({
      code: 'ABCDE',
      hostToken: 't',
    });
    expect(service.create).toHaveBeenCalledWith('radio');
  });

  it('upper-cases a code and 404s anything that is not code-shaped', () => {
    controller.snapshot(' abcde ');
    expect(service.snapshot).toHaveBeenCalledWith('ABCDE');

    for (const bad of ['abc', 'abcdef', 'ab-de', '../..']) {
      expect(() => controller.snapshot(bad)).toThrow(NotFoundException);
    }
    expect(service.snapshot).toHaveBeenCalledTimes(1);
  });

  it('404s a stream or a snapshot the service does not know', () => {
    service.snapshot.mockReturnValue(undefined);
    service.stream.mockReturnValue(undefined);
    expect(() => controller.snapshot('ABCDE')).toThrow(NotFoundException);
    expect(() => controller.events('ABCDE')).toThrow(NotFoundException);
  });

  it('passes the host header through untouched, present or not', () => {
    controller.update('abcde', { playing: true }, 'secret');
    expect(service.update).toHaveBeenCalledWith('ABCDE', 'secret', {
      playing: true,
    });

    controller.update('abcde', { playing: true });
    expect(service.update).toHaveBeenLastCalledWith('ABCDE', undefined, {
      playing: true,
    });

    controller.end('abcde', 'secret');
    expect(service.end).toHaveBeenCalledWith('ABCDE', 'secret');
  });
});
