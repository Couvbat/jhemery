import { describe, expect, it } from 'vitest'
import { describeCron, nextRuns, parseCron, type Schedule } from '../cron/cron'

function schedule(expression: string): Schedule {
  const result = parseCron(expression)
  if (!result.ok) throw new Error(`${expression}: ${result.reason}`)
  return result.schedule
}

const values = (expression: string, field: keyof Schedule) => [...schedule(expression)[field].values].sort((a, b) => a - b)

describe('parseCron', () => {
  it('reads ranges, steps, lists and names', () => {
    expect(values('*/15 * * * *', 'minute')).toEqual([0, 15, 30, 45])
    expect(values('0 9-17/4 * * *', 'hour')).toEqual([9, 13, 17])
    expect(values('0 0 1,15 * *', 'day')).toEqual([1, 15])
    expect(values('0 0 * jan-mar,DEC *', 'month')).toEqual([1, 2, 3, 12])
    expect(values('0 0 * * MON-FRI', 'weekday')).toEqual([1, 2, 3, 4, 5])
  })

  it('treats 7 as Sunday too', () => {
    expect(values('0 0 * * 7', 'weekday')).toEqual([0])
    expect(values('0 0 * * 5-7', 'weekday')).toEqual([0, 5, 6])
  })

  it('reads `a/n` as from a to the end of the field', () => {
    expect(values('5/20 * * * *', 'minute')).toEqual([5, 25, 45])
  })

  it('expands the macros, and refuses @reboot', () => {
    expect(values('@hourly', 'minute')).toEqual([0])
    expect(values('@weekly', 'weekday')).toEqual([0])
    expect(parseCron('@reboot')).toEqual({ ok: false, reason: 'reboot' })
  })

  it('says what is wrong, and where', () => {
    expect(parseCron('* * * *')).toEqual({ ok: false, reason: 'count', count: 4 })
    expect(parseCron('60 * * * *')).toEqual({ ok: false, reason: 'range', field: 'minute', token: '60' })
    expect(parseCron('* * * foo *')).toEqual({ ok: false, reason: 'syntax', field: 'month', token: 'foo' })
    expect(parseCron('*/0 * * * *')).toEqual({ ok: false, reason: 'step', field: 'minute', token: '*/0' })
    expect(parseCron('0 0 5-1 * *')).toMatchObject({ ok: false, reason: 'range', field: 'day' })
  })
})

describe('nextRuns', () => {
  // Local time throughout: the tool answers in the visitor's zone, and so does this.
  const from = new Date(2026, 8, 24, 10, 7, 30) // Thu 24 September 2026, 10:07:30

  it('finds the next weekday mornings', () => {
    const runs = nextRuns(schedule('0 9 * * 1-5'), from, 3)
    expect(runs.map((d) => [d.getDate(), d.getHours(), d.getMinutes()])).toEqual([
      [25, 9, 0],
      [28, 9, 0],
      [29, 9, 0],
    ])
  })

  it('starts from the next whole minute', () => {
    const [first] = nextRuns(schedule('* * * * *'), from, 1)
    expect([first!.getHours(), first!.getMinutes(), first!.getSeconds()]).toEqual([10, 8, 0])
  })

  it('matches either day field when both are set (Vixie)', () => {
    // The 1st of each month, and every Monday.
    const runs = nextRuns(schedule('0 0 1 * 1'), from, 3)
    expect(runs.map((d) => [d.getMonth() + 1, d.getDate(), d.getDay()])).toEqual([
      [9, 28, 1],
      [10, 1, 4],
      [10, 5, 1],
    ])
  })

  it('treats a `*/n` day field as unrestricted, as Vixie does', () => {
    // Every other day of the month, AND Monday — not OR.
    const runs = nextRuns(schedule('0 0 */2 * 1'), from, 2)
    for (const run of runs) {
      expect(run.getDay()).toBe(1)
      expect(run.getDate() % 2).toBe(1)
    }
  })

  it('finds a leap day, and gives up on a date that never comes', () => {
    const [leap] = nextRuns(schedule('0 0 29 2 *'), from, 1)
    expect([leap!.getFullYear(), leap!.getMonth(), leap!.getDate()]).toEqual([2028, 1, 29])
    expect(nextRuns(schedule('0 0 30 2 *'), from, 5)).toEqual([])
  })
})

describe('describeCron', () => {
  it.each([
    ['* * * * *', 'every minute', 'toutes les minutes'],
    ['*/15 * * * *', 'every 15 minutes', 'toutes les 15 minutes'],
    ['0 9 * * 1-5', 'at 09:00, on Monday to Friday', 'à 09:00, du lundi au vendredi'],
    ['30 2 * * 0', 'at 02:30, on Sunday', 'à 02:30, le dimanche'],
    ['0 0 1 * *', 'at 00:00, on day 1 of the month', 'à 00:00, le 1er du mois'],
    ['0 9,17 * * *', 'at 09:00 and 17:00, every day', 'à 09:00 et 17:00, tous les jours'],
    ['0 */2 * * *', 'at minute 0, every 2 hours', 'à la minute 0, toutes les 2 heures'],
    ['5 4 * 1,7 *', 'at 04:05, every day, in January and July', 'à 04:05, tous les jours, en janvier et juillet'],
    ['0 0 1 * 1', 'at 00:00, on day 1 of the month or on Monday', 'à 00:00, le 1er du mois ou le lundi'],
    ['0 12 * 3-6 *', 'at 12:00, every day, from March to June', 'à 12:00, tous les jours, de mars à juin'],
  ])('%s', (expression, en, fr) => {
    expect(describeCron(schedule(expression), 'en')).toBe(en)
    expect(describeCron(schedule(expression), 'fr')).toBe(fr)
  })
})
