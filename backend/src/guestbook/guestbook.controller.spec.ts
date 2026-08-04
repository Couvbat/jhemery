import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GuestbookController } from './guestbook.controller';
import { GuestbookService } from './guestbook.service';

/**
 * DELETE /guestbook/:id is the only authenticated route on the site, and its
 * whole auth story is one header compared against one env var. The service spec
 * covers the storage side of `remove`; these cover the gate in front of it.
 */
describe('GuestbookController', () => {
  let remove: jest.Mock;
  let controller: GuestbookController;

  function build(env: Record<string, string> = {}): GuestbookController {
    const config = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;
    return new GuestbookController(
      { remove } as unknown as GuestbookService,
      config,
    );
  }

  beforeEach(() => {
    remove = jest.fn().mockResolvedValue(true);
    controller = build({ ADMIN_PASSWORD: 'letmein' });
  });

  describe('remove', () => {
    it('deletes the entry when the admin password matches', async () => {
      await expect(
        controller.remove('abc', 'letmein'),
      ).resolves.toBeUndefined();

      expect(remove).toHaveBeenCalledWith('abc');
    });

    it('rejects a missing header', async () => {
      await expect(controller.remove('abc')).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(remove).not.toHaveBeenCalled();
    });

    it('rejects a wrong password', async () => {
      await expect(controller.remove('abc', 'guess')).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(remove).not.toHaveBeenCalled();
    });

    it('stays locked when ADMIN_PASSWORD is unset', async () => {
      // An unset env var must not turn into an open door for an empty header.
      const unconfigured = build();

      await expect(unconfigured.remove('abc', '')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        unconfigured.remove('abc', undefined),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(remove).not.toHaveBeenCalled();
    });

    it('reports an unknown id as 404 rather than a silent success', async () => {
      remove.mockResolvedValue(false);

      await expect(
        controller.remove('no-such-id', 'letmein'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
