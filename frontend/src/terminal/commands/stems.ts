import { encodeMix, defaultMix } from '@/components/stems/mix'
import { requestStemsMix } from '@/composables/useStemsRequest'
import { stemTracks } from '@/content/stems'
import { fail, heading, line, link } from '../format'
import type { Command, OutputLine } from '../types'

/**
 * `stems`: the tracks the music section's mixer holds, and a way into one
 * (`docs/superpowers/specs/2026-10-15-stems-vol2-design.md` §5). Listed in `help` even with
 * the list empty, as `calendar` is: a linkable command can't be hidden. Off the curl pages,
 * since there is no audio in a terminal. `stems <id>` hands the mixer a default mix through
 * the same path a `?mix=` link takes.
 */

function clock(seconds: number): string {
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export const stems: Command = {
  name: 'stems',
  usage: 'stems [<track>]',
  description: { en: 'The tracks you can remix here', fr: 'Les morceaux à remixer ici' },
  manual: {
    description: {
      en: [
        'Lists the tracks the music section’s mixer holds: title, tempo, key, how long the excerpt that loops is, and how many stems. `stems <track>` opens one in the mixer with every fader at its default.',
        'The stems are only fetched once you press load in the mixer: a track is a few megabytes.',
      ],
      fr: [
        'Liste les morceaux que contient le mixeur de la section musique : titre, tempo, tonalité, durée de l’extrait qui boucle, et nombre de pistes. `stems <morceau>` en ouvre un dans le mixeur, chaque fader à sa valeur par défaut.',
        'Les pistes ne sont téléchargées que si vous appuyez sur charger dans le mixeur : un morceau pèse quelques mégaoctets.',
      ],
    },
    seeAlso: ['music(1)'],
  },
  group: 'content',
  writes: 'none',
  linkable: true,
  complete: ({ index }) => (index === 0 ? stemTracks.map((track) => track.id) : []),
  run({ args, t, navigate }) {
    const [id] = args
    if (id) {
      const track = stemTracks.find((each) => each.id === id.toLowerCase())
      if (!track) return [fail(`stems: ${id}: ${t({ en: 'no such track — `stems` lists them', fr: 'morceau inconnu — `stems` les liste' })}`)]
      requestStemsMix(encodeMix(track.id, defaultMix(track.stems.length)))
      navigate('music')
      return [line(t({ en: `${track.title}, in the mixer.`, fr: `${track.title}, dans le mixeur.` }), 'primary')]
    }

    if (!stemTracks.length) {
      return [line(t({ en: 'no stems are published yet.', fr: 'aucune piste n’est publiée pour l’instant.' }), 'muted')]
    }
    const out: OutputLine[] = [...heading('stems')]
    for (const track of stemTracks) {
      const facts = [
        ...(track.bpm ? [`${track.bpm} BPM`] : []),
        ...(track.key ? [track.key] : []),
        t({ en: `${clock(track.seconds)} loop`, fr: `boucle de ${clock(track.seconds)}` }),
        t({ en: `${track.stems.length} stems`, fr: `${track.stems.length} pistes` }),
      ]
      out.push(line(`${track.title} · ${facts.join(' · ')}`, 'primary'))
      out.push(link(`  stems ${track.id}`, `/?run=${encodeURIComponent(`stems ${track.id}`)}`))
    }
    return out
  },
}

export const stemsCommands: Command[] = [stems]
