/**
 * Dev runner: esbuild watching the main process, the Vite dev server, and
 * Electron pointed at it.
 *
 * This is a script rather than a chain of shell commands because `a & b` runs
 * them in parallel in a POSIX shell and sequentially in cmd.exe — and this app
 * is developed on Windows.
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { context } from 'esbuild'
import { createServer } from 'vite'
import electron from 'electron'

const here = import.meta.dirname
const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron', 'electron-updater'],
  logLevel: 'info',
}

const watchers = await Promise.all([
  context({ ...common, entryPoints: [resolve(here, 'electron/main.ts')], outfile: resolve(here, 'dist/main/main.cjs') }),
  context({ ...common, entryPoints: [resolve(here, 'electron/preload.ts')], outfile: resolve(here, 'dist/main/preload.cjs') }),
])
await Promise.all(watchers.map((w) => w.watch()))

const server = await createServer({ configFile: resolve(here, 'vite.config.ts') })
await server.listen()
server.printUrls()

const url = server.resolvedUrls?.local?.[0]
if (!url) throw new Error('Vite did not report a local URL')

const child = spawn(electron, [here], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
})

const shutdown = async () => {
  await Promise.all(watchers.map((w) => w.dispose()))
  await server.close()
  process.exit(0)
}
child.on('close', shutdown)
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
