import { describe, expect, it, vi } from 'vitest'
import { isCurrentExportScope, isExportAllowed, verifyLiveExportReadiness } from './exportSecurity'

describe('live export security', () => {
  it('blocks reports absent from the refreshed permission set', () => {
    expect(isExportAllowed('payroll', ['summary', 'headcount'])).toBe(false)
    expect(isExportAllowed('summary', ['summary', 'headcount'])).toBe(true)
  })
  it('rejects a cached export when the current account or its scope changed', () => {
    const profile = { userId: 'user-a', scopeKey: 'company-a' }
    expect(isCurrentExportScope(profile, 'user-a', 'company-a')).toBe(true)
    expect(isCurrentExportScope(profile, 'user-a', 'company-b')).toBe(false)
    expect(isCurrentExportScope(profile, 'user-b', 'company-a')).toBe(false)
    expect(isCurrentExportScope({}, undefined, undefined)).toBe(false)
  })
  it('allows an export only from a fresh live snapshot', async () => {
    await expect(verifyLiveExportReadiness({ loadedAt: new Date(10_000).toISOString(), now: 20_000 })).resolves.toBe(true)
  })

  it('refreshes stale data and requires a second export action', async () => {
    const refresh = vi.fn().mockResolvedValue({ loadedAt: new Date(50_000).toISOString() })
    await expect(verifyLiveExportReadiness({ loadedAt: new Date(1_000).toISOString(), now: 50_000, refresh })).resolves.toBe(false)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('fails closed if the session expires while refreshing data', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('Session expired'))
    await expect(verifyLiveExportReadiness({ loadedAt: '', now: 50_000, refresh })).rejects.toThrow('Session expired')
  })
})
