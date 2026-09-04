/**
 * Bundles the Electron main and preload scripts. They are CommonJS (`.cjs`)
 * because Electron's preload sandbox does not load ES modules.
 */
import { build, context } from 'esbuild'
import { resolve } from 'node:path'

const here = import.meta.dirname
const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  external: ['electron', 'electron-updater'],
  logLevel: 'info',
}

const jobs = [
  { ...common, entryPoints: [resolve(here, 'electron/main.ts')], outfile: resolve(here, 'dist/main/main.cjs') },
  { ...common, entryPoints: [resolve(here, 'electron/preload.ts')], outfile: resolve(here, 'dist/main/preload.cjs') },
]

if (process.argv.includes('--watch')) {
  for (const job of jobs) (await context(job)).watch()
} else {
  await Promise.all(jobs.map(build))
}
