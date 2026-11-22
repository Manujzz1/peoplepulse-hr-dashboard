// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('Supabase browser configuration', () => {
  it('configures email auth with the URL and publishable key', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://peoplepulse-test.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test_key')

    const { supabase, supabaseConfigured, supabaseConfigurationError } = await import('./supabaseClient')

    expect(supabaseConfigured).toBe(true)
    expect(supabase).not.toBeNull()
    expect(supabaseConfigurationError).toBe('')
    expect(supabase.auth).toBeDefined()
  })

  it('fails closed when only a legacy anon key is present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://peoplepulse-test.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'legacy-anon-key')

    const { supabase, supabaseConfigured, supabaseConfigurationError } = await import('./supabaseClient')

    expect(supabaseConfigured).toBe(false)
    expect(supabase).toBeNull()
    expect(supabaseConfigurationError).toContain('VITE_SUPABASE_PUBLISHABLE_KEY')
  })

  it('does not initialize the browser client with a secret key', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://peoplepulse-test.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_secret_synthetic_test_value')

    const { supabase, supabaseConfigured, supabaseConfigurationError } = await import('./supabaseClient')

    expect(supabaseConfigured).toBe(false)
    expect(supabase).toBeNull()
    expect(supabaseConfigurationError).not.toContain('synthetic_test_value')
  })
})
