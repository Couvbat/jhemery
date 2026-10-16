/**
 * `${FRONTEND_URL}/corpus.json`, as the frontend's corpus plugin emits it
 * (`frontend/vite-plugins/corpus.ts`, shape `frontend/src/content/corpus.ts`): the site's
 * own words, whole, one passage per section, for `ask` to retrieve from. Mirrored rather
 * than imported, like `content.json` (`mcp/mcp.types.ts`): the two apps deploy separately,
 * so the backend checks `version` before trusting a field, and a change of shape is a new
 * version accepted beside the old one.
 */
export type CorpusLang = 'en' | 'fr';
export type CorpusText = string | Record<CorpusLang, string>;

export interface Passage {
  id: string;
  kind: string;
  /** Localised where the source is; plain where it is a single-language note. */
  title: CorpusText;
  text: CorpusText;
  /** A route (`/work/qr`), a note anchor, or a `?run=` line (`why polling`). */
  target: string;
  /** A single-language note's language. */
  lang?: CorpusLang;
}

export interface Corpus {
  version: 1;
  generatedAt: string;
  passages: Passage[];
}

/** Every shape this code was written for. */
export const CORPUS_VERSIONS: readonly number[] = [1];

function isText(value: unknown): value is CorpusText {
  if (typeof value === 'string') return true;
  const both = value as Record<string, unknown> | null;
  return (
    typeof both === 'object' &&
    both !== null &&
    typeof both.en === 'string' &&
    typeof both.fr === 'string'
  );
}

/** A corpus of a version this code knows, with every passage the shape it says. */
export function isCorpus(value: unknown): value is Corpus {
  const corpus = value as Partial<Corpus> | null;
  return (
    !!corpus &&
    CORPUS_VERSIONS.includes(corpus.version as number) &&
    Array.isArray(corpus.passages) &&
    corpus.passages.every(
      (passage) =>
        typeof passage?.id === 'string' &&
        typeof passage.target === 'string' &&
        isText(passage.title) &&
        isText(passage.text),
    )
  );
}

/** The passage's words in the visitor's language, where it has both. */
export function inLocale(text: CorpusText, locale: CorpusLang): string {
  return typeof text === 'string' ? text : text[locale];
}
