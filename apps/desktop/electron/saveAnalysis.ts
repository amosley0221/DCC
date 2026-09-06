import { createHash } from 'node:crypto'
import { inflateSync, inflateRawSync, gunzipSync } from 'node:zlib'
import * as zlib from 'node:zlib'
import { TEAM_ID_NAMES } from './teamIds'
import {
  PLAYER_TAG, RECRUIT_FIELDS, RECRUIT_PLAYER_AT, RECRUIT_STAGES, RECRUIT_STRIDE,
  TOP_SCHOOLS_PER_RECRUIT,
} from './recruiting'

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
  /**
   * Every string that looks like one of the save's own class names, whatever
   * its frequency. The frequency list above is capped and sorted by count, so
   * a class declared once — which most of them are — never appeared in it, and
   * the class list is the map of what the save actually holds.
   */
  classNames: { text: string; count: number }[]
  /**
   * Every store the payload declares. Read here rather than in the roster pass
   * so the report carries it whether or not a roster has been read: it is a
   * scan for markers, not a decode, and it is the first thing worth knowing
   * about an unfamiliar save.
   */
  stores: StoreRecord[]
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

/**
 * Strings shaped like a Frostbite class name: CamelCase, no underscores,
 * optionally an array suffix. The registry names its classes this way, so this
 * is the closest thing the save has to a table of contents.
 *
 * Two capitals is the whole filter, and it is doing more work than it looks.
 * Without it the list fills with first names — Aaron, Chris — and with
 * underscores allowed it fills with the save's own asset ids, `AaronsOmar_30391`
 * and `Air_Force_Army_Game`, tens of thousands of them. Sorted alphabetically
 * and capped, that meant the list never got past the letter A: DepthChart, the
 * name someone would actually go looking for, could not appear.
 */
function extractClassNames(buf: Buffer, cap = 2000): { text: string; count: number }[] {
  const counts = new Map<string, number>()
  let cur: number[] = []
  const flush = () => {
    if (cur.length >= 5 && cur.length <= 48) {
      const s = Buffer.from(cur).toString('latin1')
      const shaped = /^[A-Z][A-Za-z0-9]*(\[\])?$/.test(s)
      const camel = (s.match(/[A-Z]/g) ?? []).length >= 2
      if (shaped && camel) counts.set(s, (counts.get(s) ?? 0) + 1)
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
    .sort((a, b) => a.text.localeCompare(b.text))
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
    classNames: extractClassNames(textSource),
    stores: readStores(textSource),
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
 * Set on a live recruit, and clear on a generated player who is in the pool
 * for another reason — the two the game does not list as prospects in one Penn
 * State save are Carter Landry at 89 and Dorian Exum at 86, both above the best
 * real recruit.
 *
 * Provisional, and worth stating why. It was found by taking 28 players
 * confirmed to be in the recruiting class and 2 confirmed not to be, then
 * looking for a field that keeps all of the first and drops both of the second.
 * Two counter-examples is thin evidence, so the corroboration matters more than
 * the fit: it selects 4,108 where the game counts 4,100 prospects, and the
 * eight best it keeps are the same eight the game lists, in the same ratings.
 *
 * It is not a bare "is a recruit" flag — it is also set on 6,682 rostered
 * players, so it means something broader and only separates recruits once the
 * player is already known to be unrostered and generated. No field in the
 * record is on for recruits and off for the rostered; that was searched for
 * exhaustively across every 1- to 4-bit position and there are none.
 */
export const RECRUIT_BIT = 658

/* ------------------------------------------------------------- recruiting */

/**
 * Fields solved against a 4,100-row export of the game's own recruiting class
 * for the same save. Each was required to agree with every one of 4,026
 * unambiguously named players — names occurring twice were dropped, since one
 * bad pairing rejects a correct field — so these are readings, not fits.
 *
 * Not here: recruiting stage, gem/bust, commit score and total offers. Those
 * change as recruiting happens and are not in the player record at all; they
 * belong to a table DCC has not found yet.
 */
export const HEIGHT_BIT = 650        // inches, 7 bits, no offset
export const WEIGHT_BIT = 365        // pounds, 8 bits, plus 160
export const STARS_BIT = 1241        // 3 bits, plus 1
export const NIL_BIT = 171           // $K, 9 bits, minus 255
/**
 * The class year: Freshman, Sophomore, Junior, Senior. Two bits.
 *
 * The schema's enum for this field is named `HighSchool`,
 * `JuniorCollege_Sophomore`, `JuniorCollege_Junior`, and taking those labels at
 * face value made rosters read as though half a team had come from a junior
 * college. They are the wrong names for the values, and there is a fourth the
 * enum has no name for at all, which is why every senior read as blank.
 *
 * Verified twice against the game's own screen. The counts match to the
 * player: Penn State's 85 come out 54 Freshman, 13 Sophomore, 12 Junior, 6
 * Senior, and so does the game. And ten players named on that screen — Vernon,
 * Falzone, Priester, Vildor, Masterson, Ferrell, Felton, Boyett, Howard,
 * Samuel — all agree, freshman through senior.
 *
 * It also behaves like a class. Across one offseason it advanced by exactly one
 * for 70.4% of the players rostered in both saves and never went down: a class
 * that advances unless the player redshirted or has run out of years.
 */
export const CLASS_YEAR_BIT = 1189   // 2 bits
export const DEV_TRAIT_BIT = 322     // 2 bits
export const STATE_BIT = 998         // 6 bits
export const PIPELINE_BIT = 1037     // 6 bits
export const DEALBREAKER_BIT = 867   // 4 bits
export const PITCH_BIT = 1109        // 5 bits
export const ARCHETYPE_BIT = 511     // 3 bits, read against the position

/**
 * The game's own id for a player, and the key that everything outside the
 * player record refers to them by. Exact against all 4,026 unambiguously named
 * recruits in the class export, which prints the same id.
 *
 * This is the join into the tables DCC has not read yet — recruiting stage,
 * commit score, offers and school interest are not in the player record, and
 * whatever holds them has to name the player somehow.
 */
export const PLAYER_ID_BIT = 191     // 14 bits

export const CLASS_YEARS: (string | null)[] = ["Freshman", "Sophomore", "Junior", "Senior"]
export const DEV_TRAITS: (string | null)[] = ["Normal", "Impact", "Star", "Elite"]
export const HOME_STATES: (string | null)[] = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "NewHampshire", "NewJersey", "NewMexico", "NewYork", "NorthCarolina", "NorthDakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "RhodeIsland", "SouthCarolina", null, "Tennessee", "Texas", "Utah", null, "Virginia", "Washington", "WestVirginia", "Wisconsin", "Wyoming"]
export const PIPELINES: (string | null)[] = ["Alabama", "Arizona", "Arkansas", "Big Apple", "Big Sky", "Central Florida", "Colorado", "East Texas", "Hawaii", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Metro Atlanta", "Michigan", "Minnesota", "Mississippi", "Missouri", "Nebraska", "Nevada", "New England", "New Mexico", "North Carolina", "North Florida", "North Texas", "Northern California", "Ohio", "Oklahoma", "Pacific Northwest", "Pennsylvania", "South Carolina", "South Florida", "South Georgia", "Southern California", "Southwest Texas", "Tennessee", "Tidewater", "Utah", "West Virginia", "Wisconsin"]
export const DEALBREAKERS: (string | null)[] = [null, null, "Brand Exposure", null, "Championship Contender", "Coach Prestige", null, "Conference Prestige", "Playing Style", "Playing Time", "Pro Potential", null, "Proximity to Home"]
export const IDEAL_PITCHES: (string | null)[] = ["College Experience", "Team Player", "Campus Personality", "It's Game Time", "Prestigious", "Student of the Game", "Hometown Hero", "Prove Yourself", "The Clutch", "TV Time", "Coach's Favorite", "Aspirational", "To the House", "Football Influencer", "Time to Get to Work", "Starter", "Grassroots", "Conference Spotlight", "Sunday Bound", "Work Horse"]

/** Archetype names are reused across positions, so the table is per position. */
export const ARCHETYPES: Record<string, (string | null)[]> = {
  "QB": ["Field General", null, "Improviser", "Scrambler", "Pure Scrambler"],
  "HB": ["HB Power Blocking", "HB Power Receiving", "HB Elusive Power", null, null, "HB Power Back", "HB Elusive Back", "HB Receiving Back"],
  "FB": [null, null, null, null, "FB Blocking", "FB Utility"],
  "WR": ["Physical Route Runner", "Shifty Route Runner", "Physical Blocker", "Gadget Receiver", "Physical", null, "Deep Threat", "Playmaker"],
  "TE": ["Physical Route Runner", "Possession Blocking", "Possession", null, null, null, "Blocking", "Vertical Threat"],
  "LT": ["Power", "Well Rounded", "Agile", null, null, null, null, "Pass Protector"],
  "LG": [null, null, null, "G Pass Protector", "G Well Rounded", "G Power", "G Agile"],
  "C": [null, null, null, "Pass Protector", "Power", "Well Rounded", "Agile"],
  "RG": [null, null, null, "G Pass Protector", "G Well Rounded", "G Power", "G Agile"],
  "RT": ["Power", "Well Rounded", "Agile", null, null, null, null, "Pass Protector"],
  "LE": ["Power Rusher", "Pure Power", "Run Stopper", null, null, null, null, "Smaller Speed Rusher"],
  "RE": ["Power Rusher", "Pure Power", "Run Stopper", null, null, null, null, "Smaller Speed Rusher"],
  "DT": [null, null, null, "Nose Tackle", "Pure Power", "Speed Rusher", "Power Rusher"],
  "LOLB": ["Power Rusher", "Pass Coverage", "Run Stopper"],
  "MLB": [null, null, null, "Field General", "Pass Coverage", "Run Stopper"],
  "ROLB": ["Power Rusher", "Pass Coverage", "Run Stopper"],
  "CB": ["Zone", "Hybrid Corner", null, null, null, null, "Manto Man", "Slot"],
  "FS": [null, null, "Zone", "Hybrid", "Run Support"],
  "SS": [null, null, "Zone", "Hybrid", "Run Support"],
  "K": [null, null, null, null, null, "KP Accurate", "KP Power"],
  "P": [null, null, null, null, null, "KP Accurate", "KP Power"],
}


/**
 * Position, a 5-bit field. Its 21 values partition the league exactly the way
 * football does: value 0 averages 85 Throwing Power, 5–9 average 82 Strength
 * and 76 Pass Blocking, 19–20 average 82 Kicking Power and nothing else.
 */
export const POSITION_BIT = 1010
export { POSITIONS } from './positions'
import { POSITIONS } from './positions'

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
  'Deep Throw Accuracy': 778, 'Throw on the Run': 810,
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

/**
 * Ratings the game has that DCC cannot place. Throw Under Pressure was mapped
 * to bit 650 from one player's rating card; bit 650 is Height, verified on all
 * 16,448 players, and that player's throw-under-pressure happened to equal his
 * height in inches. Listed rather than guessed.
 */
export const RATINGS_UNPLACED = ['Throw Under Pressure']

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
  /** The game's own id — how tables outside the player record refer to them. */
  playerId: number
  /** See RECRUIT_BIT — only meaningful for the unrostered. */
  recruitFlag: boolean
  heightIn: number
  weightLb: number
  stars: number
  nilK: number
  classYear: string | null
  devTrait: string | null
  homeState: string | null
  pipeline: string | null
  dealbreaker: string | null
  idealPitch: string | null
  archetype: string | null
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
      playerId: bits(payload, base, PLAYER_ID_BIT, 14),
      recruitFlag: bits(payload, base, RECRUIT_BIT, 1) === 1,
      heightIn: bits(payload, base, HEIGHT_BIT, 7),
      weightLb: bits(payload, base, WEIGHT_BIT, 8) + 160,
      stars: bits(payload, base, STARS_BIT, 3) + 1,
      nilK: bits(payload, base, NIL_BIT, 9) - 255,
      classYear: CLASS_YEARS[bits(payload, base, CLASS_YEAR_BIT, 2)] ?? null,
      devTrait: DEV_TRAITS[bits(payload, base, DEV_TRAIT_BIT, 2)] ?? null,
      homeState: HOME_STATES[bits(payload, base, STATE_BIT, 6)] ?? null,
      pipeline: PIPELINES[bits(payload, base, PIPELINE_BIT, 6)] ?? null,
      dealbreaker: DEALBREAKERS[bits(payload, base, DEALBREAKER_BIT, 4)] ?? null,
      idealPitch: IDEAL_PITCHES[bits(payload, base, PITCH_BIT, 5)] ?? null,
      archetype: (ARCHETYPES[POSITIONS[bits(payload, base, POSITION_BIT, 5)] ?? ''] ?? [])[bits(payload, base, ARCHETYPE_BIT, 3)] ?? null,
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
/**
 * The 503-byte team record holds several names at fixed offsets from the
 * `teamdb_` marker, not just the one DCC was reading:
 *
 *   -278  display name       "App St."
 *   -227  full name          "Appalachian State"
 *   -204  abbreviation       "APP"
 *   -146  nickname           "Mountaineers"
 *   -128  short nickname     "Tide", "'Cats"
 *    -77  alternate abbrev.  "BAMA", "ZONA"
 *
 * The full name is the useful one for art: the save says "App St." and the
 * files say `AppalachianState`, so matching on the display name needed an alias
 * list that the full name mostly removes.
 */
export interface TeamRecord {
  slug: string
  /** Short display name, as the game shows it in tables. */
  name: string
  fullName: string | null
  abbr: string | null
  nickname: string | null
  shortNickname: string | null
  altAbbr: string | null
}


/* ------------------------------------------------------------- coaches */

const CONFERENCES = [
  'Big Ten', 'SEC', 'ACC', 'Big 12', 'Pac-12', 'American', 'MAC', 'MW',
  'CUSA', 'Sun Belt', 'Independent',
]

/** Coach name at +0, conference at +19, division at +37. */
export const COACH_STRIDE = 58

export interface CoachRecord {
  /** The save's own team id, 0-137 — the same field a player record carries. */
  teamId: number
  coach: string | null
  conference: string | null
  division: string | null
}

/**
 * Reads the coach table: 414 records of 58 bytes, three blocks of the same 138
 * teams in the save's own team-id order.
 *
 * Confirmed by the only pairing available: the user's team is Penn State,
 * whose players carry team id 74, and row 74 is their coach with the Big Ten.
 * The conference sizes are the game's own — Big Ten 18, ACC 17, SEC and Big 12
 * 16, Sun Belt and American 14, MAC 13, MW and CUSA 10, Pac-12 8, Independent
 * 2 — which is what makes this a reading rather than a coincidence.
 *
 * The table is located by its contents rather than a fixed offset, since a
 * different save need not put it in the same place.
 */
export function readCoaches(payload: Buffer): CoachRecord[] {
  const isConf = (o: number) => {
    const t = text(payload, o, 20)
    return t !== null && CONFERENCES.includes(t)
  }
  // Anchor on a conference name, then require its neighbours 58 bytes away to
  // be conference names too — a lone match is a string somewhere else.
  const probe = Buffer.from('Big Ten', 'latin1')
  let start = -1
  for (let i = 0; (i = payload.indexOf(probe, i)) !== -1; i++) {
    const row = i - 19
    let run = 0
    for (let k = 1; k <= 4; k++) if (isConf(row + k * COACH_STRIDE + 19)) run++
    if (run < 3) continue
    let lo = row
    while (lo - COACH_STRIDE >= 0 && isConf(lo - COACH_STRIDE + 19)) lo -= COACH_STRIDE
    start = lo
    break
  }
  if (start < 0) return []

  const out: CoachRecord[] = []
  for (let k = 0; ; k++) {
    const o = start + k * COACH_STRIDE
    if (o + COACH_STRIDE > payload.length) break
    const conference = text(payload, o + 19, 20)
    if (!conference || !CONFERENCES.includes(conference)) break
    // Three blocks of the same teams; only the first is kept, and the team id
    // is the row's position within its block.
    if (k >= 138) break
    out.push({
      teamId: k,
      coach: text(payload, o, 19) || null,
      conference,
      division: text(payload, o + 37, 20) || null,
    })
  }
  return out
}




/* --------------------------------------------------------------- stores */

export interface StoreRecord {
  name: string
  offset: number
  rows: number
  members: number
}

/**
 * The save's own directory of tables.
 *
 * Each store announces itself in plain bytes: the marker `SPBF`, the schema
 * version — 486.1, matching the game's published type schema — its own name
 * with a length in front, then a `BSFT` block whose counts include the number
 * of rows and the number of members. `ScheduleKnownGameStore` reports 960 rows
 * and 9 members, and `ScheduleKnownGame` has exactly 9 members in the schema.
 *
 * This is the index the earlier work lacked. It does not give a row's layout —
 * fields that are references to other tables are not stored inline — but it
 * says what exists, how much of it there is, and where to start looking.
 */
/**
 * The depth chart.
 *
 * `DepthChartStore` holds only a reference table — 143 chart records and 5,005
 * slot records, one chart and exactly 35 slots per team. The slots' contents
 * are a flat run of fixed-size records elsewhere in the payload, and this reads
 * those.
 *
 * A slot is 24 bytes: six four-byte fields, each either all-zero or a player
 * reference — the tag 0x213e followed by the player's row in the roster table.
 * References are packed at the front and depth order is array order, so the
 * first field is the first string. Teams run in blocks of 35 slots.
 *
 * See docs/SAVE-FORMAT.md for how it was derived; the short version is a pair
 * of saves either side of one swapped centre, which moved four bytes.
 */
export const DEPTH_REF_TAG = 0x213e
export const DEPTH_SLOT_BYTES = 24
export const DEPTH_SLOT_FIELDS = 6
export const DEPTH_SLOTS_PER_TEAM = 35

/**
 * What each slot is, in the order the save stores them — which is alphabetical
 * by abbreviation, and is the rule that identified them. Confirmed against a
 * dynasty's own depth chart screen: 28 of the 35 could be checked by name and
 * all 28 agreed.
 */
export const DEPTH_SLOTS: { abbr: string; name: string; side: 'offense' | 'defense' | 'special' }[] = [
  { abbr: '3DRB', name: 'Third-down back', side: 'offense' },
  { abbr: 'C', name: 'Center', side: 'offense' },
  { abbr: 'CB', name: 'Cornerback', side: 'defense' },
  { abbr: 'DT', name: 'Defensive tackle', side: 'defense' },
  { abbr: 'FB', name: 'Fullback', side: 'offense' },
  { abbr: 'FS', name: 'Free safety', side: 'defense' },
  { abbr: 'GAD', name: 'Gadget receiver', side: 'offense' },
  { abbr: 'HB', name: 'Running back', side: 'offense' },
  { abbr: 'K', name: 'Kicker', side: 'special' },
  { abbr: 'KOS', name: 'Kickoff specialist', side: 'special' },
  { abbr: 'KR', name: 'Kick returner', side: 'special' },
  { abbr: 'LE', name: 'Left end', side: 'defense' },
  { abbr: 'LG', name: 'Left guard', side: 'offense' },
  { abbr: 'LOLB', name: 'Left outside linebacker', side: 'defense' },
  { abbr: 'LS', name: 'Long snapper', side: 'special' },
  { abbr: 'LT', name: 'Left tackle', side: 'offense' },
  { abbr: 'MLB', name: 'Middle linebacker', side: 'defense' },
  { abbr: 'NT', name: 'Nose tackle', side: 'defense' },
  { abbr: 'P', name: 'Punter', side: 'special' },
  { abbr: 'PR', name: 'Punt returner', side: 'special' },
  { abbr: 'PWHB', name: 'Power back', side: 'offense' },
  { abbr: 'QB', name: 'Quarterback', side: 'offense' },
  { abbr: 'RDT', name: 'Tackle (3-4)', side: 'defense' },
  { abbr: 'RE', name: 'Right end', side: 'defense' },
  { abbr: 'RG', name: 'Right guard', side: 'offense' },
  { abbr: 'RLE', name: 'Left end (3-4)', side: 'defense' },
  { abbr: 'ROLB', name: 'Right outside linebacker', side: 'defense' },
  { abbr: 'RRE', name: 'Right end (3-4)', side: 'defense' },
  { abbr: 'RT', name: 'Right tackle', side: 'offense' },
  { abbr: 'SLCB', name: 'Slot corner', side: 'defense' },
  { abbr: 'SLWR', name: 'Slot receiver', side: 'offense' },
  { abbr: 'SS', name: 'Strong safety', side: 'defense' },
  { abbr: 'SUBLB', name: 'Sub-package linebacker', side: 'defense' },
  { abbr: 'TE', name: 'Tight end', side: 'offense' },
  { abbr: 'WR', name: 'Receiver', side: 'offense' },
]

export interface DepthChartSlot {
  /** 0-34, indexing DEPTH_SLOTS. */
  slot: number
  /** Roster rows, first string first. */
  rows: number[]
  /** Where the record starts, so an edit knows what to rewrite. */
  offset: number
}

export interface DepthChart {
  /** The block's position in the region — the team table's order, not a team id. */
  block: number
  slots: DepthChartSlot[]
}

/**
 * How many references a 24-byte record holds, or -1 if it is not one.
 *
 * A record of six zero fields is legitimate — a team with no fullback has one —
 * so an empty record counts as valid rather than ending the region. Requiring
 * the references to be packed at the front is what stops a stretch of unrelated
 * bytes reading as a run of slots.
 */
function depthSlotSize(payload: Buffer, at: number, rows: (r: number) => boolean): number {
  if (at < 0 || at + DEPTH_SLOT_BYTES > payload.length) return -1
  let n = 0
  let ended = false
  for (let k = 0; k < DEPTH_SLOT_FIELDS; k++) {
    const o = at + k * 4
    const tag = payload.readUInt16BE(o)
    const row = payload.readUInt16BE(o + 2)
    if (tag === 0 && row === 0) { ended = true; continue }
    if (tag !== DEPTH_REF_TAG || ended || !rows(row)) return -1
    n++
  }
  return n
}

/**
 * Reads every team's depth chart. Returns null when the region cannot be found
 * or does not come out as a whole number of teams, rather than guessing.
 */
export function readDepthCharts(payload: Buffer, rosterRows: Set<number>): DepthChart[] | null {
  const has = (r: number) => rosterRows.has(r)
  // Find the longest stretch of slot-shaped records, then extend it through the
  // empty ones a scan alone would stop at.
  let best = { at: -1, n: 0 }
  let i = 0
  while (i + DEPTH_SLOT_BYTES <= payload.length) {
    if (depthSlotSize(payload, i, has) > 0) {
      const at = i
      let n = 0
      while (depthSlotSize(payload, i, has) > 0) { n++; i += DEPTH_SLOT_BYTES }
      if (n > best.n) best = { at, n }
    } else i += 1
  }
  if (best.at < 0 || best.n < DEPTH_SLOTS_PER_TEAM) return null

  let start = best.at
  while (depthSlotSize(payload, start - DEPTH_SLOT_BYTES, has) >= 0) start -= DEPTH_SLOT_BYTES
  let end = start
  while (depthSlotSize(payload, end, has) >= 0) end += DEPTH_SLOT_BYTES

  const count = (end - start) / DEPTH_SLOT_BYTES
  if (count % DEPTH_SLOTS_PER_TEAM !== 0) return null

  const charts: DepthChart[] = []
  for (let block = 0; block < count / DEPTH_SLOTS_PER_TEAM; block++) {
    const slots: DepthChartSlot[] = []
    for (let s = 0; s < DEPTH_SLOTS_PER_TEAM; s++) {
      const at = start + (block * DEPTH_SLOTS_PER_TEAM + s) * DEPTH_SLOT_BYTES
      const rows: number[] = []
      for (let k = 0; k < DEPTH_SLOT_FIELDS; k++) {
        const o = at + k * 4
        if (payload.readUInt16BE(o) !== DEPTH_REF_TAG) break
        rows.push(payload.readUInt16BE(o + 2))
      }
      slots.push({ slot: s, rows, offset: at })
    }
    charts.push({ block, slots })
  }
  return charts
}

/**
 * Where the store directory and its tables were last found, per save.
 *
 * Both walk the whole payload — `readStores` scans it end to end for every
 * `SPBF`, and `storeTable` scans again for the `BSFT` that follows one. That is
 * cheap once and ruinous in a loop: the poll search reads a field at every bit
 * position and width, so it called this sixteen thousand times and spent
 * seventeen seconds of a thirty-megabyte save on nothing but finding the same
 * header again. Keyed on the buffer itself, so a re-read of the save gets a
 * fresh answer and nothing has to remember to clear it.
 */
const storeScans = new WeakMap<Buffer, StoreRecord[]>()
const storeTables = new WeakMap<Buffer, Map<string, StoreTable | null>>()

export function readStores(payload: Buffer): StoreRecord[] {
  const seen = storeScans.get(payload)
  if (seen) return seen
  const found = scanStores(payload)
  storeScans.set(payload, found)
  return found
}

function scanStores(payload: Buffer): StoreRecord[] {
  const marker = Buffer.from('SPBF', 'latin1')
  const bsft = Buffer.from('BSFT', 'latin1')
  const out: StoreRecord[] = []
  let i = 0
  while ((i = payload.indexOf(marker, i)) !== -1) {
    i += 4
    if (i + 16 > payload.length) break
    const major = payload.readUInt32BE(i)
    const nameLen = payload.readUInt32BE(i + 12)
    if (major !== 486 || nameLen === 0 || nameLen > 96 || i + 16 + nameLen > payload.length) continue
    const name = payload.subarray(i + 16, i + 16 + nameLen).toString('latin1')
    if (!/^[A-Za-z0-9_]+$/.test(name)) continue
    const after = i + 16 + nameLen
    const at = payload.indexOf(bsft, after)
    if (at < 0 || at > after + 64) continue
    out.push({
      name,
      offset: i - 4,
      rows: payload.readUInt32BE(at + 16),
      members: payload.readUInt32BE(at + 20),
    })
  }
  return out.sort((a, b) => b.rows - a.rows)
}

export function readTeamNames(payload: Buffer): TeamRecord[] {
  const tag = Buffer.from('teamdb_', 'latin1')
  const hits: number[] = []
  let i = 0
  while ((i = payload.indexOf(tag, i)) !== -1) { hits.push(i); i++ }
  // The records sit in one contiguous run of 503-byte entries, with a stray
  // marker elsewhere in the payload. Requiring each hit to be 503 bytes after
  // the previous one silently dropped the *first* record of the run — Air
  // Force — and left 142 teams where the save holds 143.
  const inRun = hits.map((h, k) =>
    (k > 0 && h - hits[k - 1] === 503) || (k + 1 < hits.length && hits[k + 1] - h === 503))

  const out: TeamRecord[] = []
  for (let k = 0; k < hits.length; k++) {
    if (!inRun[k]) continue
    const slug = text(payload, hits[k] + 7, 24)
    const name = text(payload, hits[k] - 278, 30)
    if (!slug || !name || !/^[A-Z]/.test(name)) continue
    out.push({
      slug, name,
      fullName: text(payload, hits[k] - 227, 30) || null,
      abbr: text(payload, hits[k] - 204, 8) || null,
      nickname: text(payload, hits[k] - 146, 24) || null,
      shortNickname: text(payload, hits[k] - 128, 24) || null,
      altAbbr: text(payload, hits[k] - 77, 8) || null,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}


/* ------------------------------------------------------------- schedule */

export interface SeasonGame {
  /** Row in SeasonGameStore. */
  row: number
  week: number
  month: number
  day: number
  /** Minutes after midnight; 2047 is the schema default for "unset". */
  kickoff: number
  attendance: number
  temperatureF: number
  weather: number
  windMph: number
  /** Team-table index of each side, or -1 when the slot is empty. */
  homeIndex: number
  awayIndex: number
  home: string | null
  away: string | null
  homeScore: number
  awayScore: number
  homeQ: number[]
  awayQ: number[]
  homeOT: number
  awayOT: number
  played: boolean
  /** The user played this one rather than simulating it. */
  userPlayed: boolean
  overtime: boolean
  /** December rows are bowl games; the season's own weeks run August to November. */
  postseason: boolean
}

/**
 * Offsets of the game store's scalar fields, in bits from the start of a row.
 * Each was located by searching for a box-score value at every position in the
 * row and requiring the same position to reproduce nine games' worth — see
 * docs/SAVE-FORMAT.md.
 */
export const GAME_BITS = {
  kickoff: [578, 11], attendance: [589, 19],
  homeScore: [640, 8], awayScore: [648, 8], temperature: [664, 8],
  homeOT: [676, 7], awayOT: [683, 7],
  awayQ1: [690, 7], awayQ2: [697, 7], homeQ4: [708, 7], homeQ3: [715, 7], homeQ2: [722, 7], homeQ1: [729, 7],
  wind: [736, 5], awayQ3: [747, 7], awayQ4: [754, 7],
  month: [778, 4], weather: [782, 4], week: [791, 4], day: [795, 5],
  /** 1 for a simulated game, 0 for one the user played; bit 789 is the reverse. */
  simmed: [786, 1], userPlayed: [789, 1], overtime: [790, 1],
} as const

const G = GAME_BITS

/** Byte offsets, within a row, of the two team references (tag 0x319e). */
const G_AWAY_REF = 12
const G_HOME_REF = 40
const TEAM_TAG = 0x319e
export const SEASON_GAME_ROW = 100

/**
 * The order the game's team table uses: every school sorted by its full name,
 * with UConn filed under Connecticut. Verified against 44 team appearances in
 * 29 games named by the user's own schedule and a week's scoreboard.
 */
export function teamTableOrder(teams: TeamRecord[]): TeamRecord[] {
  const key = (t: TeamRecord) => (t.name === 'UConn' ? 'Connecticut' : (t.fullName ?? t.name))
  return [...teams].sort((a, b) => key(a).localeCompare(key(b), 'en'))
}

/**
 * Reads the season's games out of `SeasonGameStore`.
 *
 * A row is 100 bytes: 72 bytes of references first, then the packed scalar
 * fields. The references are ordinary four-byte handles — a 16-bit table tag
 * and a 16-bit row — and the two that matter here point into the team table:
 * away at byte 12, home at byte 40. The scalars are bit-packed, MSB first, at
 * the offsets in `G`; the first of them, kickoff, starts two bits into byte 72.
 *
 * Teams are not stored as the ids players carry but as rows of the 143-row
 * team table, whose order is `teamTableOrder`. Kickoff is minutes after
 * midnight, temperature is Fahrenheit plus 40 (the schema's floor is -40), and
 * the final score already includes overtime, which is also kept separately.
 */
/**
 * Byte offset of the first game row, and the number of rows, or null when the
 * store is not present. The rows follow the store's `BSFT` header words and its
 * one word per member.
 */
export function seasonGameTable(payload: Buffer): { data: number; rows: number } | null {
  const t = storeTable(payload, 'SeasonGameStore')
  return t && { data: t.data, rows: t.rows }
}

export interface StoreTable {
  /** Byte offset of the first row. */
  data: number
  rows: number
  /** Bytes per row, from the store's own header rather than guessed. */
  rowBytes: number
  /** One bit offset per member, in the schema's member order. */
  memberBits: number[]
}

/**
 * A store's rows, located and measured from its own header.
 *
 * Every store's `BSFT` block turns out to describe its own layout, which is
 * what the format notes had been looking for the long way round. After the tag
 * come six words — the third is the row size *in words*, the fourth the row
 * count and the fifth the member count — and then one word per member, giving
 * that member's bit offset within the row. `SeasonGameStore` reports 25 words,
 * which is the 100-byte row that was found by hand, and its member words
 * include 791, the season week that was found by hand as well.
 *
 * Two caveats keep this from being a decoder on its own. The header names no
 * members, so the offsets only become fields once the schema's member list for
 * that store is known; and a member's width is not stated, so it still has to
 * come from the gaps or from reading values. Some stores also report one member
 * whose offset lies far outside the row — an array member, most likely, whose
 * word means something else — so a caller must range-check before reading.
 */
export function storeTable(payload: Buffer, name: string): StoreTable | null {
  let byName = storeTables.get(payload)
  if (!byName) { byName = new Map(); storeTables.set(payload, byName) }
  const seen = byName.get(name)
  if (seen !== undefined) return seen
  const found = locateTable(payload, name)
  byName.set(name, found)
  return found
}

function locateTable(payload: Buffer, name: string): StoreTable | null {
  const store = readStores(payload).find((s) => s.name === name)
  if (!store) return null
  const bsft = payload.indexOf(Buffer.from('BSFT', 'latin1'), store.offset)
  if (bsft < 0 || bsft + 28 + store.members * 4 > payload.length) return null
  const memberBits: number[] = []
  for (let i = 0; i < store.members; i++) memberBits.push(payload.readUInt32BE(bsft + 28 + i * 4))
  return {
    data: bsft + 28 + store.members * 4,
    rows: store.rows,
    rowBytes: payload.readUInt32BE(bsft + 12) * 4,
    memberBits,
  }
}

/** A season's title game, once it has been played. */
export interface SeasonTitle {
  /** 1 for the dynasty's first season. */
  season: number
  /** Rows in the team table, which `teamTableOrder` names. */
  championIndex: number
  runnerUpIndex: number
}

/**
 * Who won each season, out of `YearSummaryStore`.
 *
 * The game table holds the bowls — 36 of them in a finished season — but not
 * the playoff, and the champion is not among them. The year summary is where it
 * lives: each row carries two references tagged `0x319e`, which is the team
 * table's tag, at bytes 8 and 16. The first is the winner.
 *
 * Read straight off a real dynasty: season 1 gives Oklahoma over Texas A&M and
 * season 2 gives Penn State over BYU, which is the title its coach says they
 * won. The season being played has both empty, and a save taken a year earlier
 * has season 2 empty too — so the row fills in when the game is played, and an
 * empty row is a season not yet decided rather than a read that failed.
 */
export function readChampions(payload: Buffer): SeasonTitle[] {
  const t = storeTable(payload, 'YearSummaryStore')
  if (!t || t.rowBytes < 20) return []
  const out: SeasonTitle[] = []
  for (let r = 0; r < t.rows; r++) {
    const o = t.data + r * t.rowBytes
    if (o + t.rowBytes > payload.length) break
    const ref = (at: number) =>
      payload.readUInt16BE(o + at) === TEAM_TAG ? payload.readUInt16BE(o + at + 2) : -1
    const championIndex = ref(8)
    const runnerUpIndex = ref(16)
    if (championIndex < 0) continue
    out.push({ season: r + 1, championIndex, runnerUpIndex })
  }
  return out
}

/**
 * How many seasons the dynasty has reached, counting the one being played.
 *
 * `YearSummaryStore` holds thirty rows and fills them one per season. The rows
 * it has not reached yet are not blank: each carries its own index plus one in
 * its second word, which is the free-list chain every store in this save uses.
 * Ignoring that word and asking which rows carry anything else gives the count
 * — 3 in a save two offseasons in, and 2 in one taken a season earlier, which
 * is what identified it.
 *
 * It is an ordinal, not a calendar year. Nothing found so far in the save says
 * "2027", so DCC counts seasons and lets the user name the year if they want to
 * see one.
 */
export function readSeasonOrdinal(payload: Buffer): number | null {
  const t = storeTable(payload, 'YearSummaryStore')
  if (!t || t.rowBytes < 8) return null
  let used = 0
  for (let r = 0; r < t.rows; r++) {
    const o = t.data + r * t.rowBytes
    if (o + t.rowBytes > payload.length) break
    for (let w = 0; w * 4 < t.rowBytes; w++) {
      if (w === 1) continue
      if (payload.readUInt32BE(o + w * 4) !== 0) { used++; break }
    }
  }
  return used || null
}

export function readSeasonGames(payload: Buffer, teams: TeamRecord[]): SeasonGame[] {
  const table = seasonGameTable(payload)
  if (!table) return []
  const { data, rows: rowCount } = table
  const store = { rows: rowCount }
  const order = teamTableOrder(teams)
  const nameOf = (i: number) => (i >= 0 && i < order.length ? order[i].name : null)

  const out: SeasonGame[] = []
  for (let r = 0; r < store.rows; r++) {
    const o = data + r * SEASON_GAME_ROW
    if (o + SEASON_GAME_ROW > payload.length) break
    const rd = ([bit, w]: readonly [number, number]) => {
      let v = 0
      for (let b = bit; b < bit + w; b++) v = (v << 1) | ((payload[o + (b >> 3)] >> (7 - (b & 7))) & 1)
      return v
    }
    const ref = (at: number) => (payload.readUInt16BE(o + at) === TEAM_TAG ? payload.readUInt16BE(o + at + 2) : -1)
    const homeIndex = ref(G_HOME_REF), awayIndex = ref(G_AWAY_REF)
    const week = rd(G.week)
    if (homeIndex < 0 || awayIndex < 0 || homeIndex >= order.length || awayIndex >= order.length) continue
    const homeQ = [rd(G.homeQ1), rd(G.homeQ2), rd(G.homeQ3), rd(G.homeQ4)]
    const awayQ = [rd(G.awayQ1), rd(G.awayQ2), rd(G.awayQ3), rd(G.awayQ4)]
    const homeScore = rd(G.homeScore), awayScore = rd(G.awayScore)
    out.push({
      row: r, week, month: rd(G.month), day: rd(G.day),
      kickoff: rd(G.kickoff), attendance: rd(G.attendance),
      temperatureF: rd(G.temperature) - 40, weather: rd(G.weather), windMph: rd(G.wind),
      homeIndex, awayIndex, home: nameOf(homeIndex), away: nameOf(awayIndex),
      homeScore, awayScore, homeQ, awayQ, homeOT: rd(G.homeOT), awayOT: rd(G.awayOT),
      played: homeScore + awayScore > 0 || homeQ.some(Boolean) || awayQ.some(Boolean),
      userPlayed: rd(G.userPlayed) === 1,
      overtime: rd(G.overtime) === 1,
      postseason: rd(G.month) === 12 || rd(G.month) === 1,
    })
  }
  return out.sort((a, b) => a.week - b.week || a.row - b.row)
}

/**
 * One store's rows, dumped for reading by eye.
 *
 * This is the instrument the remaining decodes need. The store directory says
 * what exists and how wide each row is; it does not say which column is which.
 * The method that has worked every time is to look at a handful of rows beside
 * a value you already know — the poll's number one, a Heisman leader, a
 * recruit's rank — and find the column that agrees.
 *
 * Each row comes back as hex and as the obvious readings of it, because a field
 * that is a team index, a rank or a score is nearly always one of these.
 */
export interface StoreDump {
  name: string
  rows: number
  members: number
  rowBytes: number
  /** The words the BSFT header lists for the members, near but not equal to bit offsets. */
  memberBits: number[]
  lines: string[]
}

export function dumpStore(payload: Buffer, name: string, limit = 40): StoreDump | null {
  const t = storeTable(payload, name)
  if (!t) return null
  const rowBytes = Math.max(1, Math.min(t.rowBytes, 256))
  const lines: string[] = []
  for (let r = 0; r < Math.min(limit, t.rows); r++) {
    const at = t.data + r * t.rowBytes
    if (at + rowBytes > payload.length) break
    const raw = payload.subarray(at, at + rowBytes)
    const u8 = [...raw].join(' ')
    const u16: number[] = []
    for (let i = 0; i + 2 <= raw.length; i += 2) u16.push(raw.readUInt16BE(i))
    const u32: number[] = []
    for (let i = 0; i + 4 <= raw.length; i += 4) u32.push(raw.readUInt32BE(i))
    lines.push(
      `row ${r} @0x${at.toString(16)}\n` +
      `  hex  ${raw.toString('hex').replace(/(.{2})/g, '$1 ').trim()}\n` +
      `  u8   ${u8}\n` +
      `  u16  ${u16.join(' ')}\n` +
      `  u32  ${u32.join(' ')}`,
    )
  }
  return {
    name, rows: t.rows, members: t.memberBits.length,
    rowBytes: t.rowBytes, memberBits: t.memberBits, lines,
  }
}

/* --------------------------------------------------- rankings and the Heisman */

/**
 * A column of `TeamStore` that holds a ranking.
 *
 * The save has no poll table — the store directory lists 88 tables and none of
 * them is one. A team's rank is a field on the team, one of `TeamStore`'s 424
 * members, and the header does not say which.
 *
 * So it is found rather than guessed at, by a property only a ranking has: over
 * 143 teams, a full ordering holds every number from 1 to 143 exactly once, and
 * a poll holds 1 to 25 once each with everyone else on one shared value. A
 * column matching that is a ranking of something.
 *
 * The one trap the search has to avoid is the one that has caught this project
 * before: a plain counter is also a perfect permutation. A column whose value
 * is its own row number is rejected, because a rank in team-table order is not
 * a rank, it is an index.
 */
export interface TeamRankColumn {
  /** First bit of the field within a team row, counted from the top. */
  at: number
  /** How wide the field is, in bits. */
  width: number
  /** Every team ranked, or a top 25 with the rest level. */
  kind: 'full' | 'top25'
  /** Team-table index to rank. */
  ranks: Record<number, number>
  /** The first few, best first, so a screen can show what was found. */
  top: { index: number; rank: number }[]
}

export function findTeamRanks(payload: Buffer): TeamRankColumn[] {
  const t = storeTable(payload, 'TeamStore')
  if (!t || t.rows < 8 || t.rowBytes < 4) return []
  const rows = t.rows
  const rowBits = t.rowBytes * 8

  /**
   * A field at a bit position, read in O(1).
   *
   * Bytes were the wrong unit and finding nothing was the proof: this save is
   * bit-packed everywhere else — the whole player record is — so a rank that
   * needs eight bits sits wherever the field before it ended, not on a byte
   * boundary. `start` is the first bit of the field, counted from the top of
   * the row the same way the player reader counts them.
   */
  const at = (base: number, start: number, w: number) => {
    const i = base + (start >> 3)
    const shift = start & 7
    const v = (payload[i] << 16) | (payload[i + 1] << 8) | payload[i + 2]
    return (v >>> (24 - shift - w)) & ((1 << w) - 1)
  }

  const out: TeamRankColumn[] = []
  const seen = new Set<string>()

  // Five bits is enough for a top 25, twelve for a full ordering of 143 with
  // room over. Narrower than five cannot hold a ranking; wider is a field that
  // happens to have a small value in it.
  for (let w = 5; w <= 12; w++) {
    const limit = rowBits - w
    for (let start = 0; start <= limit; start++) {
      // The last bytes of the last row must exist for the three-byte read.
      if (t.data + (rows - 1) * t.rowBytes + (start >> 3) + 3 > payload.length) break
      const vals: number[] = new Array(rows)
      for (let r = 0; r < rows; r++) vals[r] = at(t.data + r * t.rowBytes, start, w)

      // A counter is a perfect permutation and means nothing.
      if (vals.every((v, i) => v === i + 1) || vals.every((v, i) => v === i)) continue

      const kind = rankKind(vals, rows)
      if (!kind) continue

      // The same field read one bit wider is the same field with a leading
      // zero. Keep the narrowest reading of any set of values.
      const key = vals.join(',')
      if (seen.has(key)) continue
      seen.add(key)
      // A relaxed test can match more than one field. A dozen is enough to
      // choose from; more than that is noise rather than evidence.
      if (out.length >= 12) return out

      const ranks: Record<number, number> = {}
      vals.forEach((v, i) => { if (v >= 1 && v <= rows) ranks[i] = v })
      out.push({
        at: start, width: w, kind, ranks,
        top: Object.entries(ranks)
          .map(([index, rank]) => ({ index: Number(index), rank }))
          .sort((x, y) => x.rank - y.rank)
          .slice(0, 25),
      })
    }
  }
  return out
}

/**
 * Whether a column of values is a ranking, and which sort.
 *
 * A full ordering holds every place from one to the number of teams. A poll
 * holds one to N once each with everyone else on a single shared value —
 * usually twenty-five, but a poll that has not filled out yet, or a top ten,
 * is the same shape and worth catching.
 */
function rankKind(vals: number[], rows: number): 'full' | 'top25' | null {
  if (vals.length !== rows) return null
  const sorted = [...vals].sort((a, b) => a - b)
  if (sorted.every((v, i) => v === i + 1)) return 'full'

  const ranked = vals.filter((v) => v >= 1 && v <= 40).sort((a, b) => a - b)
  if (ranked.length < 10) return null
  if (!ranked.every((v, i) => v === i + 1)) return null
  // Everyone outside the ranking shares one value, whatever it is.
  const rest = new Set(vals.filter((v) => v < 1 || v > ranked.length))
  if (rest.size !== 1) return null
  return 'top25'
}

/**
 * The Heisman watch, out of the save's own five-row table.
 *
 * `HeismanRankingStore` holds exactly five rows of four members, which is the
 * shortlist the game shows. Which member is the player is not written down, so
 * it is found the same way: the column whose value is a reference resolving to
 * a real roster row in every one of the five.
 */
export interface HeismanEntry {
  /** 1 is the leader. Row order, which is how the store keeps it. */
  rank: number
  /** Roster row, or -1 when the reference did not resolve. */
  playerIndex: number
  /** The rest of the row as 32-bit words, for what is not placed yet. */
  words: number[]
}

export function readHeisman(
  payload: Buffer,
  roster: { index: number; playerId: number; team: number }[],
): HeismanEntry[] {
  const t = storeTable(payload, 'HeismanRankingStore')
  if (!t || !t.rows || t.rowBytes < 4) return []

  const rowAt = (r: number) => t.data + r * t.rowBytes
  const rows: number[][] = []
  for (let r = 0; r < t.rows; r++) {
    const o = rowAt(r)
    if (o + t.rowBytes > payload.length) return []
    const words: number[] = []
    for (let i = 0; i + 4 <= t.rowBytes; i += 4) words.push(payload.readUInt32BE(o + i))
    rows.push(words)
  }

  // Only players on a roster. This is the check that would have caught the
  // first attempt on its own: it put a receiver on no team at the top of the
  // watch, and nobody unrostered is in the running for anything.
  const byRow = new Map<number, number>()
  const byId = new Map<number, number>()
  for (const p of roster) {
    if (p.team === TEAM_UNASSIGNED) continue
    byRow.set(p.index, p.index)
    byId.set(p.playerId, p.index)
  }

  /*
   * Which column is the player.
   *
   * The table has five rows and the game shows four names, so the last row is
   * spare — which is why insisting that every row resolve found nothing. Three
   * rows agreeing is the test, and the rows that do not are the end of the list
   * rather than a failure.
   *
   * A reference is a two-byte type tag and a two-byte index, so the tag carries
   * the information: identical across the rows that resolve, and large enough
   * to be a type id rather than a small number that happens to sit there. The
   * indices must be distinct, must not run 0, 1, 2, 3 — which is what a counter
   * looks like, and is what fooled the first version of this — and must all
   * belong to players on a roster.
   */
  let best: { at: number; ids: boolean; resolved: number[] } | null = null
  for (const ids of [false, true]) {
    const table = ids ? byId : byRow
    for (let a = 0; a + 4 <= t.rowBytes; a += 2) {
      const tag = payload.readUInt16BE(rowAt(0) + a)
      if (tag < 0x0100 || tag === 0xffff) continue
      const resolved: number[] = []
      for (let r = 0; r < t.rows; r++) {
        const o = rowAt(r) + a
        if (payload.readUInt16BE(o) !== tag) break
        const hit = table.get(payload.readUInt16BE(o + 2))
        if (hit === undefined) break
        resolved.push(hit)
      }
      if (resolved.length < 3) continue
      if (new Set(resolved).size !== resolved.length) continue
      if (resolved.every((v, i) => v === i) || resolved.every((v, i) => v === i + 1)) continue
      // The longest list wins, and a tie goes to the row index over the game id,
      // which is the reference the rest of the save uses.
      if (!best || resolved.length > best.resolved.length) best = { at: a, ids, resolved }
    }
  }

  return rows.map((words, r) => ({
    rank: r + 1,
    playerIndex: best && r < best.resolved.length ? best.resolved[r] : -1,
    words,
  })).filter((_, r) => best === null || r < best.resolved.length)
}

/**
 * What the renderer is handed for a ranking column and the Heisman five.
 *
 * Named here rather than in the renderer's ambient types so both sides of the
 * bridge agree by construction: the main process builds these, the store holds
 * them, and neither can drift from a type written twice.
 */
export interface RankColumnView {
  at: number
  width: number
  /** What the game calls it — CFP, Media, Coaches — once you have said which. */
  name?: string
  kind: 'full' | 'top25'
  /** School name to rank. */
  ranks: Record<string, number>
}

export interface HeismanView {
  rank: number
  index: number
  first: string | null
  last: string | null
  position: string | null
  overall: number | null
  team: number | null
  words: number[]
}

/* ------------------------------------------- a ranking you can point at */

/**
 * The values one bit field holds across every team, in team-table order.
 *
 * The unit is bits because the save is bit-packed: a rank needing eight bits
 * sits wherever the field before it ended, not on a byte boundary.
 */
export function readRankField(payload: Buffer, at: number, width: number): number[] {
  const t = storeTable(payload, 'TeamStore')
  if (!t || !t.rows) return []
  const out: number[] = []
  for (let r = 0; r < t.rows; r++) {
    const base = t.data + r * t.rowBytes
    const i = base + (at >> 3)
    if (i + 3 > payload.length) return []
    const shift = at & 7
    const v = (payload[i] << 16) | (payload[i + 1] << 8) | payload[i + 2]
    out.push((v >>> (24 - shift - width)) & ((1 << width) - 1))
  }
  return out
}

/** A field that might be the ranking, with enough about it to recognise. */
export interface RankCandidate {
  at: number
  width: number
  /** 1 when the best team holds 1; 0 when it holds 0 and everything shifts. */
  base: 0 | 1
  /** How many teams hold a place. */
  ranked: number
  /** Team-table index to rank, always written 1-based. */
  ranks: Record<number, number>
}

/**
 * Every field of `TeamStore` where a team you can name holds the rank you know.
 *
 * This is the method that has worked on every field decoded here: take a value
 * you already have, find it in the payload, and confirm the stride. Sweeping
 * for the shape of a ranking alone found nothing in a real save — a poll leaves
 * the unranked holding whatever they held before, so it is not the clean
 * permutation the shape test wanted. One rank you can read off the screen is
 * worth more than any amount of guessing at the shape.
 *
 * A candidate has to place the teams you named exactly, rank at least ten
 * programs, and give each of them a different place. A field where every team
 * holds its own row number is a counter and is thrown out.
 */
export function findRankColumns(
  payload: Buffer,
  known: { teamIndex: number; rank: number }[],
  limit = 12,
): RankCandidate[] {
  const t = storeTable(payload, 'TeamStore')
  if (!t || t.rows < 8 || !known.length) return []
  const rows = t.rows
  const rowBits = t.rowBytes * 8
  const out: RankCandidate[] = []
  // The same ranking is written more than once — this week's and last week's,
  // and a second copy of each — so a search turns up a dozen fields holding
  // maybe five different orders. Only the orders are worth showing.
  const seen = new Set<string>()

  // Narrowest first, and only the first reading of any one ordering is kept.
  // A field reads identically at a wider width whenever the bits in front of it
  // are zero, and at a narrower one whenever its own top bit is spare, so the
  // same poll turns up at several offsets. Which of them is the field's own
  // width cannot be told from the data — and does not matter, because only
  // values that land between one and the number of teams are ever used.
  for (let width = 5; width <= 12 && out.length < limit; width++) {
    for (let at = 0; at + width <= rowBits && out.length < limit; at++) {
      const vals = readRankField(payload, at, width)
      if (vals.length !== rows) break

      for (const base of [1, 0] as const) {
        if (!known.every((k) => vals[k.teamIndex] === k.rank - (1 - base))) continue
        // A counter places every team, in row order, and means nothing.
        if (vals.every((v, i) => v === i + base)) continue

        const ranks: Record<number, number> = {}
        const placed = new Set<number>()
        let clash = false
        for (let i = 0; i < rows; i++) {
          const v = vals[i]
          const place = v + (1 - base)
          if (place < 1 || place > rows) continue
          if (placed.has(place)) { clash = true; break }
          placed.add(place)
          ranks[i] = place
        }
        if (clash || placed.size < 10) continue
        const signature = Object.entries(ranks)
          .sort((x, y) => x[1] - y[1]).map(([i, r]) => `${r}:${i}`).join(',')
        if (seen.has(signature)) break
        seen.add(signature)
        out.push({ at, width, base, ranked: placed.size, ranks })
        break
      }
    }
  }
  return out
}

/** A candidate ranking field as the screens receive it, with school names. */
export interface PollCandidate {
  at: number
  width: number
  base: 0 | 1
  ranked: number
  top: { name: string; rank: number }[]
}

/** A poll the user has found in their save and named. */
export interface SavedPollView {
  name: string
  at: number
  width: number
  base: 0 | 1
}

/* ------------------------------------------------------- the recruiting board */

/**
 * A recruit's own record: the ranks and the state of their recruitment.
 *
 * None of this is in the player record — that was searched exhaustively and is
 * written up in docs/SAVE-FORMAT.md. It lives in a separate array of 24-byte
 * records, one per prospect, outside the store directory the way player records
 * are.
 */
export interface RecruitBoard {
  /** Where the 24-byte record starts, so an edit can find it again. */
  at: number
  /** The player this record belongs to, as a row in `readRoster`. */
  playerIndex: number
  /**
   * The ten schools recruiting them, strongest interest first, as the game
   * shows them. Empty when the save has no block for that rank.
   */
  topSchools: { school: string; interest: number }[]
  nationalRank: number
  positionRank: number
  stateRank: number
  /** 0..1023. How close they are to committing. */
  commitScore: number
  totalOffers: number
  /** Top10 Top5 Top3 Battle SoftCommitted HardCommitted Signed */
  stage: string
}

/** Reads `w` bits starting at `start`, most-significant first. */
function bitsFrom(payload: Buffer, base: number, start: number, w: number): number {
  const b = base + (start >> 3)
  if (b + 4 > payload.length) return 0
  const v = ((payload[b] << 24) | (payload[b + 1] << 16) | (payload[b + 2] << 8) | payload[b + 3]) >>> 0
  return (v >>> (32 - (start & 7) - w)) & ((1 << w) - 1)
}

/**
 * Every prospect's rank and recruiting state, read out of the save.
 *
 * How it was found, since the method is the reusable part. The records are not
 * in the store directory — all 88 were checked and none is sized like a class —
 * and they are not ordered by rank: a sweep for a rank-ordered array holding the
 * commit score found nothing, and a second sweep, keyed on which of 4,100
 * recruits changed between two saves a week apart, found nothing either. What
 * did work was to stop looking for the fields and look for the link. The
 * Heisman table shows the game writing a player as a two-byte tag `0x213e` and
 * a two-byte row, so every player reference in the save can be listed; exactly
 * 4,100 of them point at prospects, they sit together, and they are 24 bytes
 * apart. The fields then fell out against the game's own class export.
 *
 * Verified on three saves — two of them a week apart, one from a different
 * session — at the same bit positions every time: all 4,100 recruits agree on
 * national, position and state rank, commit score, offers and stage.
 *
 * Located by its contents rather than by an address, so it survives the array
 * moving: the anchor is a run of records whose player reference resolves to a
 * prospect, which is a thing no other table in the save looks like.
 */
export function readRecruitBoard(
  payload: Buffer,
  players: { index: number; team: number; recruitFlag: boolean }[],
): RecruitBoard[] {
  const prospects = new Set<number>()
  for (const p of players) if (p.recruitFlag && p.team === TEAM_UNASSIGNED) prospects.add(p.index)
  if (prospects.size < 100) return []

  const points = (at: number) =>
    at + 4 <= payload.length &&
    payload.readUInt16BE(at) === PLAYER_TAG &&
    prospects.has(payload.readUInt16BE(at + 2))

  // Eight in a row on one stride is the anchor: a coincidence would have to
  // land eight prospect references 24 bytes apart.
  let anchor = -1
  for (let i = 0; i + RECRUIT_STRIDE * 8 <= payload.length; i += 4) {
    if (!points(i)) continue
    let n = 1
    while (n < 8 && points(i + n * RECRUIT_STRIDE)) n++
    if (n === 8) { anchor = i; break }
  }
  if (anchor < 0) return []

  // Slots can be empty, so a gap is not the end of the array. Walk back until
  // the run of empties is long enough to be past the start, then forward again
  // to the first record — starting on the empties would spend the same budget
  // before reaching anything.
  const GAP = 400
  let base = anchor - RECRUIT_PLAYER_AT
  for (let miss = 0; base - RECRUIT_STRIDE >= 0 && miss < GAP;) {
    base -= RECRUIT_STRIDE
    miss = points(base + RECRUIT_PLAYER_AT) ? 0 : miss + 1
  }
  while (base < anchor && !points(base + RECRUIT_PLAYER_AT)) base += RECRUIT_STRIDE

  const out: RecruitBoard[] = []
  for (let o = base, miss = 0; o + RECRUIT_STRIDE <= payload.length && miss < GAP; o += RECRUIT_STRIDE) {
    if (!points(o + RECRUIT_PLAYER_AT)) { miss++; continue }
    miss = 0
    const f = (k: keyof typeof RECRUIT_FIELDS) =>
      bitsFrom(payload, o, RECRUIT_FIELDS[k][0], RECRUIT_FIELDS[k][1])
    const nationalRank = f('nationalRank')
    out.push({
      at: o,
      playerIndex: payload.readUInt16BE(o + RECRUIT_PLAYER_AT + 2),
      topSchools: topSchools(payload, nationalRank),
      nationalRank,
      positionRank: f('positionRank'),
      stateRank: f('stateRank'),
      commitScore: f('commitScore'),
      totalOffers: f('totalOffers'),
      stage: RECRUIT_STAGES[f('stage')] ?? 'Top10',
    })
  }
  return out
}

/**
 * The ten schools on a recruit's list, with the interest each has built.
 *
 * `HighSchoolProspectTopSchoolsStore` is a flat table of four-byte rows — a
 * 16-bit team id and a 16-bit influence, matching the schema's
 * `ProspectTargetSchool` — grouped ten to a prospect and ordered by national
 * rank, so a recruit's block starts at row `(rank - 1) * 10 + 1`. That was
 * checked against the game's own class export: for all 4,100 recruits the ten
 * schools and their ten influence values match, as a set, in the save's own
 * order.
 *
 * The rank comes from the recruit's own record, which is what makes this usable
 * — the block says which schools, and never which recruit.
 */
export function topSchools(payload: Buffer, nationalRank: number): { school: string; interest: number }[] {
  const t = storeTable(payload, 'HighSchoolProspectTopSchoolsStore')
  if (!t || t.rowBytes !== 4 || nationalRank < 1) return []
  const start = (nationalRank - 1) * TOP_SCHOOLS_PER_RECRUIT + 1
  if (start + TOP_SCHOOLS_PER_RECRUIT > t.rows) return []
  const out: { school: string; interest: number }[] = []
  for (let k = 0; k < TOP_SCHOOLS_PER_RECRUIT; k++) {
    const o = t.data + (start + k) * 4
    if (o + 4 > payload.length) break
    const school = TEAM_ID_NAMES[payload.readUInt16BE(o)]
    if (!school) continue
    out.push({ school, interest: payload.readUInt16BE(o + 2) })
  }
  return out
}
