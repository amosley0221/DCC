import { readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { join, extname, basename, relative } from 'node:path'

/**
 * Reading the game's own art — team logos, player portraits, coach faces.
 *
 * None of it is in the save. It lives in the game install, in Frostbite's
 * asset archives, which is a different format from the save entirely: a
 * catalogue mapping content hashes to offsets inside large `.cas` blobs, with
 * `.toc` and `.sb` files describing the bundles that reference them.
 *
 * That format has to be worked out the same way the save was, and the same way
 * round: this file does the looking, on the user's machine, and reports what it
 * finds. Nothing here decodes anything yet.
 */

/** Files worth reading a header from, in the order they matter. */
const NOTABLE = [
  'layout.toc', 'cas.cat', 'initfs_Win32', 'initfs_win32',
  'package.mft', 'bcrypt.toc', 'Manifest.txt',
]

const ARCHIVE_EXT = new Set(['.toc', '.sb', '.cas', '.cat', '.mft', '.bundle', '.part'])

export interface FileNote {
  path: string
  bytes: number
  /** First 32 bytes, hex — enough to recognise a container. */
  head: string
  /** The same bytes as text, unprintables dotted. */
  headAscii: string
}

export interface InstallReport {
  root: string
  /** True once anything Frostbite-shaped turns up. */
  looksFrostbite: boolean
  scannedFiles: number
  scannedDirs: number
  totalBytes: number
  /** Stopped early because the tree was enormous. */
  truncated: boolean
  byExtension: { ext: string; count: number; bytes: number }[]
  /** Directories holding the most data — where the art will be. */
  biggestDirs: { path: string; bytes: number; files: number }[]
  notable: FileNote[]
  largestArchives: FileNote[]
  notes: string[]
}

function head(path: string, n = 32): { head: string; headAscii: string } {
  try {
    const fd = openSync(path, 'r')
    const buf = Buffer.alloc(n)
    const read = readSync(fd, buf, 0, n, 0)
    closeSync(fd)
    const b = buf.subarray(0, read)
    return {
      head: b.toString('hex').replace(/(..)/g, '$1 ').trim(),
      headAscii: b.toString('latin1').replace(/[^ -~]/g, '.'),
    }
  } catch {
    return { head: '(unreadable)', headAscii: '' }
  }
}

/**
 * Walks a game install and describes it. Deliberately cheap: it stats
 * everything but only opens a handful of files, because a Frostbite install is
 * tens of gigabytes and the point is to find out where the art lives, not to
 * read it.
 */
export function scanInstall(root: string, limits = { files: 200_000, depth: 12 }): InstallReport {
  const byExt = new Map<string, { count: number; bytes: number }>()
  const dirBytes = new Map<string, { bytes: number; files: number }>()
  const archives: { path: string; bytes: number }[] = []
  const notableHits: string[] = []
  let scannedFiles = 0
  let scannedDirs = 0
  let totalBytes = 0
  let truncated = false

  const walk = (dir: string, depth: number) => {
    if (truncated || depth > limits.depth) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    scannedDirs++
    let here = 0
    let hereFiles = 0
    for (const e of entries) {
      if (scannedFiles >= limits.files) { truncated = true; return }
      const full = join(dir, e.name)
      if (e.isDirectory()) { walk(full, depth + 1); continue }
      if (!e.isFile()) continue
      let size = 0
      try { size = statSync(full).size } catch { continue }
      scannedFiles++
      totalBytes += size
      here += size
      hereFiles++
      const ext = (extname(e.name) || '(none)').toLowerCase()
      const cur = byExt.get(ext) ?? { count: 0, bytes: 0 }
      cur.count++; cur.bytes += size
      byExt.set(ext, cur)
      if (NOTABLE.includes(basename(e.name))) notableHits.push(full)
      if (ARCHIVE_EXT.has(ext)) archives.push({ path: full, bytes: size })
    }
    if (hereFiles) dirBytes.set(dir, { bytes: here, files: hereFiles })
  }
  walk(root, 0)

  const byExtension = [...byExt.entries()]
    .map(([ext, v]) => ({ ext, ...v }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 20)

  const biggestDirs = [...dirBytes.entries()]
    .map(([path, v]) => ({ path: relative(root, path) || '.', ...v }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 12)

  const notable: FileNote[] = notableHits.slice(0, 12).map((p) => {
    let bytes = 0
    try { bytes = statSync(p).size } catch { /* gone */ }
    return { path: relative(root, p), bytes, ...head(p) }
  })

  const largestArchives: FileNote[] = archives
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 12)
    .map((a) => ({ path: relative(root, a.path), bytes: a.bytes, ...head(a.path) }))

  const exts = new Set(byExtension.map((e) => e.ext))
  const looksFrostbite = notableHits.length > 0 || (exts.has('.cas') && (exts.has('.toc') || exts.has('.sb')))

  const notes: string[] = []
  if (!scannedFiles) notes.push('Nothing was readable under that folder — is it the right one?')
  else if (!looksFrostbite) {
    notes.push(
      'No Frostbite archives here. The game install should contain .cas blobs alongside .toc or .sb ' +
      'tables, usually under a Data folder. This may be a launcher folder rather than the game itself.',
    )
  } else {
    notes.push(`Frostbite install: ${archives.length.toLocaleString()} archive files, ${(totalBytes / 1e9).toFixed(1)} GB scanned.`)
    notes.push('The art is inside the .cas blobs, addressed by the catalogue rather than stored as separate files.')
  }
  if (truncated) notes.push(`Stopped after ${limits.files.toLocaleString()} files — the report covers a slice, not the whole tree.`)

  return {
    root, looksFrostbite, scannedFiles, scannedDirs, totalBytes, truncated,
    byExtension, biggestDirs, notable, largestArchives, notes,
  }
}

/**
 * Looks for the game install without making the user hunt for it.
 *
 * A Frostbite install is recognisable from its own contents, so rather than
 * matching folder names this checks candidates for the layout file and the
 * archives beside it.
 */
export function findInstall(roots: string[]): { found: true; path: string } | { found: false; searched: number; message: string } {
  let searched = 0
  const looksRight = (dir: string): boolean => {
    try {
      const names = readdirSync(dir)
      if (!names.some((n) => n.toLowerCase() === 'layout.toc')) return false
      // layout.toc alone also appears in unrelated tools; require the data too.
      return names.some((n) => n.toLowerCase() === 'data') || names.some((n) => n.toLowerCase().endsWith('.cas'))
    } catch { return false }
  }
  const walk = (dir: string, depth: number): string | null => {
    if (depth > 4 || searched > 40_000) return null
    let entries: import('node:fs').Dirent[]
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return null }
    if (looksRight(dir)) return dir
    for (const e of entries) {
      if (!e.isDirectory()) continue
      searched++
      if (/^(Windows|\$Recycle\.Bin|System Volume Information|node_modules)$/i.test(e.name)) continue
      const hit = walk(join(dir, e.name), depth + 1)
      if (hit) return hit
    }
    return null
  }
  for (const r of roots) {
    const hit = walk(r, 0)
    if (hit) return { found: true, path: hit }
  }
  return {
    found: false,
    searched,
    message: 'No Frostbite install found in the usual places. Pick the folder holding layout.toc and the Data directory.',
  }
}

// ── obfuscated tables ─────────────────────────────────────────────────────────

/** Frostbite marks a scrambled table with 0x00D1CE00 or 0x00D1CE01 — "DICE". */
export const OBFUSCATION_MAGIC = [0x00d1ce00, 0x00d1ce01]

export interface Deobfuscated {
  keyOffset: number
  keyLength: number
  dataOffset: number
  xor: number
  /** Printable runs of four or more characters — the signal that it worked. */
  strings: number
  /** Known Frostbite table words present, the strongest evidence. */
  known: string[]
  sample: string[]
}

/** Words a real Frostbite table of contents contains once it is readable. */
const TOC_WORDS = [
  'superBundles', 'installChunks', 'totalSize', 'alwaysid', 'name', 'cas',
  'bundles', 'chunks', 'ebx', 'res', 'idx', 'size', 'offset', 'sha1',
]

function scoreText(buf: Buffer): { strings: number; known: string[]; sample: string[] } {
  let strings = 0
  const sample: string[] = []
  let run = 0
  let start = 0
  for (let i = 0; i <= buf.length; i++) {
    const c = i < buf.length ? buf[i] : 0
    const printable = c >= 32 && c < 127
    if (printable) { if (run === 0) start = i; run++ }
    else {
      if (run >= 4) {
        strings++
        if (sample.length < 12) sample.push(buf.subarray(start, i).toString('latin1'))
      }
      run = 0
    }
  }
  const text = buf.toString('latin1')
  const known = TOC_WORDS.filter((w) => text.includes(w))
  return { strings, known, sample }
}

/**
 * Works out how a scrambled table is scrambled, by trying the shapes the format
 * is known to use and keeping whichever produces readable text.
 *
 * Deliberately a search rather than a single hard-coded scheme: the exact
 * offsets differ between Frostbite versions, and a guess that happens to be
 * wrong produces confident nonsense. Readable strings are the test — a wrong
 * key yields none, and the right one yields hundreds.
 */
export function deobfuscate(buf: Buffer): { obfuscated: boolean; best: Deobfuscated | null; tried: number; runners: Deobfuscated[] } {
  if (buf.length < 1024) return { obfuscated: false, best: null, tried: 0, runners: [] }
  const magic = buf.readUInt32BE(0)
  if (!OBFUSCATION_MAGIC.includes(magic)) return { obfuscated: false, best: null, tried: 0, runners: [] }

  const keyOffsets = [0x08, 0x0c, 0x10, 0x128, 0x12c, 0x130]
  const keyLengths = [256, 257, 258, 260, 264]
  const xors = [0x00, 0x7b]
  const results: Deobfuscated[] = []
  let tried = 0

  for (const keyOffset of keyOffsets) {
    for (const keyLength of keyLengths) {
      if (keyOffset + keyLength > buf.length) continue
      const key = buf.subarray(keyOffset, keyOffset + keyLength)
      // The payload starts either right after the key or at the classic 0x22C.
      for (const dataOffset of [keyOffset + keyLength, 0x22c, 0x230]) {
        if (dataOffset >= buf.length) continue
        for (const xor of xors) {
          tried++
          const n = Math.min(buf.length - dataOffset, 64 * 1024)
          const out = Buffer.allocUnsafe(n)
          for (let i = 0; i < n; i++) out[i] = buf[dataOffset + i] ^ key[i % keyLength] ^ xor
          const s = scoreText(out)
          if (s.strings > 40 || s.known.length >= 3) {
            results.push({ keyOffset, keyLength, dataOffset, xor, ...s })
          }
        }
      }
    }
  }
  results.sort((a, b) => b.known.length - a.known.length || b.strings - a.strings)
  return { obfuscated: true, best: results[0] ?? null, tried, runners: results.slice(1, 4) }
}

/** Applies a solved scheme to the whole file. */
export function unscramble(buf: Buffer, d: Deobfuscated): Buffer {
  const key = buf.subarray(d.keyOffset, d.keyOffset + d.keyLength)
  const n = buf.length - d.dataOffset
  const out = Buffer.allocUnsafe(n)
  for (let i = 0; i < n; i++) out[i] = buf[d.dataOffset + i] ^ key[i % d.keyLength] ^ d.xor
  return out
}

export interface TableReport {
  file: string
  bytes: number
  magic: string
  obfuscated: boolean
  solved: boolean
  scheme: string | null
  strings: number
  known: string[]
  sample: string[]
  /** When nothing worked, the raw bytes to reason from. */
  headHex: string
  tried: number
}

/**
 * Reads the tables that describe the archives, unscrambling them if needed.
 *
 * Reports what it managed rather than assuming: if no scheme produces readable
 * text it says so and hands back the header, which is the thing worth looking
 * at next.
 */
export function readTables(root: string, files: string[]): TableReport[] {
  const out: TableReport[] = []
  for (const rel of files) {
    const full = join(root, rel)
    let buf: Buffer
    try {
      const fd = openSync(full, 'r')
      const size = statSync(full).size
      buf = Buffer.alloc(Math.min(size, 4 * 1024 * 1024))
      readSync(fd, buf, 0, buf.length, 0)
      closeSync(fd)
    } catch {
      continue
    }
    const magic = buf.length >= 4 ? '0x' + buf.readUInt32BE(0).toString(16).padStart(8, '0') : '(too short)'
    const d = deobfuscate(buf)
    const plainScore = scoreText(buf.subarray(0, 64 * 1024))
    out.push({
      file: rel,
      bytes: buf.length,
      magic,
      obfuscated: d.obfuscated,
      solved: !!d.best,
      scheme: d.best
        ? `key at 0x${d.best.keyOffset.toString(16)} length ${d.best.keyLength}, data from 0x${d.best.dataOffset.toString(16)}, xor 0x${d.best.xor.toString(16)}`
        : null,
      strings: d.best ? d.best.strings : plainScore.strings,
      known: d.best ? d.best.known : plainScore.known,
      sample: d.best ? d.best.sample : plainScore.sample,
      headHex: buf.subarray(0, 64).toString('hex').replace(/(..)/g, '$1 ').trim(),
      tried: d.tried,
    })
  }
  return out
}
