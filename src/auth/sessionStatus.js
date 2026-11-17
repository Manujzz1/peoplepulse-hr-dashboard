export function authStatusForEvent(event, session, currentStatus = 'loading') {
  if (event === 'PASSWORD_RECOVERY') return 'recovery'
  if (event === 'INITIAL_SESSION' && !session) return currentStatus
  return session ? 'authenticated' : 'anonymous'
}

export function authStatusForInitialSession(session, demoMode, currentStatus) {
  if (currentStatus === 'recovery') return 'recovery'
  if (session) return 'authenticated'
  return demoMode ? 'demo' : 'anonymous'
}
