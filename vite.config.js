import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readSupabaseConfig } from './src/auth/supabaseConfig.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'peoplepulse-supabase-config',
      apply: 'build',
      configResolved({ env }) {
        const { provided, configured } = readSupabaseConfig(env)
        if (!configured && (provided || process.env.VERCEL_ENV === 'production')) {
          throw new Error('Set VITE_SUPABASE_URL and a public VITE_SUPABASE_PUBLISHABLE_KEY before building PeoplePulse.')
        }
      },
    },
  ],
  // Module workers permit code-split worker dependencies instead of embedding
  // the full spreadsheet parser in the worker entry bundle.
  worker: {
    format: 'es',
  },
  // Let Rolldown preserve module initialization order across lazy imports.
  // The forced Recharts split evaluated axis defaults before their constants.
})
