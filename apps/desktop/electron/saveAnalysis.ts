import { createHash } from 'node:crypto'
import { inflateSync, inflateRawSync, gunzipSync } from 'node:zlib'
import * as zlib from 'node:zlib'

// Node gained zstd in 22.15 but the bundled type definitions lag behind it, so
// the function is reached through a narrow local signature.
const zstdDecompressSync = (zlib as unknown as {
  zstdDecompressSync(buf: Buffer, opts?: { dictionary?: Buffer }): Buffer
}).zstdDecompressSync

/**
 * Whether the runtime can decompress zstd at all.
 *
 * Electron 33 shipped Node 20, which has no zstd, so every dictionary check
 * threw and the failures were indistinguishable from "wrong dictionary". The
 * app now requires Electron 37 (Node 22.21), but the flag stays so a runtime
 * without zstd reports that plainly instead of blaming the dictionary.
 */
export const zstdSupported = typeof zstdDecompressSync === 'function'

const NO_ZSTD =
  'This build cannot read zstd frames. Reinstall the latest DCC — older builds shipped a runtime without zstd support.'
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
      // A statement about the file, not about whether DCC has the dictionary —
      // the dictionary panel owns that, and it used to read as a warning even
      // once the dictionary was loaded and the frames were readable.
      notes.push(
        `${frames.toLocaleString()} zstd frames, all using dictionary ` +
          `0x${(dictId >>> 0).toString(16)}, which is ` +
          `${zstd.dictionaryInSave ? 'carried in the save itself' : 'not stored in the save'}.`,
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

export interface FrameDiff {
  frameOffset: number
  differingBytes: number
  detail: { at: number; a: number; b: number }[]
}

export interface SaveDiff {
  /** Present when a dictionary was available: differences inside decoded frames. */
  frameDiffs?: FrameDiff[]
  decodedNote?: string
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
export function diffSaves(pathA: string, pathB: string, dictionary?: Buffer | null): SaveDiff {
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

  let frameDiffs: FrameDiff[] | undefined
  let decodedNote: string | undefined
  if (dictionary) {
    const da = decodeFrames(A, dictionary)
    const framesOf = (payload: Buffer) => {
      const out = new Map<number, Buffer>()
      let i = 0
      while ((i = payload.indexOf(ZSTD_FRAME_MAGIC, i)) !== -1) {
        try { out.set(i, zstdDecompressSync(payload.subarray(i), { dictionary })) } catch { /* skip */ }
        i += 4
      }
      return out
    }
    const fa = framesOf(A)
    const fb = framesOf(B)
    frameDiffs = []
    for (const [off, bufA] of fa) {
      const bufB = fb.get(off)
      if (!bufB || bufA.equals(bufB)) continue
      const detail: { at: number; a: number; b: number }[] = []
      const n = Math.min(bufA.length, bufB.length)
      for (let k = 0; k < n && detail.length < 40; k++) {
        if (bufA[k] !== bufB[k]) detail.push({ at: k, a: bufA[k], b: bufB[k] })
      }
      frameDiffs.push({ frameOffset: off, differingBytes: detail.length, detail })
    }
    decodedNote =
      `${da.frames.toLocaleString()} frames decoded (${da.bytes.toLocaleString()} bytes of object ` +
      `data); ${frameDiffs.length} frame(s) differ. Comparing decoded frames is far sharper than ` +
      'comparing the compressed payload, where recompression alone moves hundreds of bytes.'
  }

  return {
    frameDiffs,
    decodedNote,
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

  // A dedicated dictionary file is the whole file, so try that before sweeping
  // — the sweep starts partway in and steps in fours, and would walk past it.
  const whole = scoreAt(maxLen, frames)
  if (whole > 0) {
    let preview = ''
    try {
      preview = zstdDecompressSync(frames[0], { dictionary: buf.subarray(offset, offset + maxLen) })
        .subarray(0, 180).toString('latin1').replace(/[^\x20-\x7e]/g, '.')
    } catch { /* scored above */ }
    if (whole > 0.6) return [{ length: maxLen, score: Number(whole.toFixed(4)), preview }]
    seen.push({ length: maxLen, score: whole })
  }
  for (let len = 512; len <= maxLen; len += 4) {
    const v = scoreAt(len, coarse)
    if (v > 0.5) seen.push({ length: len, score: v })
  }
  if (seen.length === 0) return []

  seen.sort((a, b) => b.score - a.score)
  const out: DictCandidate[] = []
  // Anything that decoded at all is reported with its score, so a near miss is
  // visible rather than being swallowed by a threshold.
  const tried = new Set<number>()
  for (const c of seen.slice(0, 12)) {
    for (let len = c.length - 8; len <= c.length + 8; len++) {
      if (len < 1 || len > maxLen || tried.has(len)) continue
      tried.add(len)
      const v = scoreAt(len, frames)
      if (v > 0) {
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
        // A dictionary whose declared id differs may still be the right bytes
        // with a different id stamped on it, so try patching the id and
        // decoding. zstd refuses a frame whose dictionary id does not match.
        if (!matches && frames.length) {
          const patched = Buffer.from(buf.subarray(at, Math.min(at + 4 * 1024 * 1024, buf.length)))
          patched.writeUInt32LE(dictionaryId >>> 0, 4)
          const cands = verifyDictionary(patched, 0, frames)
          if (cands.length) {
            hits.push({
              file: full,
              offset: at,
              dictionaryId: `0x${(id >>> 0).toString(16)}`,
              matches: false,
              verified: true,
              lengthBytes: cands[0].length,
              sampleText: cands[0].preview,
              candidates: cands,
              reason: `declares id 0x${(id >>> 0).toString(16)} but the content decodes this ` +
                `save's frames once the id is patched — ${cands[0].length.toLocaleString()} bytes`,
            })
            at += 4
            continue
          }
        }

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
          const next = buf.indexOf(ZSTD_DICT_MAGIC, at + 4)
          hits.push({
            file: full,
            offset: at,
            dictionaryId: `0x${(id >>> 0).toString(16)}`,
            matches: false,
            verified: false,
            reason: 'a zstd dictionary, but not the one this save uses' +
              (next > at ? ` (up to ${(next - at).toLocaleString()} bytes)` : ''),
          })
        }
        at += 4
      }

      // Checked for every file, including ones that already yielded a
      // dictionary: a tool that reads these saves will reference the id even if
      // it keeps the dictionary itself packed.
      const idAt = buf.indexOf(idLE)
      if (idAt >= 0 && !hits.some((h) => h.file === full && h.verified)) {
        hits.push({
          file: full,
          offset: idAt,
          dictionaryId: `0x${(dictionaryId >>> 0).toString(16)}`,
          matches: false,
          verified: false,
          reason: perFile
            ? `references the dictionary id, and holds ${perFile} other dictionar` +
              `${perFile === 1 ? 'y' : 'ies'} — it knows about this format`
            : 'mentions the dictionary id but holds no dictionary — may embed one compressed',
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


// ── reading the frames ────────────────────────────────────────────────────────

export interface DecodedFrames {
  frames: number
  failed: number
  bytes: number
  /** Concatenated object data, in frame order. */
  data: Buffer
  offsets: number[]
}

/**
 * Decompresses every zstd frame in a payload with the game's dictionary.
 *
 * This is where the object data actually lives — roughly 6.8 MB of packed
 * records in a 31 MB payload. Without the dictionary none of it is readable;
 * with it, every frame decodes.
 */
export function decodeFrames(payload: Buffer, dictionary: Buffer): DecodedFrames {
  const parts: Buffer[] = []
  const offsets: number[] = []
  let i = 0
  let failed = 0
  while ((i = payload.indexOf(ZSTD_FRAME_MAGIC, i)) !== -1) {
    try {
      parts.push(zstdDecompressSync(payload.subarray(i), { dictionary }))
      offsets.push(i)
    } catch {
      failed++
    }
    i += 4
  }
  const data = Buffer.concat(parts)
  return { frames: parts.length, failed, bytes: data.length, data, offsets }
}

/** Confirms a dictionary belongs to a save before it is kept. */
export function checkDictionary(payload: Buffer, dictionary: Buffer): {
  ok: boolean; frames: number; failed: number; bytes: number; message: string
} {
  if (!zstdSupported) {
    return { ok: false, frames: 0, failed: 0, bytes: 0, message: NO_ZSTD }
  }
  if (dictionary.length < 8 || dictionary.readUInt32LE(0) !== 0xec30a437) {
    return { ok: false, frames: 0, failed: 0, bytes: 0, message: 'That file is not a zstd dictionary.' }
  }
  // Only a handful of frames are needed to tell whether it is the right one.
  let i = 0
  let ok = 0
  let failed = 0
  let bytes = 0
  while ((i = payload.indexOf(ZSTD_FRAME_MAGIC, i)) !== -1 && ok + failed < 200) {
    try {
      bytes += zstdDecompressSync(payload.subarray(i), { dictionary }).length
      ok++
    } catch {
      failed++
    }
    i += 4
  }
  // The four magic bytes also turn up by chance inside compressed data, so a
  // few failures are expected noise. What separates the right dictionary from
  // a wrong one is that the great majority of frames decode, not that all do.
  const verdict = ok >= 8 && ok >= (ok + failed) * 0.8
  const id = dictionary.readUInt32LE(4) >>> 0
  return {
    ok: verdict,
    frames: ok,
    failed,
    bytes,
    message: verdict
      ? `Dictionary 0x${id.toString(16)} decodes this save's frames.`
      : `Dictionary 0x${id.toString(16)} did not decode this save (${ok} decoded, ${failed} failed).`,
  }
}


// ── locating the dictionary automatically ─────────────────────────────────────

export interface AutoDictResult {
  found: boolean
  file?: string
  bytes?: number
  id?: string
  frames?: number
  searched: number
  message: string
}

/**
 * Looks for the game's zstd dictionary without asking the user to find it.
 *
 * It ships inside the `madden-franchise` package — a library for EA franchise
 * saves extended to College Football — as `data/zstd-dicts/<game>/dict.bin`.
 * Rather than scanning whole drives, this walks a handful of likely roots
 * looking for that directory by name, then verifies each candidate against the
 * save itself, so a wrong dictionary is never adopted.
 */
export function autoFindDictionary(payload: Buffer, roots: string[]): AutoDictResult {
  const candidates: string[] = []
  let searched = 0

  const walk = (dir: string, depth: number) => {
    if (depth > 9 || candidates.length > 40 || searched > 250_000) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue
      searched++
      const full = join(dir, e.name)
      if (e.name === 'zstd-dicts') {
        // Every per-game subdirectory holds a dict.bin; try them all.
        try {
          for (const g of readdirSync(full, { withFileTypes: true })) {
            if (g.isDirectory()) candidates.push(join(full, g.name, 'dict.bin'))
          }
        } catch { /* unreadable */ }
        continue
      }
      // Skip trees that never contain game installs but are enormous.
      if (/^(Windows|\$Recycle\.Bin|System Volume Information|node_modules\.cache)$/i.test(e.name)) continue
      walk(full, depth + 1)
    }
  }

  if (!zstdSupported) return { found: false, searched: 0, message: NO_ZSTD }

  for (const r of roots) walk(r, 0)

  for (const file of candidates) {
    let dict: Buffer
    try {
      dict = readFileSync(file)
    } catch {
      continue
    }
    const check = checkDictionary(payload, dict)
    if (check.ok) {
      return {
        found: true,
        file,
        bytes: dict.length,
        id: `0x${dict.readUInt32LE(4).toString(16)}`,
        frames: check.frames,
        searched,
        message: `Found the dictionary and verified it against this save.`,
      }
    }
  }

  return {
    found: false,
    searched,
    message: candidates.length
      ? `Checked ${candidates.length} dictionary file(s); none decoded this save.`
      : 'No zstd-dicts directory found. The dictionary ships with tools that read these saves.',
  }
}

// ── the roster ────────────────────────────────────────────────────────────────

/**
 * Where a player's data lives, worked out from five controlled saves and one
 * in-game rating card. The write-up is in docs/SAVE-FORMAT.md.
 *
 * Strings and numbers sit in two parallel arrays sharing one index: player `i`
 * has its name at NAME_TABLE + i × 138 and its record at (65890 + i) × 192.
 */
export const NAME_TABLE = 0x00f44e68
export const NAME_STRIDE = 138
export const NAME_SLOTS = 17470
export const RECORD_STRIDE = 192
export const RECORD_BASE = 65890

/** Record bit holding the redshirt flag. */
export const REDSHIRT_BIT = 1088

/**
 * Position, a 5-bit field. Its 21 values partition the league exactly the way
 * football does: value 0 averages 85 Throwing Power, 5–9 average 82 Strength
 * and 76 Pass Blocking, 19–20 average 82 Kicking Power and nothing else.
 */
export const POSITION_BIT = 1010
export const POSITIONS = [
  'QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT',
  'LE', 'RE', 'DT', 'LOLB', 'MLB', 'ROLB', 'CB', 'FS', 'SS', 'K', 'P',
]

/**
 * Overall. For every position it tracks the ratings that position is judged on
 * — Catching for tight ends, Run Blocking for tackles, Kicking Power for
 * kickers, Man Coverage for safeties — and Awareness throughout, which is how
 * EA's overall behaves. League mean 68.9, range 40–99.
 */
export const OVERALL_BIT = 561

/**
 * The team a player is actually on: an 8-bit field. It cuts the league into 138
 * rosters of 60–105 plus one bucket of 4,718 — recruits and the portal, who are
 * on nobody's roster yet.
 *
 * It was found by taking 41 players named on one program's roster screen and
 * asking which field they all share. They share this one, and exactly 85 players
 * in the entire save carry that value: the scholarship limit. Three earlier
 * attempts failed because they scored candidates against the team id in a
 * player's asset name, which agrees with this field only 3.2% of the time — it
 * records where a generated player started, in a different numbering entirely.
 */
export const TEAM_BIT = 431
export const TEAM_WIDTH = 8
/** Players on no roster: recruits and the transfer portal. */
export const TEAM_UNASSIGNED = 255

/**
 * Ratings are 7-bit fields packed most-significant-bit first; the number here
 * is the bit the field ends on. Every one was checked against a real rating
 * card, and no player in the file falls outside 1–99 on any of them.
 */
export const RATING_BITS: Record<string, number> = {
  Speed: 849, Acceleration: 504, Agility: 490, Strength: 824, Awareness: 536,
  Carrying: 696, 'BC Vision': 575, 'Break Tackle': 586, Trucking: 927, 'Stiff Arm': 817,
  'Change of Direction': 632, 'Spin Move': 856, 'Juke Move': 714, Catching: 842,
  'Catch in Traffic': 671, 'Spectacular Catch': 657, 'Short Route Running': 895,
  'Medium Route Running': 625, 'Deep Route Running': 294, Release: 959, Jumping: 721,
  'Throwing Power': 888, 'Short Throw Accuracy': 799, 'Medium Throw Accuracy': 785,
  'Deep Throw Accuracy': 778, 'Throw on the Run': 810, 'Throw Under Pressure': 650,
  'Break Sack': 600, 'Play Action': 497, 'Pass Blocking': 543, 'Pass Block Power': 522,
  'Pass Block Finesse': 568, 'Run Blocking': 920, 'Run Block Power': 913,
  'Run Block Finesse': 906, 'Lead Block': 703, 'Impact Blocking': 753,
  'Play Recognition': 984, Tackling: 831, 'Hit Power': 689, 'Block Shedding': 607,
  'Finesse Moves': 593, 'Power Moves': 938, Pursuit: 952, 'Man Coverage': 618,
  'Zone Coverage': 991, Press: 945, 'Kick/Punt Return': 682, 'Kicking Power': 735,
  'Kicking Accuracy': 728, Stamina: 863, Toughness: 874, Injury: 746,
}

/**
 * Every rating below is confirmed by a controlled edit or by a rating card, so
 * there are no ambiguous pairs left. The five that were ambiguous — the two
 * throw accuracies, the two run-block ratings, Trucking against Stiff Arm,
 * Finesse against Power Moves, and Speed against Change of Direction — were
 * settled by a save that raised one member of each by a single point. Three of
 * the five were the other way round from the correlation guess.
 */
export const RATING_PAIRS_UNVERIFIED: [string, string][] = []

export interface RosterPlayer {
  index: number
  first: string
  last: string
  hometown: string
  assetId: string
  /**
   * The team the player was *generated* for, from the asset id — not
   * necessarily where they play now, and absent for the 4,644 unique players.
   * The save's own team field is not resolved; see docs/SAVE-FORMAT.md.
   */
  teamId: string | null
  position: string
  overall: number
  /** The save's own team id. TEAM_UNASSIGNED means recruit or portal. */
  team: number
  redshirt: boolean
  ratings: Record<string, number>
}

/** Reads `w` bits ending at `end`, counting most-significant-bit first. */
function bits(payload: Buffer, base: number, end: number, w: number): number {
  let v = 0
  for (let b = end - w + 1; b <= end; b++) {
    v = (v << 1) | ((payload[base + (b >> 3)] >> (7 - (b & 7))) & 1)
  }
  return v
}

function text(payload: Buffer, off: number, max: number): string {
  let e = off
  while (e < off + max && payload[e] >= 32 && payload[e] < 127) e++
  return payload.subarray(off, e).toString('latin1')
}

/**
 * Every player in the save, with names and ratings joined by their shared index.
 *
 * Slots with no name are empty entries in the pool and are skipped rather than
 * reported as blank players.
 */
export function readRoster(payload: Buffer): RosterPlayer[] {
  const out: RosterPlayer[] = []
  const end = RECORD_BASE * RECORD_STRIDE + NAME_SLOTS * RECORD_STRIDE
  if (payload.length < Math.max(end, NAME_TABLE + NAME_SLOTS * NAME_STRIDE)) return out

  for (let i = 0; i < NAME_SLOTS; i++) {
    const n = NAME_TABLE + i * NAME_STRIDE
    const assetId = text(payload, n + 17, 33)
    if (!/^(Unique|Generic)_/.test(assetId)) continue
    const first = text(payload, n, 17)
    const last = text(payload, n + 50, 21)
    if (!first && !last) continue

    const base = (RECORD_BASE + i) * RECORD_STRIDE
    const ratings: Record<string, number> = {}
    for (const [name, bit] of Object.entries(RATING_BITS)) ratings[name] = bits(payload, base, bit, 7)

    const team = /^Generic_\d+_P_T(\d+)_/.exec(assetId)
    out.push({
      index: i,
      first,
      last,
      hometown: text(payload, n + 112, 26),
      assetId,
      teamId: team ? team[1] : null,
      position: POSITIONS[bits(payload, base, POSITION_BIT, 5)] ?? '—',
      team: bits(payload, base, TEAM_BIT, TEAM_WIDTH),
      overall: bits(payload, base, OVERALL_BIT, 7),
      redshirt: bits(payload, base, REDSHIRT_BIT, 1) === 1,
      ratings,
    })
  }
  return out
}

/**
 * The school names the save carries.
 *
 * They sit in a table of 503-byte records, each holding a slug (`teamdb_psu`),
 * a full name, a nickname and chants. The table is alphabetical and carries
 * nothing that reproduces the roster team ids, so it cannot label rosters on its
 * own — but it is the game's own list of schools, so it is the right thing to
 * choose a name from rather than typing one.
 */
export function readTeamNames(payload: Buffer): { slug: string; name: string }[] {
  const tag = Buffer.from('teamdb_', 'latin1')
  const hits: number[] = []
  let i = 0
  while ((i = payload.indexOf(tag, i)) !== -1) { hits.push(i); i++ }
  const out: { slug: string; name: string }[] = []
  for (let k = 0; k < hits.length; k++) {
    if (k > 0 && hits[k] - hits[k - 1] !== 503) continue
    const slug = text(payload, hits[k] + 7, 24)
    const name = text(payload, hits[k] - 278, 30)
    if (slug && name && /^[A-Z]/.test(name)) out.push({ slug, name })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
