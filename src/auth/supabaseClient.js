import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
const urlLooksValid = (() => {
  if (!supabaseUrl) return false
  try {
    return ['https:', 'http:'].includes(new URL(supabaseUrl).protocol)
  } catch {
    return false
  }
})()

export const supabaseConfigurationError = (supabaseUrl || supabaseAnonKey) && !(urlLooksValid && supabaseAnonKey)
  ? 'Supabase configuration is incomplete. Set a valid VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  : ''
export const supabaseConfigured = Boolean(urlLooksValid && supabaseAnonKey)
export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: window.sessionStorage,
      storageKey: 'peoplepulse-auth-session',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  })
  : null
