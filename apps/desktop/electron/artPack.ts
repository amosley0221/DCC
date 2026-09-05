/**
 * The art pack: everything the phone needs to draw your dynasty, in one file.
 *
 * The extracted art folder is gigabytes of 1024-pixel textures for every school
 * and every face in the game, and the phone has never seen any of it. But your
 * dynasty needs a tiny slice of that: 138 schools' logos, helmets and jerseys,
 * and the faces of the players actually in your snapshot. Shrunk to the size a
 * phone screen draws them at, that slice is a few megabytes rather than a few
 * thousand.
 *
 * So the desktop builds it, and it travels the same three ways the snapshot
 * does — copied across, over Wi-Fi, or through GitHub.
 *
 * Everything here is done with `node:zlib` and nothing else. A PNG is a
 * deflate stream wrapped in length-tagged chunks with a CRC, and shrinking one
 * is averaging boxes of pixels, so pulling in an image library to do it would
 * cost more than writing it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { decodePng } from './gameAssets'

/** What a pack holds, so the phone knows what it got without unpacking it. */
export interface PackManifest {
  version: number
  built: string
  /** School name to the categories present, e.g. { "Penn State": ["logo", "helmet"] }. */
  schools: Record<string, string[]>
  /** Asset ids with a face in the pack. */
  players: string[]
  bytes: number
}

export const PACK_VERSION = 1

/**
 * The categories the phone draws, and what each is called in the pack.
 *
 * The gold mark travels too: a champion keeps it, and it is one small image per
 * school. The dark logo is left out — it is usually the same mark in white, and
 * the phone only ever draws on dark.
 */
export const PACK_CATEGORIES: Record<string, string> = {
  icon: 'logo',
  logoLight: 'logo',
  logoGold: 'gold',
  helmet: 'helmet',
  jersey: 'jersey',
}

export interface PackInput {
  /** The art folder the desktop indexed. */
  root: string
  /** "<school>|<category>" to a path within the root, as `matchSchools` returns. */
  schoolArt: Record<string, string>
  /** Asset id to a path within the root, for the faces worth carrying. */
  facePaths: Record<string, string>
  /** Longest edge for a school mark and for a face. */
  schoolPx?: number
  playerPx?: number
}

export interface PackResult {
  bytes: Buffer
  manifest: PackManifest
  /** Files that were not PNG, or were unreadable. Reported rather than hidden. */
  skipped: number
}

/**
 * Builds the pack.
 *
 * A category that resolves to the same file twice — `icon` and `logoLight` both
 * mapping to "logo" — is written once, first one wins, because the flat icon set
 * is the better mark and is listed first.
 */
export function buildPack(input: PackInput): PackResult {
  const schoolPx = input.schoolPx ?? 160
  const playerPx = input.playerPx ?? 256
  const entries: ZipEntry[] = []
  const schools: Record<string, string[]> = {}
  const players: string[] = []
  let skipped = 0

  const order = Object.keys(PACK_CATEGORIES)
  const wanted = new Map<string, Map<string, string>>()
  for (const key of Object.keys(input.schoolArt)) {
    const sep = key.lastIndexOf('|')
    const school = key.slice(0, sep)
    const cat = key.slice(sep + 1)
    const as = PACK_CATEGORIES[cat]
    if (!as) continue
    let inner = wanted.get(school)
    if (!inner) { inner = new Map(); wanted.set(school, inner) }
    // First category in `order` wins for a given name.
    const existing = inner.get(as)
    if (existing && order.indexOf(cat) >= order.indexOf(existing)) continue
    inner.set(as, cat)
  }

  for (const [school, cats] of wanted) {
    for (const [as, cat] of cats) {
      const file = input.schoolArt[`${school}|${cat}`]
      const png = shrink(join(input.root, file), schoolPx)
      if (!png) { skipped++; continue }
      entries.push({ name: `schools/${safe(school)}__${as}.png`, data: png })
      ;(schools[school] ??= []).push(as)
    }
  }

  for (const [assetId, file] of Object.entries(input.facePaths)) {
    const png = shrink(join(input.root, file), playerPx)
    if (!png) { skipped++; continue }
    entries.push({ name: `players/${safe(assetId)}.png`, data: png })
    players.push(assetId)
  }

  const manifest: PackManifest = {
    version: PACK_VERSION,
    built: new Date().toISOString(),
    schools,
    players,
    bytes: entries.reduce((n, e) => n + e.data.length, 0),
  }
  entries.unshift({ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest), 'utf8') })

  return { bytes: zip(entries), manifest, skipped }
}

/**
 * A filename that survives every filesystem the pack lands on.
 *
 * School names carry apostrophes and full stops — "Hawai'i", "App St." — and an
 * asset id is already safe, but both go through the same door so the phone can
 * apply the identical rule and find what it is looking for.
 */
export const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_')

/** Reads a PNG, shrinks its longest edge to `max`, and writes it back out. */
function shrink(path: string, max: number): Buffer | null {
  let buf: Buffer
  try { buf = readFileSync(path) } catch { return null }
  const img = decodePng(buf)
  if (!img) return null
  const { px, width, height } = img
  if (width <= max && height <= max) return encodePng(px, width, height)
  const scale = max / Math.max(width, height)
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  return encodePng(box(px, width, height, w, h), w, h)
}

/**
 * Box-average downscale.
 *
 * Averaging every source pixel that falls in a destination pixel, rather than
 * picking one of them: a logo reduced by nearest neighbour loses its thin
 * strokes, and a face reduced that way looks like a screenshot of a face.
 * Alpha is averaged with the colour, and colour is weighted by alpha so the
 * transparent edge of a cut-out does not drag the fringe toward black.
 */
export function box(px: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const out = new Uint8Array(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor((y * sh) / dh)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / dh))
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor((x * sw) / dw)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / dw))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const o = (sy * sw + sx) * 4
          const av = px[o + 3]
          r += px[o] * av; g += px[o + 1] * av; b += px[o + 2] * av
          a += av
          n++
        }
      }
      const d = (y * dw + x) * 4
      out[d] = a ? Math.round(r / a) : 0
      out[d + 1] = a ? Math.round(g / a) : 0
      out[d + 2] = a ? Math.round(b / a) : 0
      out[d + 3] = Math.round(a / n)
    }
  }
  return out
}

/* ------------------------------------------------------------ writing a PNG */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(buf: Uint8Array, seed = 0): number {
  let c = seed ^ 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const u32be = (v: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return b }

function chunk(type: string, data: Buffer): Buffer {
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data])
  return Buffer.concat([u32be(data.length), td, u32be(crc32(td))])
}

/** 8-bit RGBA, filter 0 on every line. Small images; the filters buy little. */
export function encodePng(px: Uint8Array, width: number, height: number): Buffer {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(px.buffer, px.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8      // bit depth
  ihdr[9] = 6      // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------------------------------------ writing a ZIP */

interface ZipEntry { name: string; data: Buffer }

const u16le = (v: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(v & 0xffff); return b }
const u32le = (v: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b }

/**
 * A ZIP the phone's own `java.util.zip` opens.
 *
 * Stored, not deflated: every entry is a PNG, which is already a deflate
 * stream, and compressing it again costs time to make it very slightly bigger.
 */
function zip(entries: ZipEntry[]): Buffer {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const crc = crc32(e.data)
    const header = Buffer.concat([
      u32le(0x04034b50), u16le(20), u16le(0), u16le(0),
      u16le(0), u16le(0),                       // time, date: not kept
      u32le(crc), u32le(e.data.length), u32le(e.data.length),
      u16le(name.length), u16le(0), name,
    ])
    local.push(header, e.data)
    central.push(Buffer.concat([
      u32le(0x02014b50), u16le(20), u16le(20), u16le(0), u16le(0),
      u16le(0), u16le(0),
      u32le(crc), u32le(e.data.length), u32le(e.data.length),
      u16le(name.length), u16le(0), u16le(0), u16le(0), u16le(0),
      u32le(0), u32le(offset), name,
    ]))
    offset += header.length + e.data.length
  }
  const dir = Buffer.concat(central)
  return Buffer.concat([
    ...local, dir,
    Buffer.concat([
      u32le(0x06054b50), u16le(0), u16le(0),
      u16le(entries.length), u16le(entries.length),
      u32le(dir.length), u32le(offset), u16le(0),
    ]),
  ])
}
