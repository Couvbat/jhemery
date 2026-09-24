// @vitest-environment node
// The plugin runs at build time, in Node, outside the app; so does this.
import { describe, expect, it } from 'vitest'
import { buildContentJson, buildResume, buildResumeHtml, escapeHtml, RESUME_CSS, resumeHtmlFile } from '../../../vite-plugins/resume'
import { profile } from '../profile'
import { projects } from '../projects'
import { skillNames } from '../skills'

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
  const data = JSON.parse(buildContentJson(new Date('2026-09-24T00:00:00Z'))) as {
    version: number
    profile: { name: string; availability: { open: boolean } }
    skills: Array<{ name: string; usedIn: Array<{ url: string }> }>
    projects: Array<{ name: string }>
    now: { updated: string; staleDays: number | null }
  }

  it('carries the shape version the backend checks for', () => {
    expect(data.version).toBe(1)
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
