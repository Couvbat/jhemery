import { findTool, tools } from '@/tools/registry'
import { blank, line, segmented } from '../format'
import type { Command } from '../types'

/**
 * The terminal's view of the tools page — derived from the same registry the page
 * renders, so a tool that exists on one exists on the other. `cd tools/<id>` is the
 * long form; this is the discoverable one, and the palette entry.
 */
export const toolCommands: Command[] = [
  {
    name: 'tools',
    usage: 'tools [<tool>]',
    description: {
      en: 'List the tools page, or open one of its tools',
      fr: "Lister la page outils, ou ouvrir l'un de ses outils",
    },
    group: 'navigate',
    palette: true,
    complete: ({ index }) => (index === 0 ? tools.map((tool) => tool.id) : []),
    run({ args, navigate, t }) {
      const [id] = args
      if (!id) {
        return [
          line('~/tools', 'muted'),
          ...tools.map((tool) =>
            segmented([
              { text: tool.id.padEnd(10), tone: 'primary' },
              { text: t(tool.description), tone: 'muted' },
            ]),
          ),
          blank,
          line(
            t({
              en: 'tools <name> or cd tools/<name> opens one; cd tools opens the page.',
              fr: 'tools <nom> ou cd tools/<nom> en ouvre un ; cd tools ouvre la page.',
            }),
            'muted',
          ),
        ]
      }

      const tool = findTool(id)
      if (!tool || !navigate(`tools/${tool.id}`)) {
        return [line(`tools: ${id}: No such tool`, 'error')]
      }
      return [line(`~/tools/${tool.id}`, 'muted')]
    },
  },
]
