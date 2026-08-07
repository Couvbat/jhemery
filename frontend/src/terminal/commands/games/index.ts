import type { Localised } from '@/content/types'
import { blank, line } from '../../format'
import type { GameId } from '../../games/scores'
import type { Command, Tone } from '../../types'
import { command as game2048 } from './2048'
import { command as hangman } from './hangman'
import { command as minesweeper } from './minesweeper'
import { bestScore, formatBest } from './shared'
import { command as snake } from './snake'
import { command as tetris } from './tetris'
import { command as wordle } from './wordle'
import { command as wpm } from './wpm'

/**
 * One table drives the listing, the count in the header and the score lookups.
 *
 * It replaces a hardcoded "two games" in both locales, which was fine for two and
 * is a lie at any other number. Adding a game means adding a row here and a file
 * next to this one — nothing else in the shell needs to know.
 */
const GAMES: { id: GameId; blurb: Localised<string> }[] = [
  {
    id: '2048',
    blurb: { en: 'slide tiles, merge them, keep going', fr: 'glissez, fusionnez, continuez' },
  },
  {
    id: 'snake',
    blurb: { en: 'eat, grow, mind the walls', fr: 'mangez, grandissez, attention aux murs' },
  },
  {
    id: 'minesweeper',
    blurb: { en: 'clear the field, flag the mines', fr: 'déminez le terrain, marquez les mines' },
  },
  {
    id: 'tetris',
    blurb: { en: 'stack the pieces, clear the lines', fr: 'empilez les pièces, faites des lignes' },
  },
  {
    id: 'wordle',
    blurb: { en: 'five letters, six tries', fr: 'cinq lettres, six essais' },
  },
  {
    id: 'hangman',
    blurb: { en: 'guess before the drawing finishes', fr: 'devinez avant la fin du dessin' },
  },
  {
    id: 'wpm',
    blurb: { en: 'type a line, see how fast', fr: 'tapez une ligne, mesurez votre vitesse' },
  },
]

const NAME_WIDTH = Math.max(...GAMES.map((game) => game.id.length))

const listing: Command = {
  name: 'games',
  aliases: ['arcade'],
  description: { en: 'List the playable games', fr: 'Lister les jeux jouables' },
  group: 'fun',
  // The one game entry in the palette: launching a game from Ctrl+K would drop
  // a visitor into a keyboard-captured surface they did not ask for.
  palette: true,
  run({ t }) {
    return [
      line(
        t({
          en: `🕹  ${GAMES.length} games, in this buffer`,
          fr: `🕹  ${GAMES.length} jeux, dans ce buffer`,
        }),
        'accent',
      ),
      blank,
      ...GAMES.map((game) => ({
        text: `  ${game.id.padEnd(NAME_WIDTH)}  ${t(game.blurb).padEnd(40)}  best: ${formatBest(game.id, bestScore(game.id))}`,
        tone: 'default' as Tone,
        pre: true,
      })),
      blank,
      // The only control every game shares — each one prints its own on launch.
      line(
        t({
          en: 'run a name to play · esc or ctrl+c quits any of them',
          fr: 'tapez un nom pour jouer · esc ou ctrl+c pour quitter',
        }),
        'muted',
      ),
      line(
        t({
          en: 'looking for what I actually play? run `gaming`.',
          fr: 'vous cherchez ce que je joue vraiment ? tapez `gaming`.',
        }),
        'muted',
      ),
    ]
  },
}

export const gameCommands: Command[] = [
  listing,
  game2048,
  snake,
  minesweeper,
  tetris,
  wordle,
  hangman,
  wpm,
]
