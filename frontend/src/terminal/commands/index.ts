import type { Command } from '../types'
import { coreCommands } from './core'
import { navigateCommands } from './navigate'
import { contentCommands } from './content'
import { liveCommands } from './live'
import { eggCommands } from './eggs'

export const commands: Command[] = [
  ...coreCommands,
  ...navigateCommands,
  ...contentCommands,
  ...liveCommands,
  ...eggCommands,
]
