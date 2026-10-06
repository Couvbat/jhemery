import type { Project } from './types'

export const projects: Project[] = [
  {
    name: 'jhemery-portfolio',
    description: {
      en: 'This portfolio: a shell in Vue 3 over a three.js wireframe field, with a NestJS API behind it. How its parts were built is below.',
      fr: 'Ce portfolio : un shell en Vue 3 au-dessus d’un nuage de formes three.js, avec une API NestJS derrière. La façon dont ses morceaux ont été construits est juste en dessous.',
    },
    stack: ['Vue 3', 'NestJS', 'TypeScript', 'TailwindCSS', 'three.js', 'WebAssembly', 'SSE'],
    repo: 'https://github.com/Couvbat/jhemery',
    status: 'production',
  },
  {
    name: 'in-leed / work projects',
    description: {
      en: 'Professional fullstack projects at In-Leed — web apps, REST APIs and internal tools.',
      fr: 'Projets fullstack professionnels chez In-Leed — applications web, APIs REST et outils internes.',
    },
    stack: ['React', 'Node.js', 'Express', 'MongoDB', 'MySQL', 'PHP', 'Docker'],
    status: 'production',
  },
]
