import { describe, expect, it } from 'vitest'
import { authStatusForEvent, authStatusForInitialSession, shouldClearPrivateStateOnAuthChange } from './sessionStatus'

describe('authentication session state', () => {
  it('protects the application until an authenticated session is present', () => {
    expect(authStatusForEvent('SIGNED_OUT', null)).toBe('anonymous')
    expect(authStatusForEvent('INITIAL_SESSION', null, 'loading')).toBe('loading')
    expect(authStatusForEvent('SIGNED_IN', { user: { id: 'synthetic-test-user' } })).toBe('authenticated')
    expect(authStatusForInitialSession(null, 'loading')).toBe('anonymous')
  })

  it('preserves a valid password recovery flow', () => {
    expect(authStatusForEvent('PASSWORD_RECOVERY', { user: {} })).toBe('recovery')
    expect(authStatusForEvent('TOKEN_REFRESHED', { user: {} }, 'recovery')).toBe('recovery')
    expect(authStatusForInitialSession({ user: {} }, 'loading')).toBe('authenticated')
    expect(authStatusForInitialSession(null, 'recovery')).toBe('recovery')
  })

  it('returns to the anonymous state when a provider session expires or signs out', () => {
    expect(authStatusForEvent('TOKEN_REFRESHED', null)).toBe('anonymous')
    expect(authStatusForEvent('SIGNED_OUT', null)).toBe('anonymous')
  })

  it('clears staged private data when leaving authenticated access', () => {
    expect(shouldClearPrivateStateOnAuthChange('authenticated', 'anonymous')).toBe(true)
    expect(shouldClearPrivateStateOnAuthChange('authenticated', 'recovery')).toBe(true)
    expect(shouldClearPrivateStateOnAuthChange('loading', 'authenticated')).toBe(false)
  })
})
