const MAX_LIVE_EXPORT_AGE_MS = 30_000

export function isExportAllowed(reportKey, currentAllowedReports) {
  return Array.isArray(currentAllowedReports) && currentAllowedReports.includes(reportKey)
}

export function isCurrentExportScope(profile, userId, scopeKey) {
  return Boolean(userId && scopeKey && profile?.userId === userId && profile.scopeKey === scopeKey)
}

export async function verifyLiveExportReadiness({ loadedAt, refresh, now = Date.now() }) {
  const loadedTime = Date.parse(loadedAt || '')
  const age = now - loadedTime
  if (Number.isFinite(age) && age >= 0 && age <= MAX_LIVE_EXPORT_AGE_MS) return true
  if (typeof refresh !== 'function') throw new Error('Live data cannot be refreshed before export.')
  await refresh()
  return false
}
