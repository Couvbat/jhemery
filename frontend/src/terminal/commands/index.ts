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

export const commands: Command[] = [
  ...coreCommands,
  ...themeCommands,
  ...navigateCommands,
  ...toolCommands,
  ...contentCommands,
  ...liveCommands,
  ...askCommands,
  ...eggCommands,
  ...gameCommands,
  ...systemCommands,
  ...ctfCommands,
]
