import { inLocale, type CorpusLang, type Passage } from './corpus.types';

/**
 * Lexical retrieval over the site's own passages, in the API's process
 * (`docs/superpowers/specs/2026-10-15-ask-my-lab-design.md` §2, decision `ask-retrieval`).
 * BM25 over lower-cased, accent-folded words, with English and French stop words dropped
 * and each word cut to its first five letters, so `serveur` meets `serveurs` and `deploy`
 * meets `deployment`. A few hundred passages scan in well under a millisecond, so there
 * is no dependency and nothing to tune at runtime.
 */

/** BM25's usual constants. */
const K1 = 1.2;
const B = 0.75;
/** A title word counts this many times over a body word, as in the palette's scorer. */
const TITLE_WEIGHT = 3;
/** Words are matched on this many letters. */
const PREFIX = 5;

export const MAX_PASSAGES = 4;
export const MAX_PASSAGE_CHARS = 5_000;
/**
 * Below this a passage is dropped, so a question about nothing on the site gets no
 * passages rather than the least bad four. About one match on a word that a third of
 * the passages share.
 */
export const MIN_SCORE = 1;

const STOP_WORDS = new Set(
  [
    // English
    'a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its me my no not of on or our she so than that the their them then there these they this to too was we were what when where which who why will with would you your about any all also just more most some such only own same very',
    // French
    'a au aux avec ce ces cet cette dans de des du elle elles en est et etre eu il ils je la le les leur leurs lui ma mais me mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous y ete fait comme plus tres sont ont quoi quel quelle quels quelles comment pourquoi',
  ]
    .join(' ')
    .split(' '),
);

/** Lower-cased, accent-folded words, stop words out, each cut to its first five letters. */
export function terms(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    .map((word) => word.slice(0, PREFIX));
}

interface Indexed {
  passage: Passage;
  /** Term frequencies, a title word already weighted. */
  tf: Map<string, number>;
  length: number;
}

export interface PassageIndex {
  locale: CorpusLang;
  docs: Indexed[];
  /** How many passages each term appears in. */
  df: Map<string, number>;
  averageLength: number;
}

/** Built once per corpus fetch and locale, never per question. */
export function buildIndex(
  passages: readonly Passage[],
  locale: CorpusLang,
): PassageIndex {
  const df = new Map<string, number>();
  const docs = passages.map((passage) => {
    const tf = new Map<string, number>();
    const title = terms(inLocale(passage.title, locale));
    const body = terms(inLocale(passage.text, locale));
    for (const term of title) tf.set(term, (tf.get(term) ?? 0) + TITLE_WEIGHT);
    for (const term of body) tf.set(term, (tf.get(term) ?? 0) + 1);
    for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
    return { passage, tf, length: title.length * TITLE_WEIGHT + body.length };
  });
  const total = docs.reduce((sum, doc) => sum + doc.length, 0);
  return {
    locale,
    docs,
    df,
    averageLength: docs.length ? total / docs.length : 0,
  };
}

export interface Retrieved {
  passage: Passage;
  score: number;
  /** The passage's text in the index's language, ready for the prompt. */
  text: string;
  title: string;
}

/**
 * The passages most relevant to a question, best first: at most four, at most 5 000
 * characters together, none under the score floor.
 */
export function retrieve(
  question: string,
  index: PassageIndex,
  {
    limit = MAX_PASSAGES,
    maxChars = MAX_PASSAGE_CHARS,
    minScore = MIN_SCORE,
  } = {},
): Retrieved[] {
  const asked = [...new Set(terms(question))];
  const n = index.docs.length;
  const scored = index.docs
    .map((doc) => {
      let score = 0;
      for (const term of asked) {
        const tf = doc.tf.get(term);
        if (!tf) continue;
        const df = index.df.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score +=
          (idf * (tf * (K1 + 1))) /
          (tf + K1 * (1 - B + (B * doc.length) / (index.averageLength || 1)));
      }
      return { doc, score };
    })
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score);

  const chosen: Retrieved[] = [];
  let used = 0;
  for (const { doc, score } of scored) {
    if (chosen.length >= limit) break;
    const text = inLocale(doc.passage.text, index.locale);
    if (used + text.length > maxChars) continue;
    used += text.length;
    chosen.push({
      passage: doc.passage,
      score,
      text,
      title: inLocale(doc.passage.title, index.locale),
    });
  }
  return chosen;
}
