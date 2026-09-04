import { createHash } from 'node:crypto'
import { inflateSync, inflateRawSync, gunzipSync } from 'node:zlib'
import * as zlib from 'node:zlib'

// Node gained zstd in 22.15 but the bundled type definitions lag behind it, so
// the function is reached through a narrow local signature.
const zstdDecompressSync = (zlib as unknown as {
  zstdDecompressSync(buf: Buffer, opts?: { dictionary?: Buffer }): Buffer
}).zstdDecompressSync
import { statSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

/**
 * First-pass analysis of a dynasty save file.
 *
 * The EA College Football save is an undocumented binary format, and this is
 * where reverse-engineering it starts: what container is it, which regions are
 * compressed, and what readable structure survives. It runs on the user's own
 * machine so the file itself never has to leave it — the report is what gets
 * shared.
 */

export interface SaveRegion {
  offset: number
  method: 'zlib' | 'raw-deflate' | 'gzip'
  compressedBytes: number
  inflatedBytes: number
  /** Printable text found near the start of the inflated block. */
  preview: string
}

/** Header of a Frostbite FBCHUNKS save, as used by College Football. */
export interface FrostbiteHeader {
  version: number
  dataOffset: number
  payloadBytes: number
  build: string
  saved: string
  /** Magic of the decompressed payload, e.g. "FrTk". */
  innerMagic: string
  inflatedBytes: number
}

export interface SaveReport {
  frostbite?: FrostbiteHeader
  /** Dictionary-compressed zstd frames inside the payload. */
  zstd?: { frames: number; dictionaryId: string; dictionaryInSave: boolean; meanContentBytes: number }
  name: string
  bytes: number
  sha256: string
  /** First 64 bytes, which usually carry the container magic. */
  headHex: string
  headAscii: string
  container: string
  /** 0–8 bits per byte. Above ~7.5 means compressed or encrypted. */
  entropy: number
  entropyProfile: { offset: number; entropy: number }[]
  compressedRegions: SaveRegion[]
  totalInflatedBytes: number
  strings: { text: string; count: number }[]
  utf16Strings: string[]
  notes: string[]
}

function shannon(buf: Buffer): number {
  if (buf.length === 0) return 0
  const freq = new Array<number>(256).fill(0)
  for (const b of buf) freq[b]++
  let h = 0
  for (const f of freq) {
    if (!f) continue
    const p = f / buf.length
    h -= p * Math.log2(p)
  }
  return h
}

function sniffContainer(head: Buffer): { container: string; notes: string[] } {
  const notes: string[] = []
  const u32 = head.readUInt32BE(0)
  const magics: [string, (b: Buffer) => boolean][] = [
    ['ZIP archive', (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))],
    ['gzip', (b) => b[0] === 0x1f && b[1] === 0x8b],
    ['zlib stream', (b) => b[0] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(b[1])],
    ['LZ4 frame', (b) => b.readUInt32LE(0) === 0x184d2204],
    ['Zstandard', (b) => b.readUInt32LE(0) === 0xfd2fb528],
    ['bzip2', (b) => b.subarray(0, 3).toString('latin1') === 'BZh'],
    ['7-zip', (b) => b.subarray(0, 2).toString('latin1') === '7z'],
    ['SQLite database', (b) => b.subarray(0, 15).toString('latin1') === 'SQLite format 3'],
    ['Frostbite FBCHUNKS', (b) => b.subarray(0, 8).toString('latin1') === 'FBCHUNKS'],
    ['EA DBF-style', (b) => b.subarray(0, 3).toString('latin1') === 'DBF'],
  ]
  for (const [name, test] of magics) {
    try {
      if (test(head)) return { container: name, notes }
    } catch {
      /* head too short for this test */
    }
  }
  notes.push(
    `No known container magic. First four bytes are 0x${u32.toString(16).padStart(8, '0')} ` +
      `(${head.readUInt32LE(0)} as little-endian, which is often a length or version field).`,
  )
  return { container: 'unrecognised', notes }
}

/**
 * Scans for embedded deflate streams. Game saves very often wrap several
 * independently compressed blocks, and finding them is usually the step that
 * turns an opaque file into readable structure.
 */
function findCompressedRegions(buf: Buffer, limit = 40): SaveRegion[] {
  const found: SaveRegion[] = []
  const printable = (b: Buffer) =>
    b
      .subarray(0, 160)
      .toString('latin1')
      .replace(/[^\x20-\x7e]/g, '·')

  for (let i = 0; i + 2 < buf.length && found.length < limit; i++) {
    const a = buf[i]
    const b = buf[i + 1]

    const isZlib = a === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(b) && ((a << 8) + b) % 31 === 0
    const isGzip = a === 0x1f && b === 0x8b

    if (!isZlib && !isGzip) continue
    const slice = buf.subarray(i)
    try {
      const out = isGzip ? gunzipSync(slice) : inflateSync(slice)
      if (out.length < 64) continue
      found.push({
        offset: i,
        method: isGzip ? 'gzip' : 'zlib',
        compressedBytes: slice.length,
        inflatedBytes: out.length,
        preview: printable(out),
      })
      // Skip past what we just decoded rather than rescanning inside it.
      i += 1024
    } catch {
      /* not a real stream at this offset */
    }
  }

  // Raw deflate has no header, so only try it when nothing else turned up.
  if (found.length === 0) {
    for (let i = 0; i < Math.min(buf.length, 1 << 20); i += 512) {
      try {
        const out = inflateRawSync(buf.subarray(i))
        if (out.length > 4096) {
          found.push({
            offset: i,
            method: 'raw-deflate',
            compressedBytes: buf.length - i,
            inflatedBytes: out.length,
            preview: printable(out),
          })
          break
        }
      } catch {
        /* keep looking */
      }
    }
  }
  return found
}

function extractStrings(buf: Buffer, min = 5, cap = 120): { text: string; count: number }[] {
  const counts = new Map<string, number>()
  let cur: number[] = []
  const flush = () => {
    if (cur.length >= min) {
      const s = Buffer.from(cur).toString('latin1')
      if (/[A-Za-z]{3}/.test(s)) counts.set(s, (counts.get(s) ?? 0) + 1)
    }
    cur = []
  }
  for (const b of buf) {
    if (b >= 0x20 && b <= 0x7e) cur.push(b)
    else flush()
  }
  flush()
  return [...counts.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count || b.text.length - a.text.length)
    .slice(0, cap)
}

function extractUtf16(buf: Buffer, min = 5, cap = 60): string[] {
  const out: string[] = []
  let cur: string[] = []
  for (let i = 0; i + 1 < buf.length; i += 2) {
    const lo = buf[i]
    const hi = buf[i + 1]
    if (hi === 0 && lo >= 0x20 && lo <= 0x7e) cur.push(String.fromCharCode(lo))
    else {
      if (cur.length >= min) out.push(cur.join(''))
      cur = []
      if (out.length >= cap) break
    }
  }
  return [...new Set(out)].slice(0, cap)
}

/**
 * FBCHUNKS is the container College Football saves use: a fixed header naming
 * the game build and save time, then a chunk record, then one zlib stream whose
 * payload is Frostbite's own "FrTk" format. The rest of the file is zero padding.
 */
function readFrostbite(buf: Buffer): { header: FrostbiteHeader; payload: Buffer } | null {
  if (buf.subarray(0, 8).toString('latin1') !== 'FBCHUNKS') return null
  try {
    const dataOffset = buf.readUInt32LE(10)
    const payloadBytes = buf.readUInt32LE(14)
    const [y, mo, d, h, mi, sec] = [22, 24, 26, 28, 30, 32].map((o) => buf.readUInt16LE(o))
    const build = buf.subarray(34, 58).toString('latin1').replace(/\0+$/, '')

    // The chunk record sits at dataOffset; its length field is followed by the
    // stream itself, which starts at the first zlib header after it.
    let streamAt = -1
    for (let i = dataOffset; i < Math.min(dataOffset + 256, buf.length - 1); i++) {
      if (buf[i] === 0x78 && ((buf[i] << 8) + buf[i + 1]) % 31 === 0) { streamAt = i; break }
    }
    if (streamAt < 0) return null

    const payload = inflateSync(buf.subarray(streamAt))
    return {
      header: {
        version: buf.readUInt16LE(8),
        dataOffset,
        payloadBytes,
        build,
        saved: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')} ` +
          `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(sec).padStart(2, '0')}`,
        innerMagic: payload.subarray(0, 4).toString('latin1'),
        inflatedBytes: payload.length,
      },
      payload,
    }
  } catch {
    return null
  }
}

/** The decompressed FrTk payload of a save, or null if it is not one. */
export function readSavePayload(path: string): Buffer | null {
  return readFrostbite(readFileSync(path))?.payload ?? null
}

export function analyzeSave(path: string): SaveReport {
  const bytes = statSync(path).size
  const buf = readFileSync(path)
  const head = buf.subarray(0, 64)
  const { container, notes } = sniffContainer(head)
  const frostbite = readFrostbite(buf)

  // Entropy per block shows where compressed or encrypted regions sit.
  const blocks = Math.min(64, Math.max(1, Math.ceil(buf.length / (256 * 1024))))
  const blockSize = Math.ceil(buf.length / blocks)
  const entropyProfile = Array.from({ length: blocks }, (_, i) => ({
    offset: i * blockSize,
    entropy: Number(shannon(buf.subarray(i * blockSize, (i + 1) * blockSize)).toFixed(2)),
  }))

  // When the container is understood there is no need to go hunting for
  // streams; the header says exactly where the payload is.
  const regions = frostbite
    ? [{
        offset: frostbite.header.dataOffset,
        method: 'zlib' as const,
        compressedBytes: frostbite.header.payloadBytes,
        inflatedBytes: frostbite.header.inflatedBytes,
        preview: frostbite.payload.subarray(0, 160).toString('latin1').replace(/[^\x20-\x7e]/g, '·'),
      }]
    : findCompressedRegions(buf)
  const inflated = frostbite ? frostbite.payload : regions.length
    ? Buffer.concat(
        regions.slice(0, 8).map((r) => {
          try {
            const s = buf.subarray(r.offset)
            return r.method === 'gzip' ? gunzipSync(s) : inflateSync(s)
          } catch {
            return Buffer.alloc(0)
          }
        }),
      )
    : Buffer.alloc(0)

  // Strings are far more informative after inflation than before.
  const textSource = inflated.length > 0 ? inflated : buf
  const entropy = Number(shannon(buf).toFixed(3))

  if (frostbite) {
    notes.push(
      `Frostbite save from build ${frostbite.header.build}, written ${frostbite.header.saved}. ` +
        `The payload is ${frostbite.header.innerMagic} and inflates to ` +
        `${frostbite.header.inflatedBytes.toLocaleString()} bytes — it is compressed, not encrypted.`,
    )
  }
  if (entropy > 7.9 && regions.length === 0) {
    notes.push(
      'Entropy is very high with no decodable deflate streams, which points at ' +
        'encryption or an unknown compression scheme rather than plain zlib.',
    )
  }
  if (regions.length > 0) {
    notes.push(
      `${regions.length} deflate stream(s) decoded — the readable structure is inside these, ` +
        'not in the outer file.',
    )
  }

  // The object data sits in dictionary-compressed zstd frames; count them and
  // read the dictionary id they all point at.
  let zstd: SaveReport['zstd']
  if (inflated.length > 0) {
    const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
    let i = 0, frames = 0, sized = 0, sizeSum = 0, dictId = 0
    while ((i = inflated.indexOf(magic, i)) !== -1) {
      const fhd = inflated[i + 4]
      const didLen = [0, 1, 2, 4][fhd & 3]
      const fcsLen = [(fhd >> 5) & 1 ? 1 : 0, 2, 4, 8][(fhd >> 6) & 3]
      if (didLen && i + 5 + didLen <= inflated.length) {
        dictId = didLen === 4 ? inflated.readUInt32LE(i + 5)
          : didLen === 2 ? inflated.readUInt16LE(i + 5) : inflated[i + 5]
      }
      if (fcsLen && i + 5 + didLen + fcsLen <= inflated.length) {
        sizeSum += fcsLen === 1 ? inflated[i + 5 + didLen] : inflated.readUInt16LE(i + 5 + didLen)
        sized++
      }
      frames++
      i += 4
    }
    if (frames > 0) {
      zstd = {
        frames,
        dictionaryId: `0x${(dictId >>> 0).toString(16)}`,
        dictionaryInSave: inflated.includes(Buffer.from([0x37, 0xa4, 0x30, 0xec])),
        meanContentBytes: sized ? Math.round(sizeSum / sized) : 0,
      }
      notes.push(
        `${frames.toLocaleString()} zstd frames, all using dictionary ` +
          `0x${(dictId >>> 0).toString(16)}. That dictionary is ` +
          `${zstd.dictionaryInSave ? 'in the save' : 'NOT in the save — it must come from the game install'}, ` +
          'and without it these frames cannot be decompressed.',
      )
    }
  }

  return {
    frostbite: frostbite?.header,
    zstd,
    name: basename(path),
    bytes,
    sha256: createHash('sha256').update(buf).digest('hex'),
    headHex: head.toString('hex').replace(/(.{2})/g, '$1 ').trim(),
    headAscii: head.toString('latin1').replace(/[^\x20-\x7e]/g, '·'),
    container,
    entropy,
    entropyProfile,
    compressedRegions: regions,
    totalInflatedBytes: regions.reduce((s, r) => s + r.inflatedBytes, 0),
    strings: extractStrings(textSource),
    utf16Strings: extractUtf16(textSource),
    notes,
  }
}


// ── comparing two saves ───────────────────────────────────────────────────────

export interface SaveDiffRun {
  offset: number
  length: number
  a: string
  b: string
  /** Bits that changed in the first differing byte, high bit first. */
  bits: string
}

export interface SaveDiff {
  aName: string
  bName: string
  aInflated: number
  bInflated: number
  sameLength: boolean
  differingBytes: number
  runs: SaveDiffRun[]
  notes: string[]
}

/**
 * Diffs the decompressed payloads of two saves.
 *
 * Member names are hashed rather than stored, so the way to find out which
 * bytes hold which value is to change exactly one thing in-game and see what
 * moves. The payload is otherwise deterministic — two saves taken a minute
 * apart with one redshirt toggled differ by a single byte — which makes this
 * precise rather than approximate.
 */
export function diffSaves(pathA: string, pathB: string): SaveDiff {
  const a = readFrostbite(readFileSync(pathA))
  const b = readFrostbite(readFileSync(pathB))
  if (!a || !b) throw new Error('Both files must be FBCHUNKS saves')

  const A = a.payload
  const B = b.payload
  const n = Math.min(A.length, B.length)
  const notes: string[] = []
  if (A.length !== B.length) {
    notes.push(
      `Payloads differ in length by ${Math.abs(B.length - A.length)} bytes, so offsets past ` +
        'the first insertion will not line up. A pair taken minutes apart usually matches exactly.',
    )
  }

  const runs: SaveDiffRun[] = []
  let differing = 0
  let start = -1
  let last = -1
  const push = (from: number, to: number) => {
    const len = to - from + 1
    const changed = A[from] ^ B[from]
    runs.push({
      offset: from,
      length: len,
      a: A.subarray(from, Math.min(from + 24, to + 1)).toString('hex'),
      b: B.subarray(from, Math.min(from + 24, to + 1)).toString('hex'),
      bits: changed.toString(2).padStart(8, '0'),
    })
  }
  for (let i = 0; i < n; i++) {
    if (A[i] === B[i]) continue
    differing++
    // Bytes within 16 of each other are treated as one change.
    if (start >= 0 && i - last <= 16) { last = i; continue }
    if (start >= 0) push(start, last)
    start = i
    last = i
  }
  if (start >= 0) push(start, last)

  if (differing === 1) {
    notes.push(
      'Exactly one byte changed, so that byte is the field you edited. The bit column ' +
        'shows which bit moved — several booleans usually share a byte.',
    )
  } else if (differing === 0) {
    notes.push('The payloads are identical — nothing was saved between these two files.')
  }

  return {
    aName: basename(pathA),
    bName: basename(pathB),
    aInflated: A.length,
    bInflated: B.length,
    sameLength: A.length === B.length,
    differingBytes: differing,
    runs: runs.slice(0, 400),
    notes,
  }
}

// ── finding the compression dictionary ────────────────────────────────────────

export interface DictHit {
  file: string
  offset: number
  dictionaryId: string
  /** True when this is the dictionary the save's frames were built against. */
  matches: boolean
  /** True when a real frame from the save actually decompressed with it. */
  verified: boolean
  lengthBytes?: number
  sampleText?: string
  /** Best dictionary lengths found, most plausible first. */
  candidates?: DictCandidate[]
  reason: string
}

export interface DictScan {
  root: string
  filesScanned: number
  bytesScanned: number
  dictionariesSeen: number
  hits: DictHit[]
  notes: string[]
}

/** zstd dictionary magic, little-endian 0xEC30A437. */
const ZSTD_DICT_MAGIC = Buffer.from([0x37, 0xa4, 0x30, 0xec])
const ZSTD_FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** Pulls several small frames out of a save, to test candidate dictionaries. */
export function sampleFrames(payload: Buffer, count = 6): Buffer[] {
  const frames: Buffer[] = []
  let at = payload.indexOf(ZSTD_FRAME_MAGIC)
  // Spread the samples across the payload rather than taking six neighbours.
  const stride = Math.max(1, Math.floor(payload.length / (count * 8)))
  let from = at
  while (frames.length < count && from >= 0 && from < payload.length) {
    at = payload.indexOf(ZSTD_FRAME_MAGIC, from)
    if (at < 0) break
    const next = payload.indexOf(ZSTD_FRAME_MAGIC, at + 4)
    const end = next > at ? next : Math.min(at + 2048, payload.length)
    if (end - at > 16) frames.push(payload.subarray(at, end))
    from = at + stride
  }
  return frames
}

/**
 * How much a decoded block looks like game data rather than noise.
 *
 * Structured records are mostly small integers, zero padding and readable text;
 * a wrong dictionary window decodes to something close to random. Scoring this
 * is what separates a correct dictionary length from the many that merely fail
 * to throw — zstd emits the declared number of bytes either way, so neither
 * "it did not throw" nor "the length is right" tells you anything.
 */
function plausibility(buf: Buffer): number {
  if (buf.length === 0) return 0
  let friendly = 0
  const freq = new Uint32Array(256)
  for (const b of buf) {
    freq[b]++
    if (b === 0 || (b >= 0x20 && b <= 0x7e)) friendly++
  }
  let h = 0
  for (const f of freq) {
    if (!f) continue
    const p = f / buf.length
    h -= p * Math.log2(p)
  }
  // Both terms sit in 0..1; random data scores near 0.35, structured near 0.9.
  return 0.5 * (friendly / buf.length) + 0.5 * (1 - h / 8)
}

export interface DictCandidate {
  length: number
  score: number
  preview: string
}

/**
 * Finds how many bytes of a candidate dictionary to use.
 *
 * A dictionary's content is the tail of its buffer, so the exact end matters,
 * and the format does not record it. A coarse sweep locates the neighbourhood
 * and a byte-wise pass refines it, each length scored by how plausible the
 * frames it decodes look.
 */
function verifyDictionary(buf: Buffer, offset: number, frames: Buffer[]): DictCandidate[] {
  if (frames.length === 0) return []
  const maxLen = Math.min(buf.length - offset, 4 * 1024 * 1024)
  const scoreAt = (len: number, using: Buffer[]) => {
    let total = 0
    for (const f of using) {
      let out: Buffer
      try {
        out = zstdDecompressSync(f, { dictionary: buf.subarray(offset, offset + len) })
      } catch {
        return -1
      }
      total += plausibility(out)
    }
    return total / using.length
  }

  const coarse = frames.slice(0, 2)
  const seen: { length: number; score: number }[] = []
  for (let len = 512; len <= maxLen; len += 4) {
    const v = scoreAt(len, coarse)
    if (v > 0.6) seen.push({ length: len, score: v })
  }
  if (seen.length === 0) return []

  seen.sort((a, b) => b.score - a.score)
  const out: DictCandidate[] = []
  const tried = new Set<number>()
  for (const c of seen.slice(0, 12)) {
    for (let len = c.length - 8; len <= c.length + 8; len++) {
      if (len < 1 || len > maxLen || tried.has(len)) continue
      tried.add(len)
      const v = scoreAt(len, frames)
      if (v > 0.6) {
        let preview = ''
        try {
          preview = zstdDecompressSync(frames[0], { dictionary: buf.subarray(offset, offset + len) })
            .subarray(0, 180).toString('latin1').replace(/[^\x20-\x7e]/g, '.')
        } catch { /* scored above, so this should not happen */ }
        out.push({ length: len, score: Number(v.toFixed(4)), preview })
      }
    }
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, 5)
}

/**
 * Hunts the game install for the zstd dictionary the save's frames need.
 *
 * Every frame declares the same dictionary id and the dictionary is not in the
 * save, so without it those frames cannot be read. Files can hold more than one
 * dictionary — the game executable does — so every occurrence is checked, not
 * just the first.
 */
export function findDictionary(
  root: string,
  dictionaryId: number,
  frames: Buffer[],
  budgetBytes = 12 * 1024 ** 3,
): DictScan {
  const idLE = Buffer.alloc(4)
  idLE.writeUInt32LE(dictionaryId >>> 0)

  const hits: DictHit[] = []
  const notes: string[] = []
  let filesScanned = 0
  let bytesScanned = 0
  let dictionariesSeen = 0

  const walk = (dir: string, depth: number) => {
    if (depth > 10 || bytesScanned > budgetBytes) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (bytesScanned > budgetBytes) return
      const full = join(dir, e.name)
      if (e.isDirectory()) { walk(full, depth + 1); continue }
      if (!e.isFile()) continue

      let size = 0
      try { size = statSync(full).size } catch { continue }
      if (size === 0 || size > 3 * 1024 ** 3) continue

      let buf: Buffer
      try { buf = readFileSync(full) } catch { continue }
      filesScanned++
      bytesScanned += buf.length

      // Every dictionary in the file, not merely the first.
      let at = 0
      let perFile = 0
      while ((at = buf.indexOf(ZSTD_DICT_MAGIC, at)) !== -1 && perFile < 500) {
        perFile++
        dictionariesSeen++
        const id = at + 8 <= buf.length ? buf.readUInt32LE(at + 4) : 0
        const matches = (id >>> 0) === (dictionaryId >>> 0)
        if (matches) {
          const cands = verifyDictionary(buf, at, frames)
          const best = cands[0]
          hits.push({
            file: full,
            offset: at,
            dictionaryId: `0x${(id >>> 0).toString(16)}`,
            matches: true,
            verified: !!best,
            lengthBytes: best?.length,
            sampleText: best?.preview,
            candidates: cands,
            reason: best
              ? `the dictionary the save uses — ${best.length.toLocaleString()} bytes, ` +
                `frames decode to plausible data (score ${best.score})`
              : 'the dictionary id matches, but no length decoded frames to anything plausible',
          })
        } else if (hits.length < 40) {
          hits.push({
            file: full,
            offset: at,
            dictionaryId: `0x${(id >>> 0).toString(16)}`,
            matches: false,
            verified: false,
            reason: 'a zstd dictionary, but not the one this save uses',
          })
        }
        at += 4
      }

      if (perFile === 0 && buf.includes(idLE)) {
        hits.push({
          file: full,
          offset: buf.indexOf(idLE),
          dictionaryId: `0x${(dictionaryId >>> 0).toString(16)}`,
          matches: false,
          verified: false,
          reason: 'mentions the dictionary id but holds no dictionary — may embed one compressed',
        })
      }
    }
  }

  walk(root, 0)

  const verified = hits.filter((h) => h.verified)
  const matching = hits.filter((h) => h.matches)
  if (verified.length) {
    notes.push(`Found and verified the dictionary — frames from the save decompress with it.`)
  } else if (matching.length) {
    notes.push(
      'A dictionary with the right id is present, but no frame decoded against it. It is ' +
        'probably stored compressed or split, so the bytes at that offset are not the whole thing.',
    )
  } else {
    notes.push(
      `Scanned ${dictionariesSeen} zstd dictionaries, none with id ` +
        `0x${(dictionaryId >>> 0).toString(16)}. It is likely packed inside a game archive ` +
        'that has to be unpacked first.',
    )
  }
  hits.sort((a, b) => Number(b.verified) - Number(a.verified) || Number(b.matches) - Number(a.matches))
  return { root, filesScanned, bytesScanned, dictionariesSeen, hits: hits.slice(0, 80), notes }
}
