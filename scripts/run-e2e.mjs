import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
process.env.VITE_SUPABASE_URL = 'https://peoplepulse-e2e.test'
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_local_browser_fixture'
process.env.VITE_ENABLE_LIVE_IMPORTS = 'false'

const server = await createServer({
  configFile: resolve(root, 'vite.config.js'),
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
})

let child
let exitCode = 1
try {
  await server.listen()
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
  await server.close()
}

process.exitCode = exitCode
