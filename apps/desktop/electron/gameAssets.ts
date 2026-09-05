import { readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import type { Dirent } from 'node:fs'
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
  /** The whole key, hex, when it was read from the file rather than derived. */
  fullKeyHex?: string
  /** How the key was obtained: read from the header, or recovered by search. */
  how: 'header' | 'search'
  /** Constant folded back into the key so padding decodes to zero. */
  mask?: number
  /** Share of the decode that is 0x00 — padding, and the sign of a real one. */
  zeros?: number
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
  let zero = 0
  for (let i = 0; i < buf.length; i++) if (buf[i] === 0) zero++
  const text = buf.toString('latin1')
  return {
    strings, longRuns, zeros: buf.length ? zero / buf.length : 0,
    known: TOC_WORDS.filter((w) => text.includes(w)), sample,
    expected: Math.round(buf.length * NOISE_RATE),
  }
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
function keyLengths(data: Buffer, max = 512): number[] {
  // Index of coincidence, not byte agreement at a lag.
  //
  // Comparing data[i] with data[i+L] only works when the plaintext itself
  // repeats at that lag, which is a property of the plaintext rather than the
  // key — it happened to hold for one table and failed for others. Splitting
  // into L columns is the right test: at the true length each column is the
  // plaintext XOR one constant, so it keeps the plaintext's lopsided byte
  // distribution; at any other length the columns are mixtures and flatten out
  // towards uniform.
  const n = Math.min(data.length, 32 * 1024)
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
      // 192 samples is ample to tell the right key byte from 255 wrong ones,
      // and this loop runs 256 times per key position — at 4096 it was three
      // billion operations a file, which froze the window for minutes.
      for (let i = k; i < data.length && n < 192; i += len, n++) {
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

/**
 * Frostbite writes the key into the obfuscation header: 257 bytes at 0x128,
 * each masked with 0x7B, with the payload starting at 0x22C. Reading it is
 * exact and instant, so it is tried before any cryptanalysis. The search that
 * follows only exists for files that do not follow this layout — and it is a
 * search, so it can fit a wrong key to the data, which is what made the same
 * table report a 17-byte key one run and a 13-byte key the next.
 */
export const HEADER_KEY_AT = 0x128
export const HEADER_KEY_LEN = 257
export const HEADER_DATA_AT = 0x22c

/**
 * A key that is right except for a constant is still wrong, and it does not
 * look wrong: XOR by a constant only shifts the histogram, so the output keeps
 * every run and every repetition the real plaintext has. That is exactly what
 * shipping a fixed 0x7B mask produced — runs of "{{{y{" that were always runs
 * of zeros, and "HIJHHNLCCLIO" that was always "321335788724".
 *
 * These tables are padded with zeros, so the most frequent byte in a correct
 * decode is 0x00. Folding the most frequent byte back into the key removes the
 * offset without having to know what it should have been. The search path got
 * this for free — it scores candidate key bytes by how many zeros they produce
 * — which is why it read layout.toc correctly while the "exact" header key did
 * not.
 */
export function calibrate(out: Buffer): number {
  const freq = new Uint32Array(256)
  for (let i = 0; i < out.length; i++) freq[out[i]]++
  let m = 0
  for (let b = 1; b < 256; b++) if (freq[b] > freq[m]) m = b
  return m
}

export function headerKeyScheme(buf: Buffer): Solved | null {
  if (buf.length < HEADER_DATA_AT + 4096) return null
  const key = Buffer.allocUnsafe(HEADER_KEY_LEN)
  for (let i = 0; i < HEADER_KEY_LEN; i++) key[i] = buf[HEADER_KEY_AT + i]
  const data = buf.subarray(HEADER_DATA_AT)
  const n = Math.min(data.length, 48 * 1024)
  const out = Buffer.allocUnsafe(n)
  for (let i = 0; i < n; i++) out[i] = data[i] ^ key[i % HEADER_KEY_LEN]
  const mask = calibrate(out)
  if (mask) {
    for (let i = 0; i < HEADER_KEY_LEN; i++) key[i] ^= mask
    for (let i = 0; i < n; i++) out[i] ^= mask
  }
  const s = scoreText(out)
  // The same bar the search has to clear, so a header that is not really a key
  // is rejected rather than trusted for being in the right place.
  if (!(s.longRuns >= 20 && s.longRuns > Math.max(4, s.expected * 20))) return null
  return {
    keyLength: HEADER_KEY_LEN, dataOffset: HEADER_DATA_AT,
    keyHex: key.subarray(0, 32).toString('hex'), fullKeyHex: key.toString('hex'),
    samplesPerByte: Math.floor(data.length / HEADER_KEY_LEN), how: 'header', mask, ...s,
  }
}

export function deobfuscate(buf: Buffer): { obfuscated: boolean; best: Solved | null; tried: number; runners: Solved[] } {
  if (buf.length < 4096) return { obfuscated: false, best: null, tried: 0, runners: [] }
  const magic = buf.readUInt32BE(0)
  if (!OBFUSCATION_MAGIC.includes(magic)) return { obfuscated: false, best: null, tried: 0, runners: [] }

  // Read the header key first, but do not stop there. It is cheap and usually
  // right, and when it is wrong it is wrong convincingly — it cleared the old
  // acceptance bar on layout.toc with 240 long runs and produced nothing but
  // noise. So it competes with the search on the same score instead of
  // pre-empting it.
  const results: Solved[] = []
  let tried = 0
  const fromHeader = headerKeyScheme(buf)
  if (fromHeader) {
    tried++
    results.push(fromHeader)
    // Padding decodes to zero when the key is right. Well above what a wrong
    // key gives means there is nothing for the search to improve on, and the
    // search is what costs seconds.
    if ((fromHeader.zeros ?? 0) >= 0.08) return { obfuscated: true, best: fromHeader, tried, runners: [] }
  }
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
      const n = Math.min(data.length, 48 * 1024)
      const out = Buffer.allocUnsafe(n)
      for (let i = 0; i < n; i++) out[i] = data[i] ^ key[i % len]
      const s = scoreText(out)
      // Judge on long runs only, against what noise would give at this size.
      if (s.longRuns >= 20 && s.longRuns > Math.max(4, s.expected * 20)) {
        results.push({
          keyLength: len, dataOffset, keyHex: key.subarray(0, 32).toString('hex'),
          samplesPerByte: Math.floor(data.length / len), how: 'search', ...s,
        })
      }
    }
  }
  results.sort((a, b) =>
    b.known.length - a.known.length ||
    (b.zeros ?? 0) - (a.zeros ?? 0) ||
    b.longRuns - a.longRuns)

  // Reduce to the true period. A key of 221 decrypts the same text as its
  // factor 17, but derives each byte from a thirteenth of the evidence, which
  // is where stray wrong characters come from. Test each divisor properly
  // rather than inspecting the key for repetition — that shortcut silently
  // produced worse keys when it was tried.
  const top = results[0]
  if (top && top.how === 'search') {
    const data = buf.subarray(top.dataOffset)
    // Divisors from the largest down, so `part` ascends and the first that
    // holds up is the shortest period.
    for (let d = top.keyLength; d >= 2; d--) {
      if (top.keyLength % d) continue
      const part = top.keyLength / d
      if (part < 2) continue
      const key = deriveKey(data, part)
      const n = Math.min(data.length, 48 * 1024)
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
          samplesPerByte: Math.floor(data.length / part), how: 'search', ...s2,
        }
        break   // divisors ascend, so the first that holds up is the smallest
      }
    }
  }

  return { obfuscated: true, best: results[0] ?? null, tried, runners: results.slice(1, 4) }
}

export function unscramble(buf: Buffer, d: Solved): Buffer {
  const data = buf.subarray(d.dataOffset)
  const key = d.fullKeyHex ? Buffer.from(d.fullKeyHex, 'hex') : deriveKey(data, d.keyLength)
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
export async function readTables(root: string, files: string[]): Promise<TableReport[]> {
  const out: TableReport[] = []
  for (const rel of files) {
    await new Promise((r) => setImmediate(r))
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
        ? (d.best.how === 'header'
            ? `key read from the file header — ${d.best.keyLength} bytes at ` +
              `0x${HEADER_KEY_AT.toString(16)}, payload from 0x${d.best.dataOffset.toString(16)}` +
              `, stored under 0x${(d.best.mask ?? 0).toString(16).padStart(2, '0')}` +
              `, ${(100 * (d.best.zeros ?? 0)).toFixed(1)}% padding, ` +
              `${d.best.strings} runs, ${d.best.longRuns} of 8+ chars`
            : `recovered by search (no usable header key): repeating key of ${d.best.keyLength} bytes ` +
              `from 0x${d.best.dataOffset.toString(16)} — `) +
          (d.best.how === 'header' ? '' :
            `${d.best.strings} runs against ${d.best.expected} expected from noise, ${d.best.longRuns} of 8+ chars, ` +
            `${(100 * (d.best.zeros ?? 0)).toFixed(1)}% padding, ` +
            `${d.best.samplesPerByte} samples per key byte${d.best.samplesPerByte < 40 ? ' (thin — the key may be imperfect)' : ''}`)
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
  /** Names matching the save's own asset-id scheme. */
  playerArt?: string[]
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
/**
 * What to look for in a decoded table.
 *
 * The first group is the useful one. The save names every player's art
 * directly: real players as `Unique_AdamsAmare_1`, generated players — which
 * is what recruits are — as `Generic_0877_P_T0042_H_6_3`, where the trailing
 * fields are a head index, the team the face was generated for, a skin tone of
 * D/H/T/M, and two more variants. Those exact strings are the join between a
 * player in the save and a face in the archives, so finding one in a table
 * proves the whole path rather than merely suggesting it.
 *
 * The second group is the old keyword sweep, kept because it costs nothing and
 * catches logos and coach art, which are named on a different scheme.
 */
const ART = /(?:Generic|Unique)_[A-Za-z0-9]+_|logo|crest|helmet|uniform|portrait|headshot|face|head_|_head|cranium|team_|_team|coach|roster|player_|_logo/i

/** The player-art names specifically — the ones the save can be joined to. */
export const PLAYER_ART = /(?:Generic|Unique)_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*/

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
export async function findArtNames(root: string, files: string[], cap = 24): Promise<ArtFind[]> {
  const out: ArtFind[] = []
  for (const rel of files.slice(0, cap)) {
    await new Promise((r) => setImmediate(r))
    const full = join(root, rel)
    let buf: Buffer
    try {
      const size = statSync(full).size
      const fd = openSync(full, 'r')
      buf = Buffer.alloc(Math.min(size, 4 * 1024 * 1024))
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
      // Reported separately from the keyword hits: a name matching the save's
      // own scheme is the thing that settles whether this path works, and it
      // should not be buried among the "logo"-shaped guesses.
      playerArt: uniqArt.filter((a) => PLAYER_ART.test(a)).slice(0, 20),
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

/* ------------------------------------------------------------------ faces */

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.dds', '.gif', '.bmp', '.avif'])

export interface FaceIndex {
  root: string
  files: number
  bytes: number
  byExtension: { ext: string; files: number; bytes: number }[]
  /** A handful of real filenames, so the naming scheme is visible. */
  sample: string[]
  /** stem (lowercased, no extension) -> path relative to root. */
  map: Record<string, string>
  truncated: boolean
  /**
   * Per-folder counts and a few real names from each. This is the part worth
   * exporting: the naming scheme is what makes a category of art usable, and
   * it can be read off a handful of filenames without moving a single image.
   */
  dirs: { dir: string; files: number; bytes: number; sample: string[] }[]
}

/**
 * Indexes a folder of loose image files.
 *
 * This exists because the art turned out to be reachable without decoding a
 * 50 GB archive: point DCC at a folder of extracted images and the save
 * already carries the name of each one. Only paths are held, never contents —
 * a 958 MB folder indexes to a few megabytes of strings, and an image is read
 * from disk when something actually displays it.
 */
export function indexFaces(root: string, cap = 120_000): FaceIndex {
  const byExt = new Map<string, { files: number; bytes: number }>()
  const byDir = new Map<string, { files: number; bytes: number; sample: string[] }>()
  const map: Record<string, string> = {}
  const sample: string[] = []
  let files = 0
  let bytes = 0
  let truncated = false

  const walk = (dir: string, depth: number) => {
    if (truncated || depth > 8) return
    let entries: Dirent[]
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (truncated) return
      const full = join(dir, e.name)
      if (e.isDirectory()) { walk(full, depth + 1); continue }
      const dot = e.name.lastIndexOf('.')
      const ext = dot < 0 ? '' : e.name.slice(dot).toLowerCase()
      if (!IMAGE_EXT.has(ext)) continue
      let size = 0
      try { size = statSync(full).size } catch { /* unreadable, still count it */ }
      files++
      bytes += size
      const cur = byExt.get(ext) ?? { files: 0, bytes: 0 }
      cur.files++; cur.bytes += size; byExt.set(ext, cur)
      const key = relative(root, dir) || '.'
      const d = byDir.get(key) ?? { files: 0, bytes: 0, sample: [] }
      d.files++; d.bytes += size
      if (d.sample.length < 6) d.sample.push(e.name)
      byDir.set(key, d)
      if (sample.length < 12) sample.push(relative(root, full))
      // Keyed on the asset id found inside the filename, not on the whole
      // stem. Extractors add their own prefix — the portraits in a real dump
      // are named `nilpp_Generic_0001_P_T0000_D_1_1` while the save calls the
      // same face `Generic_0001_P_T0000_D_1_1` — and requiring the names to be
      // equal would miss every one of them.
      const stem = e.name.slice(0, dot < 0 ? undefined : dot)
      const id = stem.match(PLAYER_ART)?.[0] ?? stem
      map[id.toLowerCase()] = relative(root, full)
      if (files >= cap) truncated = true
    }
  }
  walk(root, 0)

  return {
    root, files, bytes, sample, map, truncated,
    byExtension: [...byExt.entries()]
      .map(([ext, v]) => ({ ext, ...v }))
      .sort((a, b) => b.files - a.files),
    dirs: [...byDir.entries()]
      .map(([dir, v]) => ({ dir, ...v }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 60),
  }
}

/**
 * How well a folder of images lines up with the asset ids in a save.
 *
 * Reported rather than assumed. An exact stem match is the only thing counted
 * as a hit — a fuzzy match would make a folder of unrelated pictures look like
 * a success, which is the failure mode this whole area keeps producing.
 */
export interface FaceMatch {
  players: number
  matched: number
  unmatchedSample: string[]
  matchedSample: { id: string; file: string }[]
}

export function matchFaces(index: FaceIndex, assetIds: string[]): FaceMatch {
  const matchedSample: { id: string; file: string }[] = []
  const unmatchedSample: string[] = []
  let matched = 0
  for (const id of assetIds) {
    const hit = index.map[id.toLowerCase()]
    if (hit) {
      matched++
      if (matchedSample.length < 8) matchedSample.push({ id, file: hit })
    } else if (unmatchedSample.length < 8) unmatchedSample.push(id)
  }
  return { players: assetIds.length, matched, unmatchedSample, matchedSample }
}

/* ------------------------------------------------------- team art by school */

/**
 * Team art is named by school, not by an id the save carries, so it has to be
 * matched on the name. Each category writes the school differently:
 *
 *   3d_logos/png_gold/Alabama_gold          logo, gold
 *   3d_logos/PNG_OD/Alabama_OD              logo, dark
 *   3d_logos/png_OL/Alabama_OL              logo, light
 *   helmet/left/thel_lthelmets_Alabama_result
 *   coachpolos/tjer_coachpolos_Alabama_Polos_result
 *
 * so the school is pulled out per category rather than guessed at.
 */
const SCHOOL_PATTERNS: [string, RegExp][] = [
  ['logoGold', /^(.+)_gold$/i],
  ['logoDark', /^(.+)_OD$/i],
  ['logoLight', /^(.+)_OL$/i],
  ['helmet', /^thel_[lr]thelmets_(.+)_result$/i],
  ['polo', /^tjer_coachpolos_(.+?)(?:_Polos)?_result$/i],
  ['jersey', /^tjer_teamjerseys_(.+)_result$/i],
  // icons/ncaa-logos is a flat set of school marks in lowerCamelCase, and it
  // spells names out — `california`, `eastCarolina`, `connecticut` — where the
  // 3d set abbreviates. It matches the save's own names more often, so it is
  // worth carrying as its own category rather than as a duplicate.
  ['icon', /^([a-z][A-Za-z]+)$/],
]

/**
 * The save writes school names for people; the art writes them for filenames.
 * Stripping punctuation settles most of it — "Arizona State" against
 * "ArizonaState" — but not the abbreviations, which differ in both directions
 * and cannot be derived. Those are listed, and anything still unmatched is
 * reported rather than guessed at, because a logo on the wrong team is worse
 * than no logo.
 */
const SCHOOL_ALIASES: Record<string, string> = {
  appst: 'appalachianstate', ccarolina: 'coastalcarolina', cmichigan: 'centralmichigan',
  california: 'cal', emichigan: 'easternmichigan', eastcarolina: 'ecu',
  flaatlantic: 'floridaatlantic', gasouthern: 'georgiasouthern', hawaii: 'hawaii',
  jaxstate: 'jacksonvillestate', kennesawst: 'kennesawstate', miamioh: 'miamiuniversity',
  mississippist: 'mississippistate', mtsu: 'midtennstate', uconn: 'connecticut',
  wkentucky: 'westernkentucky', wmichigan: 'westernmichigan', washingtonst: 'washingtonstate',
  sandiegost: 'sandiegostate', newmexicost: 'newmexicostate', samhouston: 'samhoustonstate',
  niu: 'northernillinois', ndsu: 'northdakotastate', sacstate: 'sacramentostate',
  ulmonroe: 'louisianamonroe',
}

const normSchool = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * The art that is not a school: trophies, bowl crests, playoff marks and
 * conference championships.
 *
 * These are named for themselves rather than for a team — `trophies_Heisman`,
 * `bowl_RoseBowl`, `bowl_RoseBowlTrophy`, `playoff_Qtr_Final`,
 * `confchamp__BIG10Championship` — so there is nothing in the save to match
 * them against. They are keyed by kind and by their own name, stripped to
 * letters and digits, and a screen asks for the one it wants.
 *
 * Four prefixes, taken from the folders they sit in. Note the double underscore
 * on the conference marks: that is how the game writes them, not a typo.
 */
const NAMED_ART: [string, RegExp][] = [
  ['trophy', /^trophies_(.+)$/i],
  ['bowl', /^bowl_(.+)$/i],
  ['playoff', /^playoff_(.+)$/i],
  ['confchamp', /^confchamp_+(.+)$/i],
]

export const artKey = (kind: string, name: string) =>
  `${kind}:${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`

export function matchAwards(index: FaceIndex): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [id, file] of Object.entries(index.map)) {
    for (const [kind, re] of NAMED_ART) {
      const m = id.match(re)
      if (!m) continue
      out[artKey(kind, m[1])] = file
      break
    }
  }
  return out
}

export interface SchoolArt {
  /** category -> path relative to the art root. */
  art: Record<string, string>
  matched: string[]
  /** Schools in the save with no art at all, so the gap is visible. */
  missing: string[]
  categories: { name: string; files: number }[]
}

/**
 * Schools are matched on any name the save gives them. The save's display name
 * is what the game shows in tables — "App St.", "W. Kentucky" — while the team
 * record also carries the full name, and the art is named from the full one.
 * Trying both removes most of the aliases below; the rest are genuine
 * abbreviations that cannot be derived in either direction.
 */
export function matchSchools(
  index: FaceIndex,
  schools: (string | { name: string; fullName?: string | null })[],
): SchoolArt {
  // category -> normalised school -> file
  const bank = new Map<string, Map<string, string>>()
  for (const [id, file] of Object.entries(index.map)) {
    for (const [cat, re] of SCHOOL_PATTERNS) {
      const m = id.match(re)
      if (!m) continue
      let inner = bank.get(cat)
      if (!inner) { inner = new Map(); bank.set(cat, inner) }
      inner.set(normSchool(m[1]), file)
      break
    }
  }

  const art: Record<string, string> = {}
  const matched: string[] = []
  const missing: string[] = []
  for (const entry of schools) {
    const label = typeof entry === 'string' ? entry : entry.name
    const full = typeof entry === 'string' ? null : entry.fullName ?? null
    const keys = [normSchool(label)]
    if (full) keys.push(normSchool(full))
    for (const k of [...keys]) { const a = SCHOOL_ALIASES[k]; if (a) keys.push(a) }
    let any = false
    for (const [cat, inner] of bank) {
      let hit: string | undefined
      for (const k of keys) { hit = inner.get(k); if (hit) break }
      if (hit) { art[`${label}|${cat}`] = hit; any = true }
    }
    ;(any ? matched : missing).push(label)
  }

  return {
    art, matched, missing,
    categories: [...bank.entries()]
      .map(([name, inner]) => ({ name, files: inner.size }))
      .sort((a, b) => b.files - a.files),
  }
}
