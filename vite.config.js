import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Module workers permit code-split worker dependencies instead of embedding
  // the full spreadsheet parser in the worker entry bundle.
  worker: {
    format: 'es',
  },
})
