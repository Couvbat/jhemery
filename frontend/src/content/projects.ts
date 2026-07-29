import type { Project } from './types'

export const projects: Project[] = [
  {
    name: 'jhemery-portfolio',
    description: {
      en: 'This portfolio — built with NestJS, Vue 3, shadcn-vue and a cyberpunk terminal aesthetic.',
      fr: 'Ce portfolio — construit avec NestJS, Vue 3, shadcn-vue et une esthétique terminal cyberpunk.',
    },
    stack: ['Vue 3', 'NestJS', 'TypeScript', 'TailwindCSS', 'shadcn-vue'],
    repo: 'https://github.com/Couvbat/jhemery',
    status: 'production',
  },
  {
    name: 'in-leed / work projects',
    description: {
      en: 'Professional fullstack projects at In-Leed — web apps, REST APIs and internal tools built over 2 years.',
      fr: 'Projets fullstack professionnels chez In-Leed — applications web, APIs REST et outils internes développés sur 2 ans.',
    },
    stack: ['React', 'Node.js', 'Express', 'MongoDB', 'MySQL', 'PHP', 'Docker'],
    status: 'production',
  },
]
