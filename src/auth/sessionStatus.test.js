import { describe, expect, it } from 'vitest'
import { authStatusForEvent, authStatusForInitialSession, shouldClearPrivateStateOnAuthChange } from './sessionStatus'

describe('authentication session state', () => {
  it('protects the application until an authenticated session is present', () => {
    expect(authStatusForEvent('SIGNED_OUT', null)).toBe('anonymous')
    expect(authStatusForEvent('INITIAL_SESSION', null, 'loading')).toBe('loading')
    expect(authStatusForEvent('SIGNED_IN', { user: { id: 'synthetic-test-user' } })).toBe('authenticated')
    expect(authStatusForInitialSession(null, false, 'loading')).toBe('anonymous')
  })

  it('keeps a valid password recovery flow and tab-scoped demo separate', () => {
    expect(authStatusForEvent('PASSWORD_RECOVERY', { user: {} })).toBe('recovery')
    expect(authStatusForEvent('TOKEN_REFRESHED', { user: {} }, 'recovery')).toBe('recovery')
    expect(authStatusForInitialSession(null, true, 'loading')).toBe('demo')
    expect(authStatusForInitialSession({ user: {} }, true, 'loading')).toBe('authenticated')
    expect(authStatusForInitialSession(null, false, 'recovery')).toBe('recovery')
  })

  it('returns to the anonymous state when a provider session expires or signs out', () => {
    expect(authStatusForEvent('TOKEN_REFRESHED', null)).toBe('anonymous')
    expect(authStatusForEvent('SIGNED_OUT', null)).toBe('anonymous')
  })

  it('clears staged private data when crossing between authenticated and demo access', () => {
    expect(shouldClearPrivateStateOnAuthChange('authenticated', 'anonymous')).toBe(true)
    expect(shouldClearPrivateStateOnAuthChange('authenticated', 'demo')).toBe(true)
    expect(shouldClearPrivateStateOnAuthChange('demo', 'authenticated')).toBe(true)
    expect(shouldClearPrivateStateOnAuthChange('demo', 'anonymous')).toBe(false)
    expect(shouldClearPrivateStateOnAuthChange('loading', 'authenticated')).toBe(false)
  })
})
