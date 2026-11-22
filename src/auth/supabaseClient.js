import { createClient } from '@supabase/supabase-js'
import { readSupabaseConfig } from './supabaseConfig'

const config = readSupabaseConfig({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
})

export const supabaseConfigurationError = config.provided && !config.configured
  ? 'Supabase configuration is incomplete. Set a valid VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
  : ''
export const supabaseConfigured = config.configured
export const supabase = supabaseConfigured
  ? createClient(config.url, config.publishableKey, {
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
