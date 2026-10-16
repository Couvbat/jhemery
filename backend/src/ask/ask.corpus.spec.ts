import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AskCorpusService } from './ask.corpus';
import type { Corpus } from './corpus.types';

/**
 * The passages arrive in the background and never on a question's path, and a file of a
 * version this code doesn't know is refused rather than guessed at: `ask` then answers
 * from its first tier, as it did before passages existed.
 */
describe('AskCorpusService', () => {
  const CORPUS: Corpus = {
    version: 1,
    generatedAt: '2026-10-15T00:00:00Z',
    passages: [
      {
        id: 'why-polling',
        kind: 'why',
        title: {
          en: 'Why the ticker polls',
          fr: 'Pourquoi le défilant interroge',
        },
        text: { en: 'Every twenty seconds.', fr: 'Toutes les vingt secondes.' },
        target: 'why polling',
      },
      {
        id: 'work-qr',
        kind: 'work',
        title: { en: 'QR codes', fr: 'Codes QR' },
        text: {
          en: 'A QR encoder written by hand.',
          fr: 'Un encodeur QR écrit à la main.',
        },
        target: '/work/qr',
      },
    ],
  };

  let fetchMock: jest.Mock;
  const service = (
    env: Record<string, string> = { FRONTEND_URL: 'http://site.test/' },
  ) =>
    new AskCorpusService({
      get: (key: string) => env[key],
    } as unknown as ConfigService);
  const answer = (body: unknown) =>
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(body)),
    });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('answers the first question with nothing, and fetches in the background', async () => {
    answer(CORPUS);
    const corpus = service();
    expect(corpus.passagesFor('ticker', 'en')).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://site.test/corpus.json',
      expect.anything(),
    );

    await corpus.refresh();
    expect(corpus.size).toBe(2);
    expect(
      corpus.passagesFor('why does the ticker poll', 'en')[0].passage.id,
    ).toBe('why-polling');
    // Cached for the hour: no second dial.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a version it doesn’t know, and holds nothing', async () => {
    answer({ ...CORPUS, version: 2 });
    const corpus = service();
    await corpus.refresh();
    expect(corpus.size).toBe(0);
    expect(corpus.passagesFor('ticker', 'en')).toEqual([]);
  });

  it('refuses a passage of the wrong shape', async () => {
    answer({
      ...CORPUS,
      passages: [{ id: 'x', title: 3, text: 'y', target: '/' }],
    });
    const corpus = service();
    await corpus.refresh();
    expect(corpus.size).toBe(0);
  });

  it('dials nothing when FRONTEND_URL is unset', async () => {
    const corpus = service({});
    expect(corpus.passagesFor('ticker', 'en')).toEqual([]);
    await corpus.refresh();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('backs off after a failure instead of dialling on every question', async () => {
    fetchMock.mockRejectedValue(new Error('ENOTFOUND'));
    const corpus = service();
    await corpus.refresh();
    corpus.passagesFor('ticker', 'en');
    corpus.passagesFor('ticker', 'en');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
