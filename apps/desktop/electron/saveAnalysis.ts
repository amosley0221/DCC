import { createHash } from 'node:crypto'
import { inflateSync, inflateRawSync, gunzipSync } from 'node:zlib'
import { statSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'

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

export interface SaveReport {
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
    ['EA "FBCHUNKS"', (b) => b.subarray(0, 9).toString('latin1') === 'FBCHUNKS'],
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

export function analyzeSave(path: string): SaveReport {
  const bytes = statSync(path).size
  const buf = readFileSync(path)
  const head = buf.subarray(0, 64)
  const { container, notes } = sniffContainer(head)

  // Entropy per block shows where compressed or encrypted regions sit.
  const blocks = Math.min(64, Math.max(1, Math.ceil(buf.length / (256 * 1024))))
  const blockSize = Math.ceil(buf.length / blocks)
  const entropyProfile = Array.from({ length: blocks }, (_, i) => ({
    offset: i * blockSize,
    entropy: Number(shannon(buf.subarray(i * blockSize, (i + 1) * blockSize)).toFixed(2)),
  }))

  const regions = findCompressedRegions(buf)
  const inflated = regions.length
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

  return {
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
