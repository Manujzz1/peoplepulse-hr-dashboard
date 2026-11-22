export function readSupabaseConfig(env) {
  const url = env.VITE_SUPABASE_URL?.trim()
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  let validUrl = false
  try {
    validUrl = ['https:', 'http:'].includes(new URL(url).protocol)
  } catch {
    // Missing and malformed URLs both leave Auth unconfigured.
  }

  return {
    url,
    publishableKey,
    provided: Boolean(url || publishableKey),
    configured: validUrl && /^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey || ''),
  }
}
