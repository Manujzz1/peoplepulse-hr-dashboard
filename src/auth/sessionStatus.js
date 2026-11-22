export function authStatusForEvent(event, session, currentStatus = 'loading') {
  if (event === 'PASSWORD_RECOVERY') return 'recovery'
  if (currentStatus === 'recovery' && session) return 'recovery'
  if (event === 'INITIAL_SESSION' && !session) return currentStatus
  return session ? 'authenticated' : 'anonymous'
}

export function authStatusForInitialSession(session, currentStatus) {
  if (currentStatus === 'recovery') return 'recovery'
  if (session) return 'authenticated'
  return 'anonymous'
}

export function shouldClearPrivateStateOnAuthChange(previousStatus, nextStatus) {
  return previousStatus === 'authenticated' && nextStatus !== 'authenticated'
}
