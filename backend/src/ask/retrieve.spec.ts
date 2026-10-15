import type { Passage } from './corpus.types';
import { buildIndex, retrieve, terms } from './retrieve';
import { MAX_PROMPT_CHARS, systemPrompt } from './prompt';

const passage = (
  id: string,
  title: Passage['title'],
  text: Passage['text'],
  extra: Partial<Passage> = {},
): Passage => ({ id, kind: 'why', title, text, target: `why ${id}`, ...extra });

const PASSAGES: Passage[] = [
  passage(
    'polling',
    {
      en: 'Why the guestbook ticker polls',
      fr: 'Pourquoi le défilant du livre d’or interroge',
    },
    {
      en: 'The ticker asks the API every twenty seconds instead of holding a stream open.',
      fr: 'Le défilant interroge l’API toutes les vingt secondes au lieu de garder un flux ouvert.',
    },
  ),
  passage(
    'deploy',
    {
      en: 'How a deployment reaches the server',
      fr: 'Comment un déploiement atteint le serveur',
    },
    {
      en: 'GitHub Actions builds the site and copies it over SSH through the cPanel API.',
      fr: 'GitHub Actions compile le site et le copie par SSH via l’API cPanel.',
    },
  ),
  passage(
    'hardware',
    { en: 'Poseidon', fr: 'Poseidon' },
    {
      en: 'A NAS with an RTX 3080 that runs the model.',
      fr: 'Un NAS avec une RTX 3080 qui fait tourner le modèle.',
    },
    { target: 'hardware nas' },
  ),
  // A single-language note keeps its language whatever the visitor's.
  passage(
    'note-fr',
    'Note sur les serveurs',
    'Les serveurs de la maison tournent sous TrueNAS.',
    {
      kind: 'note',
      lang: 'fr',
      target: '/notes/serveurs',
    },
  ),
  passage(
    'noise',
    { en: 'Fonts', fr: 'Polices' },
    {
      en: 'The site uses a monospaced font.',
      fr: 'Le site utilise une police à chasse fixe.',
    },
  ),
];

describe('terms', () => {
  it('folds accents and case, drops stop words in both languages, and keeps five letters', () => {
    expect(terms('Les SERVEURS de la Maison')).toEqual(['serve', 'maiso']);
    expect(terms('What is the deployment?')).toEqual(['deplo']);
    expect(terms('déploiement')).toEqual(['deplo']);
  });
});

describe('retrieve', () => {
  const en = buildIndex(PASSAGES, 'en');
  const fr = buildIndex(PASSAGES, 'fr');

  it('meets a word in another form through its first five letters', () => {
    expect(retrieve('how do you deploy?', en)[0].passage.id).toBe('deploy');
    expect(retrieve('quel serveur ?', fr).map((r) => r.passage.id)).toContain(
      'note-fr',
    );
  });

  it('weighs a match in a title over one in the body', () => {
    const ranked = retrieve('guestbook ticker', en).map((r) => r.passage.id);
    expect(ranked[0]).toBe('polling');
  });

  it('gives a question about nothing on the site no passages at all', () => {
    expect(retrieve('what is the capital of Peru', en)).toEqual([]);
    expect(retrieve('the and of', en)).toEqual([]);
  });

  it('picks the visitor’s language where a passage has both, and keeps a note’s own', () => {
    expect(retrieve('ticker', en)[0].text).toContain('twenty seconds');
    expect(retrieve('défilant', fr)[0].text).toContain('vingt secondes');
    expect(retrieve('serveurs maison', en)[0]).toMatchObject({
      title: 'Note sur les serveurs',
      text: 'Les serveurs de la maison tournent sous TrueNAS.',
    });
  });

  it('stops at four passages and at the character budget', () => {
    // Among others, as on the site: a word every passage shares says nothing.
    const many = [
      ...Array.from({ length: 8 }, (_, i) =>
        passage(`p${i}`, `Ticker ${i}`, `ticker ${'x'.repeat(1_500)}`),
      ),
      ...Array.from({ length: 30 }, (_, i) =>
        passage(`other${i}`, `Other ${i}`, `something else ${i}`),
      ),
    ];
    const index = buildIndex(many, 'en');
    expect(retrieve('ticker', index)).toHaveLength(3);
    expect(retrieve('ticker', index, { maxChars: 100_000 })).toHaveLength(4);
  });
});

describe('the prompt', () => {
  const index = buildIndex(PASSAGES, 'en');

  it('puts the passages after CONTEXT, each headed by its title and target', () => {
    const prompt = systemPrompt({
      corpus: '# llms',
      passages: retrieve('guestbook ticker', index),
      locale: 'en',
    });
    expect(prompt.indexOf('PASSAGES:')).toBeGreaterThan(
      prompt.indexOf('CONTEXT:'),
    );
    expect(prompt).toContain('## Why the guestbook ticker polls (why polling)');
    expect(prompt).toContain('Never write a link');
  });

  it('drops passages before anything else when it is over the budget, and never the rules', () => {
    const huge = Array.from({ length: 4 }, (_, i) => ({
      passage: passage(`big${i}`, `Big ${i}`, 'x'),
      score: 10 - i,
      title: `Big ${i}`,
      text: 'y'.repeat(9_000),
    }));
    const prompt = systemPrompt({
      corpus: 'z'.repeat(11_000),
      passages: huge,
      labNow: 'LAB NOW (snapshot 40 s old):\nposeidon: up',
      locale: 'fr',
    });
    expect(prompt.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
    expect(prompt).toContain('Always answer in French');
    expect(prompt).toContain('LAB NOW (snapshot 40 s old)');
    expect(prompt).toContain('## Big 0');
    expect(prompt).not.toContain('## Big 2');
  });

  it('leaves the PASSAGES block out when there are none', () => {
    expect(systemPrompt({ corpus: '# llms', locale: 'en' })).not.toContain(
      'PASSAGES:',
    );
  });
});
