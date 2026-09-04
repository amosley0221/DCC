#!/usr/bin/env node
/**
 * Prints the CHANGELOG section for one version, so the GitHub Release body is
 * always exactly the notes written for that change.
 *
 *   node scripts/release-notes.mjs            # version from package.json
 *   node scripts/release-notes.mjs 0.2.0
 *   node scripts/release-notes.mjs v0.2.0
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = process.argv[2]
const version = (arg || JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version).replace(/^v/, '')

const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')
const lines = changelog.split('\n')
const start = lines.findIndex((l) => new RegExp(`^##\\s+\\[?${version.replace(/\./g, '\\.')}\\]?(\\s|$)`).test(l))

if (start === -1) {
  console.error(`No CHANGELOG.md section found for ${version}. Add a "## [${version}] - YYYY-MM-DD" heading.`)
  process.exit(1)
}
let end = lines.length
for (let i = start + 1; i < lines.length; i++) {
  if (/^##\s/.test(lines[i])) { end = i; break }
}

const body = lines.slice(start + 1, end).join('\n').trim()
process.stdout.write(body + '\n')
