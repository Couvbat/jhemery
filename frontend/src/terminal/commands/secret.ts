import type { Localised } from '@/content/types'
import { profile } from '@/content'
import type { OutputLine } from '../types'
import { blank, line } from '../format'

export const SECRET_FILE = '.secret'

const body: Localised<string[]> = {
  en: [
    'You typed `ls -a`. Most people never do.',
    '',
    "That instinct — checking whether there's more than what you were shown —",
    'is most of what makes someone good at this job.',
    '',
    "So: if you're hiring, or you have a project that needs someone who reads",
    'the whole manual, you already know how to reach me.',
    '',
    `Mention "${SECRET_FILE}" in the first line and I'll know you found this.`,
  ],
  fr: [
    'Vous avez tapé `ls -a`. Presque personne ne le fait.',
    '',
    "Cet instinct — vérifier s'il existe autre chose que ce qu'on vous montre —",
    "c'est l'essentiel de ce qui rend quelqu'un bon dans ce métier.",
    '',
    'Alors : si vous recrutez, ou si vous avez un projet qui demande quelqu\'un',
    'qui lit le manuel en entier, vous savez déjà comment me joindre.',
    '',
    `Mentionnez "${SECRET_FILE}" dans la première ligne et je saurai que vous avez trouvé ça.`,
  ],
}

/**
 * Stage 1 of the CTF chain, and its on-ramp inside the site: the audience for this
 * file is already whoever keeps pulling threads, so it hands them the next one.
 */
const FLAG = 'CTF{d1c8c2e0e268bb96}'

const postscript: Localised = {
  en: `P.S. ${FLAG} — there is more where that came from. Try \`ctf\`.`,
  fr: `P.-S. ${FLAG} — il y en a d’autres. Essayez \`ctf\`.`,
}

export function secretContents(t: <T>(value: Localised<T>) => T): OutputLine[] {
  return [
    line('# .secret', 'muted'),
    blank,
    ...t(body).map((text) => (text ? line(text, 'accent') : blank)),
    blank,
    line(`  → ${profile.email}`, 'primary'),
    blank,
    line(t(postscript), 'muted'),
  ]
}
