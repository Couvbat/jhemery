import type { Skill } from './types'

const REPO = 'https://github.com/Couvbat/jhemery/tree/master'

/**
 * Technology names are proper nouns — no translation needed. `usedIn` is the evidence:
 * only what this repository can show gets a link, so each one is a claim a reader can
 * check in a click. Every `where` is a path `goTo()` accepts or a URL into the repo;
 * `skills.spec.ts` holds both kinds to that.
 */
export const skills: Skill[] = [
  { name: 'HTML' },
  { name: 'CSS' },
  { name: 'JavaScript' },
  {
    name: 'TypeScript',
    usedIn: [{ what: { en: 'this whole site, both halves', fr: 'tout ce site, front et back' }, where: REPO }],
  },
  { name: 'PHP' },
  { name: 'Python' },
  { name: 'React' },
  { name: 'MySQL' },
  { name: 'MongoDB' },
  {
    name: 'Vue.js',
    usedIn: [
      { what: { en: 'the terminal', fr: 'le terminal' }, where: `${REPO}/frontend/src/composables/useTerminal.ts` },
      { what: { en: 'the tools page', fr: 'la page outils' }, where: 'tools' },
    ],
  },
  {
    name: 'NestJS',
    usedIn: [{ what: { en: 'the API behind the live data', fr: "l'API derrière les données en direct" }, where: `${REPO}/backend/src` }],
  },
  { name: 'Node.js' },
  { name: 'Express' },
  {
    name: 'SSE',
    usedIn: [
      { what: { en: 'the live visitor count', fr: 'le compteur de visiteurs en direct' }, where: `${REPO}/backend/src/presence` },
      { what: { en: 'watch parties', fr: 'les soirées vidéo' }, where: 'watch' },
    ],
  },
  {
    name: 'WebAssembly',
    usedIn: [{ what: { en: 'ffmpeg in the browser', fr: 'ffmpeg dans le navigateur' }, where: 'tools/ffmpeg' }],
  },
  {
    name: 'GraphQL',
    usedIn: [{ what: { en: 'the contribution heatmap', fr: 'la carte des contributions' }, where: 'projects' }],
  },
  {
    name: 'three.js',
    usedIn: [{ what: { en: 'the wireframes behind this page', fr: 'les formes derrière cette page' }, where: `${REPO}/frontend/src/components/ThreeBackground.vue` }],
  },
  { name: 'Docker' },
  { name: 'Git' },
  { name: 'Bash' },
]

/** The plain list, for every reader that only wants names: the résumés, `skills.txt`. */
export const skillNames: string[] = skills.map((skill) => skill.name)
