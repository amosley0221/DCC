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

/**
 * Runs of 12+ printable characters expected from random bytes, per position.
 *
 * Counting short runs is the wrong test: noise produces a great many of them —
 * about 786 in 64 KB — while real data produces fewer but far longer ones. A
 * table of 1,840 asset names scores below what noise gives, which is how an
 * earlier version rejected a perfectly good decode. Runs this long are what
 * noise essentially never manages: fewer than one per 87 KB.
 */
const LONG = 12
const NOISE_RATE = (1 - 95 / 256) * Math.pow(95 / 256, LONG)

function scoreText(buf: Buffer) {
  let strings = 0
  let longRuns = 0
  const sample: string[] = []
  let run = 0
  let start = 0
  for (let i = 0; i <= buf.length; i++) {
    const c = i < buf.length ? buf[i] : 0
    if (c >= 32 && c < 127) { if (run === 0) start = i; run++ } else {
      if (run >= 4) strings++
      if (run >= LONG) {
        longRuns++
        if (sample.length < 12) sample.push(buf.subarray(start, i).toString('latin1'))
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
  // Index of coincidence, not byte agreement at a lag.
  //
  // Comparing data[i] with data[i+L] only works when the plaintext itself
  // repeats at that lag, which is a property of the plaintext rather than the
  // key — it happened to hold for one table and failed for others. Splitting
  // into L columns is the right test: at the true length each column is the
  // plaintext XOR one constant, so it keeps the plaintext's lopsided byte
  // distribution; at any other length the columns are mixtures and flatten out
  // towards uniform.
  const n = Math.min(data.length, 128 * 1024)
  const scored: { len: number; ic: number }[] = []
  for (let len = 1; len <= Math.min(max, Math.floor(n / 24)); len++) {
    let sum = 0
    let cols = 0
    for (let k = 0; k < len; k++) {
      const freq = new Uint32Array(256)
      let count = 0
      for (let i = k; i < n; i += len) { freq[data[i]]++; count++ }
      if (count < 20) continue
      let coincid = 0
      for (let b = 0; b < 256; b++) coincid += freq[b] * (freq[b] - 1)
      sum += coincid / (count * (count - 1))
      cols++
    }
    if (cols) scored.push({ len, ic: sum / cols })
  }
  scored.sort((a, b) => b.ic - a.ic)
  // A true length of 17 also scores at 34 and 51; keep the shortest of each
  // family, since it gives every key byte the most evidence.
  const out: number[] = []
  for (const s of scored.slice(0, 40)) {
    if (out.some((l) => s.len % l === 0)) continue
    out.push(s.len)
    if (out.length >= 6) break
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
      // Judge on long runs only, against what noise would give at this size.
      if (s.longRuns >= 20 && s.longRuns > Math.max(4, s.expected * 20)) {
        results.push({
          keyLength: len, dataOffset, keyHex: key.subarray(0, 32).toString('hex'),
          samplesPerByte: Math.floor(data.length / len), ...s,
        })
      }
    }
  }
  results.sort((a, b) => b.known.length - a.known.length || b.longRuns - a.longRuns)

  // Reduce to the true period. A key of 221 decrypts the same text as its
  // factor 17, but derives each byte from a thirteenth of the evidence, which
  // is where stray wrong characters come from. Test each divisor properly
  // rather than inspecting the key for repetition — that shortcut silently
  // produced worse keys when it was tried.
  const top = results[0]
  if (top) {
    const data = buf.subarray(top.dataOffset)
    // Divisors from the largest down, so `part` ascends and the first that
    // holds up is the shortest period.
    for (let d = top.keyLength; d >= 2; d--) {
      if (top.keyLength % d) continue
      const part = top.keyLength / d
      if (part < 2) continue
      const key = deriveKey(data, part)
      const n = Math.min(data.length, 128 * 1024)
      const out = Buffer.allocUnsafe(n)
      for (let i = 0; i < n; i++) out[i] = data[i] ^ key[i % part]
      const s2 = scoreText(out)
      // Within a margin, not above it. A longer key has more free bytes and can
      // fit noise into looking like text, so the raw score climbs with length —
      // picking the maximum always lands on a multiple of the real period.
      if (s2.longRuns >= top.longRuns * 0.95) {
        results[0] = {
          keyLength: part, dataOffset: top.dataOffset,
          keyHex: key.subarray(0, 32).toString('hex'),
          samplesPerByte: Math.floor(data.length / part), ...s2,
        }
        break   // divisors ascend, so the first that holds up is the smallest
      }
    }
  }

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

// ── asset names ───────────────────────────────────────────────────────────────

export interface ArtFind {
  file: string
  bytes: number
  solved: boolean
  keyLength: number
  totalStrings: number
  /** Names that look like art: logos, portraits, heads, crests. */
  art: string[]
  /** Everything, capped, so the naming scheme is visible even when nothing matches. */
  sample: string[]
}

/** What an art asset tends to be called, across the games that use this engine. */
const ART = /logo|crest|helmet|uniform|portrait|headshot|face|head_|_head|cranium|team_|_team|coach|roster|player_|_logo/i

function stringsIn(buf: Buffer, min = 5): string[] {
  const out: string[] = []
  let run = 0
  let start = 0
  for (let i = 0; i <= buf.length; i++) {
    const c = i < buf.length ? buf[i] : 0
    const ok = c >= 32 && c < 127
    if (ok) { if (run === 0) start = i; run++ } else {
      if (run >= min) out.push(buf.subarray(start, i).toString('latin1'))
      run = 0
    }
  }
  return out
}

/**
 * Unscrambles the bundle tables and reports what the assets inside are called.
 *
 * The tables name everything; once they are readable, finding a particular logo
 * is a lookup rather than a hunt. This gathers the names so the naming scheme
 * can be seen before anything is built on it.
 */
export function findArtNames(root: string, files: string[], cap = 24): ArtFind[] {
  const out: ArtFind[] = []
  for (const rel of files.slice(0, cap)) {
    const full = join(root, rel)
    let buf: Buffer
    try {
      const size = statSync(full).size
      const fd = openSync(full, 'r')
      buf = Buffer.alloc(Math.min(size, 24 * 1024 * 1024))
      readSync(fd, buf, 0, buf.length, 0)
      closeSync(fd)
    } catch { continue }

    const d = deobfuscate(buf)
    const plain = d.best ? unscramble(buf, d.best) : buf
    const all = stringsIn(plain)
    const art = all.filter((s) => ART.test(s))
    // Deduplicate, keeping the order they appear in.
    const seen = new Set<string>()
    const uniqArt: string[] = []
    for (const a of art) { if (!seen.has(a)) { seen.add(a); uniqArt.push(a) } }
    out.push({
      file: rel,
      bytes: buf.length,
      solved: !!d.best,
      keyLength: d.best?.keyLength ?? 0,
      totalStrings: all.length,
      art: uniqArt.slice(0, 40),
      sample: all.slice(0, 30),
    })
  }
  return out
}

/** Every .toc under the install, biggest first — the bundle tables. */
export function listTocs(root: string, limit = 200): string[] {
  const found: { rel: string; bytes: number }[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > 8 || found.length > 2000) return
    let entries: import('node:fs').Dirent[]
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) { walk(full, depth + 1); continue }
      if (!e.isFile() || !e.name.toLowerCase().endsWith('.toc')) continue
      try { found.push({ rel: relative(root, full), bytes: statSync(full).size }) } catch { /* gone */ }
    }
  }
  walk(root, 0)
  return found.sort((a, b) => b.bytes - a.bytes).slice(0, limit).map((f) => f.rel)
}
