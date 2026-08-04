import { describe, expect, it } from 'vitest'
import type { Localised } from '@/content/types'
import { resolveFileLines } from '../commands/files'
import { ENV_FILE, fakeEnv } from '../commands/env-file'
import { SECRET_FILE } from '../commands/secret'

const t = <T,>(value: Localised<T>): T => value.en

describe('resolveFileLines', () => {
  it('resolves the visible files', () => {
    for (const file of ['about.txt', 'skills.txt', 'contact.txt']) {
      expect(resolveFileLines(file, t), file).toBeDefined()
    }
  })

  it('resolves the hidden files', () => {
    expect(resolveFileLines(SECRET_FILE, t)).toBeDefined()
    expect(resolveFileLines(ENV_FILE, t)).toBeDefined()
  })

  it('returns undefined for an unknown name', () => {
    expect(resolveFileLines('passwd', t)).toBeUndefined()
  })

  it('renders every fake variable into .env, so the file and `env` cannot drift', () => {
    const text = resolveFileLines(ENV_FILE, t)!.map((l) => l.text)
    for (const { key, value } of fakeEnv) {
      expect(text).toContain(`${key}=${value}`)
    }
  })

  it('keeps the .env rows preformatted so the values stay aligned', () => {
    const assignments = resolveFileLines(ENV_FILE, t)!.filter((l) => l.text.includes('='))
    expect(assignments).toHaveLength(fakeEnv.length)
    expect(assignments.every((l) => l.pre)).toBe(true)
  })
})
