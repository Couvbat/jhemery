import {
  CACHE_SIZE,
  LOOKUP_TIMEOUT_MS,
  LOOKUPS_PER_MINUTE,
  MAX_BODY_BYTES,
  MAX_CONCURRENT_LOOKUPS,
  MAX_TITLE_LENGTH,
  MISS_TTL_MS,
  RoomTitles,
  cleanTitle,
  oembedUrl,
} from './room-titles';

const T0 = 1_700_000_000_000;
const YT = 'aqz-KE-bpKQ';
const SC = 'https://soundcloud.com/couvbat/abysses';

/** Eleven-character ids that differ, for lookups that must not share a cache entry. */
function id(n: number): string {
  return `id${String(n).padStart(9, '0')}`;
}

function answer(body: unknown, init: ResponseInit = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

/** A fetch the test settles by hand, one call at a time. */
function deferredFetch() {
  const calls: { url: string; resolve: (res: Response) => void }[] = [];
  const mock = jest.fn(
    (url: string) =>
      new Promise<Response>((resolve) => calls.push({ url, resolve })),
  );
  return { mock, calls };
}

describe('RoomTitles', () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    // A fresh Response per call: a body can only be read once.
    fetchMock = jest.fn(() => Promise.resolve(answer({ title: 'A title' })));
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('asks the right oEmbed endpoint, once, and never follows a redirect', async () => {
    const titles = new RoomTitles();
    await expect(titles.lookup(YT, T0)).resolves.toBe('A title');
    await expect(titles.lookup(SC, T0)).resolves.toBe('A title');

    const [ytUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(ytUrl).origin).toBe('https://www.youtube.com');
    expect(new URL(ytUrl).searchParams.get('url')).toBe(
      `https://www.youtube.com/watch?v=${YT}`,
    );
    expect(init.redirect).toBe('error');
    const scUrl = new URL((fetchMock.mock.calls[1] as [string])[0]);
    expect(scUrl.origin + scUrl.pathname).toBe('https://soundcloud.com/oembed');
    expect(scUrl.searchParams.get('url')).toBe(SC);

    // A hit is a hit: no second request.
    await expect(titles.lookup(YT, T0 + 60 * 60_000)).resolves.toBe('A title');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives no title for an oEmbed 404, and never throws', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(answer({ error: 'Not Found' }, { status: 404 })),
    );
    await expect(new RoomTitles().lookup(YT, T0)).resolves.toBeNull();
  });

  it('gives no title when the endpoint times out', async () => {
    const controller = new AbortController();
    const timeout = jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(controller.signal);
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener('abort', () =>
            reject(init.signal!.reason as Error),
          ),
        ),
    );

    const pending = new RoomTitles().lookup(YT, T0);
    controller.abort(new DOMException('timed out', 'TimeoutError'));

    await expect(pending).resolves.toBeNull();
    expect(timeout).toHaveBeenCalledWith(LOOKUP_TIMEOUT_MS);
  });

  it('gives no title for a body over the cap, declared or not', async () => {
    const big = JSON.stringify({ title: 'x'.repeat(MAX_BODY_BYTES) });
    fetchMock.mockResolvedValueOnce(answer(big));
    await expect(new RoomTitles().lookup(id(1), T0)).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(
      answer(
        { title: 'small' },
        { headers: { 'content-length': String(MAX_BODY_BYTES + 1) } },
      ),
    );
    await expect(new RoomTitles().lookup(id(2), T0)).resolves.toBeNull();
  });

  it('gives no title for a body that is not JSON, or a title that is not text', async () => {
    fetchMock.mockResolvedValueOnce(answer('<html>consent</html>'));
    await expect(new RoomTitles().lookup(id(1), T0)).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(answer({ title: 42 }));
    await expect(new RoomTitles().lookup(id(2), T0)).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(answer('null'));
    await expect(new RoomTitles().lookup(id(3), T0)).resolves.toBeNull();
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(new RoomTitles().lookup(id(4), T0)).resolves.toBeNull();
  });

  it('strips the title of control and bidi characters and caps it', async () => {
    fetchMock.mockResolvedValueOnce(
      answer({ title: 'Abysses\n\tby\u202Ecouvbat\u0000\u2028(live)' }),
    );
    await expect(new RoomTitles().lookup(YT, T0)).resolves.toBe(
      'Abysses by couvbat (live)',
    );

    const capped = cleanTitle('é'.repeat(300))!;
    expect(Array.from(capped)).toHaveLength(MAX_TITLE_LENGTH);
    expect(capped.endsWith('…')).toBe(true);
    // Code points, not UTF-16 units: an emoji is never cut in half.
    expect(cleanTitle('🎧'.repeat(200))).toBe(
      `${'🎧'.repeat(MAX_TITLE_LENGTH - 1)}…`,
    );
    expect(cleanTitle('x'.repeat(MAX_TITLE_LENGTH))).toBe(
      'x'.repeat(MAX_TITLE_LENGTH),
    );
    expect(cleanTitle(' \n\u202E ')).toBeNull();
  });

  it('remembers a miss for ten minutes, then asks again', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(answer({}, { status: 404 })),
    );
    const titles = new RoomTitles();
    await titles.lookup(YT, T0);
    expect(titles.peek(YT, T0 + 1)).toBeNull();

    await expect(titles.lookup(YT, T0 + MISS_TTL_MS - 1)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockImplementation(() =>
      Promise.resolve(answer({ title: 'Back' })),
    );
    await expect(titles.lookup(YT, T0 + MISS_TTL_MS)).resolves.toBe('Back');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses the 31st lookup in a minute without a request, and forgets the refusal', async () => {
    const titles = new RoomTitles();
    for (let n = 0; n < LOOKUPS_PER_MINUTE; n += 1) {
      await expect(titles.lookup(id(n), T0 + n)).resolves.toBe('A title');
    }
    await expect(titles.lookup(id(99), T0 + 30_000)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(LOOKUPS_PER_MINUTE);
    // Not a miss: the next update may ask again once the minute has moved on.
    expect(titles.peek(id(99), T0 + 30_000)).toBeUndefined();
    await expect(titles.lookup(id(99), T0 + 60_000)).resolves.toBe('A title');
    expect(fetchMock).toHaveBeenCalledTimes(LOOKUPS_PER_MINUTE + 1);
  });

  it('runs four at once at most, and shares one request between askers', async () => {
    const { mock, calls } = deferredFetch();
    global.fetch = mock;
    const titles = new RoomTitles();

    const first = titles.lookup(id(0), T0);
    const again = titles.lookup(id(0), T0);
    for (let n = 1; n < MAX_CONCURRENT_LOOKUPS; n += 1) {
      void titles.lookup(id(n), T0);
    }
    await expect(
      titles.lookup(id(MAX_CONCURRENT_LOOKUPS), T0),
    ).resolves.toBeNull();
    expect(mock).toHaveBeenCalledTimes(MAX_CONCURRENT_LOOKUPS);

    calls[0].resolve(answer({ title: 'Shared' }));
    await expect(first).resolves.toBe('Shared');
    await expect(again).resolves.toBe('Shared');
    // A slot is free again.
    void titles.lookup(id(MAX_CONCURRENT_LOOKUPS), T0);
    expect(mock).toHaveBeenCalledTimes(MAX_CONCURRENT_LOOKUPS + 1);
  });

  it('keeps the 500 most recently used items', async () => {
    const titles = new RoomTitles();
    // One lookup every 2.1 s stays inside the budget.
    const at = (n: number) => T0 + n * 2_100;
    for (let n = 0; n < CACHE_SIZE; n += 1) await titles.lookup(id(n), at(n));
    // Touching the oldest saves it; the next oldest goes instead.
    expect(titles.peek(id(0), at(CACHE_SIZE))).toBe('A title');
    await titles.lookup(id(CACHE_SIZE), at(CACHE_SIZE));

    expect(titles.peek(id(0), at(CACHE_SIZE))).toBe('A title');
    expect(titles.peek(id(1), at(CACHE_SIZE))).toBeUndefined();
    expect(titles.peek(id(CACHE_SIZE), at(CACHE_SIZE))).toBe('A title');
  });

  it('asks nothing for an item that is neither shape', async () => {
    const titles = new RoomTitles();
    await expect(
      titles.lookup('https://evil.example/x', T0),
    ).resolves.toBeNull();
    await expect(
      titles.lookup('https://soundcloud.com.evil.example/x', T0),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(oembedUrl('javascript:1')).toBeNull();
  });
});
