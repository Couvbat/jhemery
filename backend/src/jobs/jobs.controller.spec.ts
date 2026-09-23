import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

describe('JobsController', () => {
  let service: {
    configured: boolean;
    list: jest.Mock;
    get: jest.Mock;
    start: jest.Mock;
    takeFile: jest.Mock;
    release: jest.Mock;
    cancel: jest.Mock;
  };
  let controller: JobsController;
  const ID = 'abcdefghijkl';

  beforeEach(() => {
    service = {
      configured: true,
      list: jest.fn().mockReturnValue([]),
      get: jest.fn().mockReturnValue({ id: ID }),
      start: jest.fn().mockReturnValue({ id: ID, status: 'queued' }),
      takeFile: jest.fn(),
      release: jest.fn(),
      cancel: jest.fn().mockResolvedValue(true),
    };
    controller = new JobsController(service as unknown as JobsService);
  });

  it('reports whether the downloader is configured, with the jobs', () => {
    expect(controller.list()).toEqual({ configured: true, jobs: [] });
    service.configured = false;
    expect(controller.list()).toEqual({ configured: false, jobs: [] });
  });

  it('refuses to start while unconfigured, starts otherwise', () => {
    service.configured = false;
    expect(() => controller.start({ url: 'x' })).toThrow(ForbiddenException);
    service.configured = true;
    expect(controller.start({ url: 'x' })).toEqual({
      id: ID,
      status: 'queued',
    });
    expect(service.start).toHaveBeenCalledWith('x');
  });

  it('404s an id that is not id-shaped before it becomes a path', async () => {
    for (const bad of [
      'short',
      '../../../etc',
      'abcdefghijk!',
      'abcdefghijklm',
    ]) {
      expect(() => controller.get(bad)).toThrow(NotFoundException);
      await expect(controller.cancel(bad)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }
    expect(service.get).not.toHaveBeenCalled();
    expect(service.cancel).not.toHaveBeenCalled();
  });

  it('404s an unknown job or a file that is not ready', async () => {
    service.get.mockReturnValue(undefined);
    expect(() => controller.get(ID)).toThrow(NotFoundException);
    service.takeFile.mockReturnValue(undefined);
    await expect(controller.file(ID, {} as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    service.cancel.mockResolvedValue(false);
    await expect(controller.cancel(ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
