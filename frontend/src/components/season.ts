import { seasonOn, untilTomorrow, type Season } from '@/content'

/**
 * Keeps the wireframe field on the visitor's day (`content/seasons.ts`), out of the
 * component so a spec can drive it with fake timers.
 *
 * One timer set for midnight isn't enough. Browsers count a `setTimeout` on a clock that
 * stops while the device sleeps, so a laptop shut at ten on the 30th and opened the next
 * morning would wait out the two hours it still owed before the field noticed Halloween,
 * while the boot log and `neofetch`, which read the date when they run, already had. So the
 * wait is capped, and each tick reads the wall clock afresh: after a sleep the field is at
 * most `SEASON_CHECK_MS` behind, and without one it still turns over on the dot of midnight.
 */
export const SEASON_CHECK_MS = 60_000

/**
 * Hands `onDay` the season (or none) each time the field checks the calendar, until the
 * returned function stops it. The same season comes back on every check of the same day;
 * a `shallowRef` set to it again doesn't trigger, so only a new day repaints. A check that
 * fires a little before midnight reads the old day and re-arms for the few milliseconds left.
 */
export function followSeason(onDay: (season: Season | undefined) => void): () => void {
  let timer: ReturnType<typeof setTimeout>
  const arm = () => {
    timer = setTimeout(
      () => {
        onDay(seasonOn())
        arm()
      },
      Math.min(untilTomorrow(), SEASON_CHECK_MS),
    )
  }
  arm()
  return () => clearTimeout(timer)
}
