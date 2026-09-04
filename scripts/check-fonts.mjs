#!/usr/bin/env node
/**
 * Verifies every bundled font is really the format its extension claims.
 *
 * Google Fonts picks a format from the request's user agent, so a fetch with
 * the wrong one silently yields EOT or WOFF named .ttf. Android will not load
 * those and the app dies on its first frame, which is a long way from the
 * download to notice. This check makes the wrong format fail the build.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const SFNT = new Set([0x00010000, 0x4f54544f, 0x74727565]) // 1.0, 'OTTO', 'true'
const WOFF2 = 0x774f4632 // 'wOF2'

const problems = []

function checkTtf(path, buf) {
  const magic = buf.readUInt32BE(0)
  if (!SFNT.has(magic)) {
    problems.push(`${path}: not a TTF/OTF (starts with 0x${magic.toString(16)})`)
    return
  }
  // Walk the table directory so a truncated download is caught too.
  const numTables = buf.readUInt16BE(4)
  if (12 + numTables * 16 > buf.length) {
    problems.push(`${path}: table directory runs past the end of the file`)
    return
  }
  const seen = new Set()
  for (let i = 0; i < numTables; i++) {
    const at = 12 + i * 16
    const tag = buf.toString('latin1', at, at + 4)
    const offset = buf.readUInt32BE(at + 8)
    const length = buf.readUInt32BE(at + 12)
    seen.add(tag)
    if (offset + length > buf.length) problems.push(`${path}: table ${tag} is truncated`)
  }
  for (const required of ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name']) {
    if (!seen.has(required)) problems.push(`${path}: missing required table ${required}`)
  }
}

function checkWoff2(path, buf) {
  if (buf.readUInt32BE(0) !== WOFF2) {
    problems.push(`${path}: not a WOFF2 (starts with 0x${buf.readUInt32BE(0).toString(16)})`)
    return
  }
  const declared = buf.readUInt32BE(8)
  if (declared !== buf.length) {
    problems.push(`${path}: WOFF2 header declares ${declared} bytes but the file is ${buf.length}`)
  }
}

const dirs = [
  { dir: 'shared/fonts/ttf', ext: '.ttf', check: checkTtf },
  { dir: 'shared/fonts/woff2', ext: '.woff2', check: checkWoff2 },
  { dir: 'apps/android/app/src/main/res/font', ext: '.ttf', check: checkTtf },
  { dir: 'apps/desktop/src/fonts', ext: '.woff2', check: checkWoff2 },
]

let checked = 0
for (const { dir, ext, check } of dirs) {
  const files = readdirSync(resolve(root, dir)).filter((f) => f.endsWith(ext))
  if (files.length === 0) problems.push(`${dir}: no ${ext} files found`)
  for (const f of files) {
    const path = `${dir}/${f}`
    const buf = readFileSync(resolve(root, path))
    if (buf.length < 16) problems.push(`${path}: too small to be a font`)
    else check(path, buf)
    checked++
  }
}

if (problems.length) {
  console.error(`Font check failed (${problems.length} problem(s)):`)
  for (const p of problems) console.error(`  ${p}`)
  console.error('\nRe-download with: node scripts/fetch-fonts.mjs && node scripts/sync-assets.mjs')
  process.exit(1)
}

console.log(`fonts ok — ${checked} files across ${dirs.length} directories`)
