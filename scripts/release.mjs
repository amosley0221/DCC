#!/usr/bin/env node
/**
 * Cuts a release: bumps the version, dates the CHANGELOG section, syncs the
 * per-platform version files, commits and tags. Pushing the tag is what starts
 * the build — see .github/workflows/release.yml.
 *
 *   npm run release -- patch|minor|major|<x.y.z>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' })
const capture = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim()

const bump = process.argv[2]
if (!bump) {
  console.error('usage: npm run release -- patch|minor|major|<x.y.z>')
  process.exit(1)
}

if (capture('git', ['status', '--porcelain'])) {
  console.error('Working tree is dirty — commit or stash first.')
  process.exit(1)
}

const pkgPath = resolve(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const [major, minor, patch] = pkg.version.split('.').map(Number)
const next =
  bump === 'major' ? `${major + 1}.0.0`
  : bump === 'minor' ? `${major}.${minor + 1}.0`
  : bump === 'patch' ? `${major}.${minor}.${patch + 1}`
  : bump
if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`"${bump}" is not patch|minor|major or a plain x.y.z version`)
  process.exit(1)
}

// CHANGELOG: turn the Unreleased section into the new version section.
const clPath = resolve(root, 'CHANGELOG.md')
let cl = readFileSync(clPath, 'utf8')
const unreleased = /## \[Unreleased\]\n([\s\S]*?)(?=\n## |\n\[|$)/.exec(cl)
const notes = (unreleased?.[1] ?? '').trim()
if (!notes) {
  console.error('CHANGELOG.md has nothing under "## [Unreleased]" — describe the change before releasing.')
  process.exit(1)
}
const today = new Date().toISOString().slice(0, 10)
cl = cl.replace(
  /## \[Unreleased\]\n[\s\S]*?(?=\n## |\n\[|$)/,
  `## [Unreleased]\n\n_Nothing yet._\n\n## [${next}] - ${today}\n\n${notes}\n`,
)
writeFileSync(clPath, cl)

pkg.version = next
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
run('node', ['scripts/sync-version.mjs'])

run('git', ['add', '-A'])
run('git', ['commit', '-m', `release: v${next}`])
run('git', ['tag', '-a', `v${next}`, '-m', `v${next}\n\n${notes}`])

console.log(`\nTagged v${next}. Push it to build and publish:\n\n  git push -u origin HEAD && git push origin v${next}\n`)
