import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'

const jobs = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { ...actual.api, jobs } }
})

import { adminPassword, isAdmin, lockAdmin, unlockAdmin } from '../admin'

/**
 * The unlock asks the admin surface itself whether the password is right, and
 * tells a wrong password from an API that could not be reached — the two deserve
 * different words, and only one of them should make the owner retype anything.
 */
describe('admin unlock', () => {
  beforeEach(() => {
    lockAdmin()
    jobs.mockReset()
  })

  it('unlocks on a 200 and remembers the password for the tab', async () => {
    jobs.mockResolvedValue({ configured: true, jobs: [] })
    expect(isAdmin.value).toBe(false)

    await expect(unlockAdmin('letmein')).resolves.toBe('ok')

    expect(jobs).toHaveBeenCalledWith('letmein')
    expect(isAdmin.value).toBe(true)
    expect(adminPassword()).toBe('letmein')
    expect(sessionStorage.getItem('couvbat:sudo')).toBe('letmein')
  })

  it('stays locked on a 403 and says so', async () => {
    jobs.mockRejectedValue(new ApiError('Not the admin', 403))
    await expect(unlockAdmin('guess')).resolves.toBe('wrong')
    expect(isAdmin.value).toBe(false)
    expect(sessionStorage.getItem('couvbat:sudo')).toBeNull()
  })

  it('does not take an unreachable API for a wrong password', async () => {
    jobs.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(unlockAdmin('letmein')).resolves.toBe('unreachable')
    jobs.mockRejectedValue(new ApiError('boom', 500))
    await expect(unlockAdmin('letmein')).resolves.toBe('unreachable')
    expect(isAdmin.value).toBe(false)
  })

  it('locks again on demand', async () => {
    jobs.mockResolvedValue({ configured: true, jobs: [] })
    await unlockAdmin('letmein')
    lockAdmin()
    expect(isAdmin.value).toBe(false)
    expect(adminPassword()).toBeNull()
    expect(sessionStorage.getItem('couvbat:sudo')).toBeNull()
  })
})
