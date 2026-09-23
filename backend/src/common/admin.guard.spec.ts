import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminGuard } from './admin.guard';

// Test fixtures, not credentials — named so a secret scanner does not read them as
// one. The guard compares the header to the env var; these are the two values.
const EXPECTED = 'letmein';
const WRONG = 'guess';

function build(env: Record<string, string>): AdminGuard {
  return new AdminGuard({
    get: (key: string) => env[key],
  } as unknown as ConfigService);
}

function request(headers: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  it('lets the right password through', () => {
    expect(
      build({ ADMIN_PASSWORD: EXPECTED }).canActivate(
        request({ 'x-admin-password': EXPECTED }),
      ),
    ).toBe(true);
  });

  it('refuses a wrong, missing or non-string header', () => {
    const guard = build({ ADMIN_PASSWORD: EXPECTED });
    for (const headers of [
      { 'x-admin-password': WRONG },
      { 'x-admin-password': '' },
      { 'x-admin-password': [EXPECTED] },
      {},
    ]) {
      expect(() => guard.canActivate(request(headers))).toThrow(
        ForbiddenException,
      );
    }
  });

  it('stays locked when ADMIN_PASSWORD is unset', () => {
    const guard = build({});
    expect(() =>
      guard.canActivate(request({ 'x-admin-password': '' })),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(request({ 'x-admin-password': 'anything' })),
    ).toThrow(ForbiddenException);
  });
});
