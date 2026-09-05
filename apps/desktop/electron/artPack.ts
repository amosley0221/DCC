/**
 * The art pack: everything the phone needs to draw your dynasty, in one file.
 *
 * The extracted art folder is gigabytes of full-size textures for every school
 * and every face in the game, and the phone has never seen any of it. Your
 * dynasty needs a small slice: each school's logo, helmet, jersey and gold mark,
 * and the faces of the players in your snapshot. Shrunk to the size a phone
 * draws them at, that slice is a few megabytes.
 *
 * ## Who resizes what, and why
 *
 * The images are read and resized in the **renderer**, on a canvas, and this
 * module only packs what it is handed. The first version decoded and resized
 * here, with a PNG reader written by hand — and the game's art is not PNG, so
 * every file was skipped and the pack came out 208 bytes: a manifest and
 * nothing else.
 *
 * Chromium is already decoding this art, because the desktop draws it on every
 * screen. Whatever format it is in, a canvas reads it and hands back a PNG.
 * Writing a second decoder to sit beside a working one was the mistake, and
 * this side now assembles and nothing more.
 */

/** What a pack holds, so the phone knows what it got without unpacking it. */
export interface PackManifest {
  version: number
  built: string
  /** School name to the marks present, e.g. { "Penn State": ["logo", "helmet"] }. */
  schools: Record<string, string[]>
  /** Asset ids with a face in the pack. */
  players: string[]
  bytes: number
}

export const PACK_VERSION = 1

/**
 * The art categories the phone draws, and what each is called in the pack.
 *
 * The gold mark travels: a champion keeps it, and it is one small image per
 * school. The dark logo is left out — it is usually the same mark in white and
 * the phone only ever draws on dark.
 */
export const PACK_CATEGORIES: Record<string, string> = {
  icon: 'logo',
  logoLight: 'logo',
  logoGold: 'gold',
  helmet: 'helmet',
  jersey: 'jersey',
}

/** One image, already resized, on its way into the archive. */
export interface PackEntry {
  /** "schools/Penn_State__logo.png" or "players/<assetId>.png". */
  name: string
  data: Buffer
}

export interface PackResult {
  bytes: Buffer
  manifest: PackManifest
}

/**
 * A filename that survives every filesystem the pack lands on.
 *
 * School names carry apostrophes and full stops — "Hawai'i", "App St." — and
 * both sides apply this same rule, so the phone builds the name it is looking
 * for rather than having to be told it.
 */
export const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_')

export const schoolEntryName = (school: string, mark: string) =>
  `schools/${safe(school)}__${mark}.png`

export const playerEntryName = (assetId: string) => `players/${safe(assetId)}.png`

/**
 * Which of a school's files to carry, and under what name.
 *
 * `icon` and `logoLight` both become "logo", and the first listed wins, because
 * the flat icon set is the better mark of the two.
 */
export function schoolPlan(schoolArt: Record<string, string>): Map<string, Map<string, string>> {
  const order = Object.keys(PACK_CATEGORIES)
  const out = new Map<string, Map<string, string>>()
  for (const key of Object.keys(schoolArt)) {
    const sep = key.lastIndexOf('|')
    const school = key.slice(0, sep)
    const cat = key.slice(sep + 1)
    const mark = PACK_CATEGORIES[cat]
    if (!mark) continue
    let inner = out.get(school)
    if (!inner) { inner = new Map(); out.set(school, inner) }
    const existing = inner.get(mark)
    if (existing && order.indexOf(cat) >= order.indexOf(existing)) continue
    inner.set(mark, cat)
  }
  return out
}

/** Assembles the archive and its manifest from the resized images. */
export function packEntries(entries: PackEntry[], now = new Date()): PackResult {
  const schools: Record<string, string[]> = {}
  const players: string[] = []
  for (const e of entries) {
    const school = /^schools\/(.+)__([a-z]+)\.png$/.exec(e.name)
    if (school) { (schools[school[1]] ??= []).push(school[2]); continue }
    const player = /^players\/(.+)\.png$/.exec(e.name)
    if (player) players.push(player[1])
  }
  const manifest: PackManifest = {
    version: PACK_VERSION,
    built: now.toISOString(),
    schools,
    players,
    bytes: entries.reduce((n, e) => n + e.data.length, 0),
  }
  const all: PackEntry[] = [
    { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest), 'utf8') },
    ...entries,
  ]
  return { bytes: zip(all), manifest }
}

/* ---------------------------------------------------------- writing the ZIP */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const u16le = (v: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(v & 0xffff); return b }
const u32le = (v: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b }

/**
 * A ZIP the phone's own `java.util.zip` opens.
 *
 * Stored, not deflated: every entry is a PNG, which is already a deflate
 * stream, and compressing it again costs time to make it very slightly bigger.
 */
function zip(entries: PackEntry[]): Buffer {
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
