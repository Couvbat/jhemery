import type { Command } from '../types'
import { coreCommands } from './core'
import { navigateCommands } from './navigate'
import { toolCommands } from './tools'
import { contentCommands } from './content'
import { liveCommands } from './live'
import { askCommands } from './ask'
import { eggCommands } from './eggs'
import { gameCommands } from './games'
import { systemCommands } from './system'
import { themeCommands } from './theme'
import { ctfCommands } from './ctf'
import { workCommands } from './work'
import { textCommands } from './text'

/**
 * Every command, in `help` order. A function, not a constant: `core.ts` imports the
 * registry back, so this module can be entered while `core.ts` is still evaluating,
 * and spreading `coreCommands` at import time would read it before it exists. Nothing
 * here may run at module scope (`registry-load.spec.ts`).
 */
export function collectCommands(): Command[] {
  return [
    ...coreCommands,
    ...themeCommands,
    ...navigateCommands,
    ...toolCommands,
    ...textCommands,
    ...contentCommands,
    ...workCommands,
    ...liveCommands,
    ...askCommands,
    ...eggCommands,
    ...gameCommands,
    ...systemCommands,
    ...ctfCommands,
  ]
}
