import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { build, preview } from 'vite'

const root = process.cwd()
process.env.VITE_SUPABASE_URL = 'https://peoplepulse-e2e.test'
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_local_browser_fixture'
process.env.VITE_ENABLE_LIVE_IMPORTS = 'false'

const configFile = resolve(root, 'vite.config.js')
const buildOptions = { outDir: 'node_modules/.cache/peoplepulse-e2e-site', emptyOutDir: true }
await build({ configFile, build: buildOptions })
const server = await preview({
  configFile,
  build: buildOptions,
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
})

let child
let exitCode = 1
try {
  child = spawn(process.execPath, [
    resolve(root, 'node_modules/@playwright/test/cli.js'),
    'test',
    ...process.argv.slice(2),
  ], {
    cwd: root,
    env: { ...process.env, PEOPLEPULSE_E2E_MANAGED: '1' },
    stdio: 'inherit',
  })
  exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolveExit(signal ? 1 : code ?? 1))
  })
} finally {
  if (child && child.exitCode === null && child.signalCode === null) child.kill()
  await new Promise((resolve) => server.httpServer.close(resolve))
}

process.exitCode = exitCode
