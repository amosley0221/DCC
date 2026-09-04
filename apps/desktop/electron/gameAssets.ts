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

export interface Solved {
  keyLength: number
  dataOffset: number
  /** The recovered key, hex, for the record. */
  keyHex: string
  strings: number
  /** How many printable runs pure noise of this length would give. */
  expected: number
  longRuns: number
  known: string[]
  sample: string[]
  /** Rows of evidence behind each key byte. Below ~40 the key gets unreliable. */
  samplesPerByte: number
}

/**
 * Words a Frostbite table contains once readable. Only long ones: short words
 * like "res" turn up in noise by chance, and a check that noise can pass is not
 * a check.
 */
const TOC_WORDS = [
  'superBundles', 'installChunks', 'totalSize', 'alwaysid', 'bundles',
  'chunks', 'install', 'layout', 'Bundle', 'Chunk', 'football', 'package',
]

/** Printable runs expected from random bytes: P(run of 4+) per position. */
const NOISE_RATE = (1 - 95 / 256) * Math.pow(95 / 256, 4)

function scoreText(buf: Buffer) {
  let strings = 0
  let longRuns = 0
  const sample: string[] = []
  let run = 0
  let start = 0
  for (let i = 0; i <= buf.length; i++) {
    const c = i < buf.length ? buf[i] : 0
    if (c >= 32 && c < 127) { if (run === 0) start = i; run++ } else {
      if (run >= 4) {
        strings++
        if (run >= 8) {
          longRuns++
          if (sample.length < 12) sample.push(buf.subarray(start, i).toString('latin1'))
        }
      }
      run = 0
    }
  }
  const text = buf.toString('latin1')
  return { strings, longRuns, known: TOC_WORDS.filter((w) => text.includes(w)), sample, expected: Math.round(buf.length * NOISE_RATE) }
}

/**
 * Recovers a repeating-XOR key from the data itself.
 *
 * This deliberately assumes nothing about where Frostbite keeps its key. A
 * repeating key leaves two fingerprints: bytes a key-length apart agree far
 * more often than chance, which gives the length; and within each residue class
 * the commonest byte is almost certainly encrypting 0x00, since these tables are
 * mostly padding, which gives the key. Both come from the file.
 *
 * The earlier version guessed offsets from memory and scored the result against
 * a threshold that noise cleared comfortably. That is why it reported two
 * solved tables that were nothing of the sort.
 */
function keyLengths(data: Buffer, max = 1024): number[] {
  const scored: { len: number; agree: number }[] = []
  const n = Math.min(data.length, 256 * 1024)
  for (let len = 1; len <= max; len++) {
    let same = 0
    let total = 0
    for (let i = 0; i + len < n; i += 7) { if (data[i] === data[i + len]) same++; total++ }
    if (total > 200) scored.push({ len, agree: same / total })
  }
  scored.sort((a, b) => b.agree - a.agree)
  // Keep the strongest, plus their smallest divisors — a true length of 257
  // also scores at 514, and the shorter one is the real answer.
  const out: number[] = []
  for (const s of scored.slice(0, 24)) {
    let l = s.len
    for (const cand of out) if (l % cand === 0) { l = cand; break }
    if (!out.includes(l)) out.push(l)
    if (out.length >= 8) break
  }
  return out
}

function deriveKey(data: Buffer, len: number): Buffer {
  const key = Buffer.alloc(len)
  // Score every possible byte for each column rather than assuming the
  // commonest plaintext is zero. These tables are mostly NUL padding and ASCII
  // names, so the right key byte is the one that turns its column into those.
  for (let k = 0; k < len; k++) {
    let best = 0
    let bestScore = -1
    for (let cand = 0; cand < 256; cand++) {
      let score = 0
      let n = 0
      for (let i = k; i < data.length && n < 4096; i += len, n++) {
        const p = data[i] ^ cand
        if (p === 0) score += 3
        else if (p >= 32 && p < 127) score += 2
        else if (p === 0x0a || p === 0x0d || p === 0x09) score += 1
        else score -= 1
      }
      if (score > bestScore) { bestScore = score; best = cand }
    }
    key[k] = best
  }
  return key
}

export function deobfuscate(buf: Buffer): { obfuscated: boolean; best: Solved | null; tried: number; runners: Solved[] } {
  if (buf.length < 4096) return { obfuscated: false, best: null, tried: 0, runners: [] }
  const magic = buf.readUInt32BE(0)
  if (!OBFUSCATION_MAGIC.includes(magic)) return { obfuscated: false, best: null, tried: 0, runners: [] }

  const results: Solved[] = []
  let tried = 0
  // The key repeats, so guessing the payload start only rotates the recovered
  // key — it does not have to be exact.
  for (const dataOffset of [0x22c, 0x128, 0x08]) {
    if (dataOffset + 4096 > buf.length) continue
    const data = buf.subarray(dataOffset)
    // A true key of 257 also scores at 514 and 771. Testing the divisors too
    // matters because the shorter one gives every key byte twice the evidence,
    // and a key byte decided on 27 samples is often wrong.
    const cands = new Set<number>()
    for (const len of keyLengths(data)) {
      cands.add(len)
      for (let d = 2; d <= 6; d++) if (len % d === 0) cands.add(len / d)
    }
    for (const len of [...cands].sort((a, b) => a - b)) {
      tried++
      const key = deriveKey(data, len)
      const n = Math.min(data.length, 128 * 1024)
      const out = Buffer.allocUnsafe(n)
      for (let i = 0; i < n; i++) out[i] = data[i] ^ key[i % len]
      const s = scoreText(out)
      // Noise clears the old bar easily; require several times what noise gives,
      // plus runs long enough that noise essentially never produces them.
      if (s.strings > s.expected * 3 && s.longRuns > 20) {
        results.push({
          keyLength: len, dataOffset, keyHex: key.subarray(0, 32).toString('hex'),
          samplesPerByte: Math.floor(data.length / len), ...s,
        })
      }
    }
  }
  // Best evidence first; among equals prefer the shorter key, which is the real
  // period rather than a multiple of it.
  results.sort((a, b) => b.known.length - a.known.length || b.longRuns - a.longRuns || a.keyLength - b.keyLength)
  return { obfuscated: true, best: results[0] ?? null, tried, runners: results.slice(1, 4) }
}

export function unscramble(buf: Buffer, d: Solved): Buffer {
  const data = buf.subarray(d.dataOffset)
  const key = deriveKey(data, d.keyLength)
  const out = Buffer.allocUnsafe(data.length)
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % d.keyLength]
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
        ? `repeating key of ${d.best.keyLength} bytes from 0x${d.best.dataOffset.toString(16)} — ` +
          `${d.best.strings} runs against ${d.best.expected} expected from noise, ${d.best.longRuns} of 8+ chars, ` +
          `${d.best.samplesPerByte} samples per key byte${d.best.samplesPerByte < 40 ? ' (thin — the key may be imperfect)' : ''}`
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
