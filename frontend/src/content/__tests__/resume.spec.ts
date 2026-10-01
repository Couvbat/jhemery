// @vitest-environment node
// The plugin runs at build time, in Node, outside the app; so does this.
import { describe, expect, it } from 'vitest'
import { buildContentJson, buildResume, buildResumeHtml, escapeHtml, RESUME_CSS, resumeHtmlFile } from '../../../vite-plugins/resume'
import { durationLabel, periodLabel, yearSpan } from '../dates'
import { education, experience } from '../experience'
import { profile } from '../profile'
import { projects } from '../projects'
import { skillNames } from '../skills'

const AT = new Date('2026-10-01T12:00:00Z')

/**
 * Each name's position in `text` after `from`, which must come in the list's own order.
 * Searching from the section's heading matters: "In-Leed" is in the bio too, well
 * before the experience section, and would satisfy a search of the whole document.
 */
function inOrder(document: string, from: string, names: string[]): void {
  const start = document.indexOf(from)
  expect(start, from).toBeGreaterThan(-1)
  const text = document.slice(start)
  const positions = names.map((name) => text.indexOf(name))
  for (const [i, position] of positions.entries()) expect(position, names[i]).toBeGreaterThan(-1)
  expect(positions).toEqual([...positions].sort((a, b) => a - b))
}

// The duration lives in the experience section and nowhere else, so it can't go
// stale in a sentence. (The bio's age, "de 25 ans", is not a length of experience.)
const TYPED_DURATION = /\d+\s*(years?|ans)\s+(of experience|d['’]expérience)|over \d+ years|sur \d+ ans/i

describe('one CV, every renderer', () => {
  it('lists the same roles and courses in the same order everywhere', () => {
    const txt = buildResume(AT)
    inOrder(txt, 'EXPERIENCE', experience.map((role) => role.employer.en))
    inOrder(txt, 'EDUCATION', education.map((course) => course.school.en))
    for (const locale of ['en', 'fr'] as const) {
      const html = buildResumeHtml(locale, AT)
      inOrder(html, '<ul class="experience">', experience.map((role) => escapeHtml(role.employer[locale])))
      inOrder(html, '<ul class="education">', education.map((course) => escapeHtml(course.school[locale])))
    }
    const data = JSON.parse(buildContentJson(AT)) as {
      experience: Array<{ employer: unknown }>
      education: Array<{ school: unknown }>
    }
    expect(data.experience.map((r) => r.employer)).toEqual(experience.map((role) => role.employer))
    expect(data.education.map((c) => c.school)).toEqual(education.map((course) => course.school))
  })

  it('works each duration out from the months', () => {
    const text = buildResume(AT)
    for (const role of experience) {
      expect(text).toContain(periodLabel(role.start, role.end).en)
      expect(text).toContain(durationLabel(role.start, role.end, AT).en)
    }
    const fr = buildResumeHtml('fr', AT)
    for (const role of experience) expect(fr).toContain(escapeHtml(durationLabel(role.start, role.end, AT).fr))
    for (const course of education) expect(fr).toContain(yearSpan(course.start, course.end))
  })

  it('types no length of experience into the prose', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const paragraph of profile.bio[locale]) expect(paragraph).not.toMatch(TYPED_DURATION)
      for (const project of projects) expect(project.description[locale]).not.toMatch(TYPED_DURATION)
    }
  })
})

describe('resume.txt', () => {
  it('carries the availability line and every skill name', () => {
    const text = buildResume()
    expect(text).toContain(profile.availability.note.en)
    for (const name of skillNames) expect(text).toContain(name)
  })

  it('points at the printable version', () => {
    expect(buildResume()).toContain(`https://${profile.domain}/resume.html`)
  })
})

describe('resume.html', () => {
  it.each(['en', 'fr'] as const)('is a complete %s document with no script in it', (locale) => {
    const html = buildResumeHtml(locale)
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain(`<html lang="${locale}">`)
    expect(html).not.toMatch(/<script/i)
    expect(html).toContain('<link rel="stylesheet" href="/resume.css">')
  })

  it.each(['en', 'fr'] as const)('says the same things as the content layer, in %s', (locale) => {
    const html = buildResumeHtml(locale)
    expect(html).toContain(escapeHtml(profile.role[locale]))
    expect(html).toContain(escapeHtml(profile.availability.note[locale]))
    for (const paragraph of profile.bio[locale]) expect(html).toContain(escapeHtml(paragraph))
    for (const project of projects) {
      expect(html).toContain(escapeHtml(project.name))
      expect(html).toContain(escapeHtml(project.description[locale]))
    }
    expect(html).toContain(escapeHtml(skillNames.join(' · ')))
  })

  it('links each language to the other', () => {
    expect(buildResumeHtml('en')).toContain(`href="/${resumeHtmlFile('fr')}"`)
    expect(buildResumeHtml('fr')).toContain(`href="/${resumeHtmlFile('en')}"`)
  })

  it('escapes what would otherwise be markup', () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe('&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;')
  })

  it('has a print stylesheet that hides the screen-only chrome', () => {
    expect(RESUME_CSS).toMatch(/@media print[\s\S]*\.screen-only\s*\{\s*display:\s*none/)
    expect(RESUME_CSS).toContain('@page')
  })
})

describe('content.json', () => {
  const data = JSON.parse(buildContentJson(AT)) as {
    version: number
    experience: Array<{ start: string; end?: string; duration: { en: string; fr: string } }>
    profile: { name: string; availability: { open: boolean } }
    skills: Array<{ name: string; usedIn: Array<{ url: string }> }>
    projects: Array<{ name: string }>
    now: { updated: string; staleDays: number | null }
  }

  it('carries the shape version the backend checks for', () => {
    expect(data.version).toBe(2)
  })

  it('works durations out at build time, as the backend has no clock rule of its own', () => {
    for (const role of data.experience) expect(role.duration).toEqual(durationLabel(role.start, role.end, AT))
  })

  it('is the same content the pages render', () => {
    expect(data.profile.name).toBe(profile.name)
    expect(data.projects.map((p) => p.name)).toEqual(projects.map((p) => p.name))
    expect(data.skills.map((s) => s.name)).toEqual(skillNames)
  })

  it('turns every evidence path into an absolute URL', () => {
    const urls = data.skills.flatMap((s) => s.usedIn.map((e) => e.url))
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) expect(url).toMatch(/^https:\/\//)
    expect(urls).toContain(`https://${profile.domain}/#projects`)
    expect(urls).toContain(`https://${profile.domain}/tools/ffmpeg`)
  })

  it('never carries a CTF flag — the chain is not something to hand an agent whole', () => {
    expect(buildContentJson()).not.toMatch(/CTF\{/)
  })
})
