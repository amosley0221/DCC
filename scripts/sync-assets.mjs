#!/usr/bin/env node
/**
 * Copies the shared dataset and typefaces into each app's source tree.
 *
 * Both apps read committed files rather than reaching across the repo at build
 * time, so a build stays hermetic and neither Gradle nor Vite needs a custom
 * copy step. Run after `npm run gen:data` or `node scripts/fetch-fonts.mjs`.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const at = (p) => resolve(root, p)

const androidAssets = at('apps/android/app/src/main/assets')
const androidFonts = at('apps/android/app/src/main/res/font')
const desktopFonts = at('apps/desktop/src/fonts')

for (const dir of [androidAssets, androidFonts, desktopFonts]) mkdirSync(dir, { recursive: true })

copyFileSync(at('shared/data/dcc-data.json'), resolve(androidAssets, 'dcc-data.json'))

// Android font resource names must be lowercase with underscores; the fetch
// script already writes them that way.
for (const f of readdirSync(androidFonts)) if (f.endsWith('.ttf')) rmSync(resolve(androidFonts, f))
for (const f of readdirSync(at('shared/fonts/ttf'))) {
  copyFileSync(at(`shared/fonts/ttf/${f}`), resolve(androidFonts, f))
}
for (const f of readdirSync(at('shared/fonts/woff2'))) {
  copyFileSync(at(`shared/fonts/woff2/${f}`), resolve(desktopFonts, f))
}

console.log('synced dcc-data.json + fonts into apps/android and apps/desktop')
