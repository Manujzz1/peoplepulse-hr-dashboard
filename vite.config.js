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
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
            { name: 'exceljs-vendor', test: /node_modules[\\/]exceljs[\\/]/, priority: 25 },
            { name: 'charts-vendor', test: /node_modules[\\/](recharts|d3-[^\\/]+)[\\/]/, minSize: 20_000, maxSize: 400_000, priority: 20 },
            { name: 'vendor', test: /node_modules[\\/]/, minSize: 20_000, maxSize: 400_000, priority: 10 },
          ],
        },
      },
    },
  },
})
