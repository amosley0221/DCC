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
  /** Named art that is not a school: "trophy:heisman", "bowl:rosebowl", "playoff:round1". */
  awards: string[]
  /**
   * How the jersey sits on the portrait, as lined up on the PC.
   *
   * The two are different sets of art on canvases nobody has measured, so where
   * one's collar meets the other's neck is looked at rather than derived. It
   * travels in the pack so the phone draws a player exactly as the PC does,
   * rather than needing the same two sliders again.
   */
  fit: { jerseyScale: number; jerseyDrop: number }
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
  // Both helmets travel. A matchup wants each side facing the other, and one
  // image cannot do that — which is what it had been doing.
  helmet: 'helmet',
  helmetRight: 'helmetRight',
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
 * Trophies, bowl crests and playoff marks travel too.
 *
 * Their keys are "kind:name" and a colon is not a filename on Windows, so the
 * separator becomes a double underscore — the same rule the school marks use,
 * and the phone rebuilds the name rather than being told it.
 */
export const awardEntryName = (key: string) => {
  const [kind, ...rest] = key.split(':')
  return `awards/${safe(kind)}__${safe(rest.join(':'))}.png`
}

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

/**
 * What a pack holds, worked out from the entry names alone.
 *
 * Names rather than entries, because the streaming writer has already written
 * the images out and does not keep them: all it has is the list.
 */
export function packManifest(
  names: string[],
  bytes: number,
  now = new Date(),
  fit: { jerseyScale?: number; jerseyDrop?: number } = {},
): PackManifest {
  const schools: Record<string, string[]> = {}
  const players: string[] = []
  const awards: string[] = []
  for (const name of names) {
    const school = /^schools\/(.+)__([a-z]+)\.png$/.exec(name)
    if (school) { (schools[school[1]] ??= []).push(school[2]); continue }
    const player = /^players\/(.+)\.png$/.exec(name)
    if (player) { players.push(player[1]); continue }
    const award = /^awards\/([^/]+)__([^/]+)\.png$/.exec(name)
    if (award) awards.push(`${award[1]}:${award[2]}`)
  }
  return {
    version: PACK_VERSION,
    built: now.toISOString(),
    schools,
    players,
    awards,
    fit: {
      jerseyScale: Number.isFinite(fit.jerseyScale) ? Number(fit.jerseyScale) : 1,
      jerseyDrop: Number.isFinite(fit.jerseyDrop) ? Number(fit.jerseyDrop) : 0,
    },
    bytes,
  }
}

/** Assembles the whole archive in memory. Used by the tests and by small packs. */
export function packEntries(
  entries: PackEntry[],
  now = new Date(),
  fit: { jerseyScale?: number; jerseyDrop?: number } = {},
): PackResult {
  const manifest = packManifest(
    entries.map((e) => e.name),
    entries.reduce((n, e) => n + e.data.length, 0),
    now, fit,
  )
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

/*
 * A ZIP the phone's own `java.util.zip` opens, written in three pieces so it can
 * be streamed to a file rather than assembled in memory.
 *
 * A pack of every face in the country is a few hundred megabytes of PNG, and
 * holding all of it plus the archive it is being concatenated into is how the
 * main process runs out of room on the largest scope — the same shape of bug
 * that was fixed on the phone in 0.39.2 and left standing here.
 *
 * Stored, not deflated: every entry is a PNG, which is already a deflate
 * stream, and compressing it again costs time to make it very slightly bigger.
 */

/** What the central directory needs to remember about an entry already written. */
export interface ZipRecord {
  name: string
  crc: number
  size: number
  /** Where this entry's local header starts in the file. */
  offset: number
}

/** One entry's local header and its bytes, ready to append. */
export function zipChunk(entry: PackEntry, offset: number): { bytes: Buffer; record: ZipRecord } {
  const name = Buffer.from(entry.name, 'utf8')
  const crc = crc32(entry.data)
  const header = Buffer.concat([
    u32le(0x04034b50), u16le(20), u16le(0), u16le(0),
    u16le(0), u16le(0),                       // time, date: not kept
    u32le(crc), u32le(entry.data.length), u32le(entry.data.length),
    u16le(name.length), u16le(0), name,
  ])
  return {
    bytes: Buffer.concat([header, entry.data]),
    record: { name: entry.name, crc, size: entry.data.length, offset },
  }
}

/** The central directory and the end record, for everything already appended. */
export function zipDirectory(records: ZipRecord[], offset: number): Buffer {
  const central = records.map((r) => {
    const name = Buffer.from(r.name, 'utf8')
    return Buffer.concat([
      u32le(0x02014b50), u16le(20), u16le(20), u16le(0), u16le(0),
      u16le(0), u16le(0),
      u32le(r.crc), u32le(r.size), u32le(r.size),
      u16le(name.length), u16le(0), u16le(0), u16le(0), u16le(0),
      u32le(0), u32le(r.offset), name,
    ])
  })
  const dir = Buffer.concat(central)
  return Buffer.concat([
    dir,
    Buffer.concat([
      u32le(0x06054b50), u16le(0), u16le(0),
      u16le(records.length), u16le(records.length),
      u32le(dir.length), u32le(offset), u16le(0),
    ]),
  ])
}

function zip(entries: PackEntry[]): Buffer {
  const parts: Buffer[] = []
  const records: ZipRecord[] = []
  let offset = 0
  for (const e of entries) {
    const { bytes, record } = zipChunk(e, offset)
    parts.push(bytes)
    records.push(record)
    offset += bytes.length
  }
  parts.push(zipDirectory(records, offset))
  return Buffer.concat(parts)
}
