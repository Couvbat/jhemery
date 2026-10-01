import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CONTENT_TTL_MS, McpContentService } from './mcp.content';

function serve(...bodies: unknown[]) {
  const fetchMock = jest.fn();
  for (const body of bodies) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(body),
    });
  }
  global.fetch = fetchMock;
  return fetchMock;
}

function build() {
  const config = {
    get: (key: string) =>
      key === 'FRONTEND_URL' ? 'https://site.test/' : undefined,
  } as unknown as ConfigService;
  return new McpContentService(config);
}

describe('McpContentService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  // Either app may deploy first, so the backend accepts the shape before and after
  // experience and education were added.
  it.each([1, 2])('accepts a version %i file', async (version) => {
    const fetchMock = serve({ version, site: 'https://site.test' });
    await expect(build().content()).resolves.toMatchObject({ version });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://site.test/content.json',
      expect.anything(),
    );
  });

  it('refuses a version it was not written for', async () => {
    serve({ version: 3 });
    await expect(build().content()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('keeps serving what it had when a refresh brings an unknown version', async () => {
    jest.useFakeTimers();
    const fetchMock = serve({ version: 2, site: 'old' }, { version: 3 });
    const service = build();
    await service.content();
    jest.advanceTimersByTime(CONTENT_TTL_MS + 1);
    await expect(service.content()).resolves.toMatchObject({ site: 'old' });
    // The refresh did run and read the version 3 file; it was refused, not skipped.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
