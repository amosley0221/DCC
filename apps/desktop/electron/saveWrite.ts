/**
 * Writing back to a College Football save.
 *
 * The container makes this safer than it sounds. A save is a fixed-size file:
 * an 82-byte FBCHUNKS header whose chunk record carries the compressed length
 * at offset 74, one zlib stream, then whatever the previous, longer save left
 * behind. There is no checksum — three saves of the same dynasty carry stale
 * bytes of different lengths past the end of their streams, which a verified
 * file could not do — so a rebuilt stream only has to inflate.
 *
 * Everything here is built so that a wrong byte cannot reach the user's save:
 * the payload is edited in memory, the result is checked to differ from the
 * original *only* where intended, the rebuilt file is re-read and re-inflated
 * before it is allowed anywhere near the original, and the original is copied
 * to a timestamped backup first.
 */
import { copyFileSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import { GAME_BITS, seasonGameTable } from './saveAnalysis'
import { WEATHER } from './gameEnums'

/** Where the chunk record keeps the compressed length, and where the stream starts. */
const LENGTH_AT = 74
const STREAM_AT = 82

export interface Container {
  /** The whole original file, kept so the rebuild reuses its header verbatim. */
  file: Buffer
  payload: Buffer
  /** Compressed length as the header declares it. */
  declared: number
}

export function readContainer(file: Buffer): Container | null {
  if (file.subarray(0, 8).toString('latin1') !== 'FBCHUNKS') return null
  if (file.length < STREAM_AT + 16) return null
  const declared = file.readUInt32LE(LENGTH_AT)
  if (declared <= 0 || STREAM_AT + declared > file.length) return null
  try {
    return { file, payload: inflateSync(file.subarray(STREAM_AT, STREAM_AT + declared)), declared }
  } catch {
    return null
  }
}

/**
 * Rebuilds the file around a new payload, keeping the original's header and
 * total length. Returns null when the compressed result will not fit, which
 * cannot be worked around by truncating — the game would read a short stream.
 */
export function packContainer(c: Container, payload: Buffer): Buffer | null {
  // Level 9: the game's own stream compresses smaller at 9 than node manages at
  // the default, so this is the level that reliably fits back in the same file.
  const stream = deflateSync(payload, { level: 9 })
  if (STREAM_AT + stream.length > c.file.length) return null
  const out = Buffer.alloc(c.file.length)
  c.file.copy(out, 0, 0, STREAM_AT)
  out.writeUInt32LE(stream.length, LENGTH_AT)
  stream.copy(out, STREAM_AT)
  return out
}

/* ------------------------------------------------------------------ edits */

/** One field of one game row, as the UI offers it. */
export interface GameEdit {
  row: number
  kickoff?: number
  temperatureF?: number
  weather?: number
  windMph?: number
}

/** Kickoff times the game itself offers, in minutes after midnight. */
export const KICKOFF_SLOTS = [720, 750, 810, 840, 900, 960, 1020, 1080, 1110, 1170, 1215, 1260, 1290, 1365]

export interface EditProblem { row: number; field: string; message: string }

/** The four editable values of one game, read without needing the team table. */
export interface GameConditions {
  kickoff: number
  temperatureF: number
  weather: number
  windMph: number
}

export function readGameConditions(payload: Buffer, row: number): GameConditions | null {
  const table = seasonGameTable(payload)
  if (!table || row < 0 || row >= table.rows) return null
  const at = table.data + row * 100
  const rd = ([bit, w]: readonly [number, number]) => {
    let v = 0
    for (let b = bit; b < bit + w; b++) v = (v << 1) | ((payload[at + (b >> 3)] >> (7 - (b & 7))) & 1)
    return v
  }
  return {
    kickoff: rd(GAME_BITS.kickoff), temperatureF: rd(GAME_BITS.temperature) - 40,
    weather: rd(GAME_BITS.weather), windMph: rd(GAME_BITS.wind),
  }
}

/** Rejects anything the game's own schema would refuse, before a byte is written. */
export function checkEdits(edits: GameEdit[], rowCount: number): EditProblem[] {
  const out: EditProblem[] = []
  for (const e of edits) {
    if (!Number.isInteger(e.row) || e.row < 0 || e.row >= rowCount) {
      out.push({ row: e.row, field: 'row', message: 'no such game in this save' })
    }
    if (e.kickoff !== undefined && (e.kickoff < 0 || e.kickoff > 2047)) {
      out.push({ row: e.row, field: 'kickoff', message: 'kickoff must be a time of day' })
    }
    if (e.temperatureF !== undefined && (e.temperatureF < -40 || e.temperatureF > 120)) {
      out.push({ row: e.row, field: 'temperature', message: 'the game stores -40°F to 120°F' })
    }
    if (e.weather !== undefined && (e.weather < 0 || e.weather >= WEATHER.length)) {
      // The failure mode this exists to prevent: offering a condition the field
      // cannot hold, which the game rejects outright rather than storing.
      out.push({ row: e.row, field: 'weather', message: `the Weather field only holds ${WEATHER.join(', ')}` })
    }
    if (e.windMph !== undefined && (e.windMph < 0 || e.windMph > 25)) {
      out.push({ row: e.row, field: 'wind', message: 'the game stores 0 to 25 mph' })
    }
  }
  return out
}

function putBits(buf: Buffer, at: number, bit: number, width: number, value: number) {
  for (let i = 0; i < width; i++) {
    const b = bit + i
    const on = (value >> (width - 1 - i)) & 1
    const o = at + (b >> 3), mask = 1 << (7 - (b & 7))
    if (on) buf[o] |= mask; else buf[o] &= ~mask
  }
}

/**
 * Applies edits to a copy of the payload and returns it with the byte offsets
 * the edits were allowed to touch. The caller checks nothing else moved.
 */
export function applyGameEdits(payload: Buffer, edits: GameEdit[]): { next: Buffer; touched: Set<number> } {
  const table = seasonGameTable(payload)
  if (!table) throw new Error('this save has no game table')
  const next = Buffer.from(payload)
  const touched = new Set<number>()
  const fields: [keyof GameEdit, readonly [number, number]][] = [
    ['kickoff', GAME_BITS.kickoff], ['temperatureF', GAME_BITS.temperature],
    ['weather', GAME_BITS.weather], ['windMph', GAME_BITS.wind],
  ]
  for (const e of edits) {
    const at = table.data + e.row * 100
    for (const [name, [bit, width]] of fields) {
      const v = e[name]
      if (v === undefined) continue
      // Temperature is stored with the schema's -40 floor added back on.
      putBits(next, at, bit, width, name === 'temperatureF' ? (v as number) + 40 : (v as number))
      for (let b = bit; b < bit + width; b++) touched.add(at + (b >> 3))
    }
  }
  return { next, touched }
}

/* ------------------------------------------------------------------ write */

export interface WriteResult {
  ok: boolean
  message: string
  backup?: string
  /** Every game row whose values actually changed, for the UI to show back. */
  changed?: { row: number; before: GameConditions; after: GameConditions }[]
}

/** `DYNASTY.sav` → `DYNASTY.sav.2026-09-05T01-00-00.dccbak`, beside the original. */
export function backupPath(path: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')
  return join(dirname(path), `${path.split(/[\\/]/).pop()}.${stamp}.dccbak`)
}

/**
 * The whole write, with every check in front of it.
 *
 * Nothing is written to the save until a rebuilt file has been produced *and*
 * read back *and* decoded, so a failure at any stage leaves the original
 * untouched rather than half-written.
 */
export function writeGameEdits(path: string, edits: GameEdit[]): WriteResult {
  if (!edits.length) return { ok: false, message: 'nothing to change' }

  const file = readFileSync(path)
  const c = readContainer(file)
  if (!c) return { ok: false, message: 'this file is not a save DCC can read' }

  const table = seasonGameTable(c.payload)
  if (!table) return { ok: false, message: 'this save has no game table' }
  const problems = checkEdits(edits, table.rows)
  if (problems.length) {
    return { ok: false, message: problems.map((p) => `${p.field}: ${p.message}`).join('; ') }
  }

  const { next, touched } = applyGameEdits(c.payload, edits)

  // Nothing outside the fields being edited may move. This is what makes a
  // mistake in the bit table a refusal rather than a corrupted save.
  if (next.length !== c.payload.length) return { ok: false, message: 'the edit changed the payload size' }
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== c.payload[i] && !touched.has(i)) {
      return { ok: false, message: `refusing to write: byte 0x${i.toString(16)} changed and should not have` }
    }
  }

  const rebuilt = packContainer(c, next)
  if (!rebuilt) return { ok: false, message: 'the edited save does not compress small enough to fit its file' }

  // Read the rebuilt bytes back the same way the game will.
  const check = readContainer(rebuilt)
  if (!check || !check.payload.equals(next)) {
    return { ok: false, message: 'the rebuilt save did not read back identically; nothing was written' }
  }
  // Verify field by field, reading back the way the game will, and confirm the
  // values that came out are the ones asked for rather than merely different.
  const changed: { row: number; before: GameConditions; after: GameConditions }[] = []
  for (const e of edits) {
    const was = readGameConditions(c.payload, e.row)
    const now = readGameConditions(check.payload, e.row)
    if (!was || !now) return { ok: false, message: `could not read game ${e.row} back` }
    for (const k of ['kickoff', 'temperatureF', 'weather', 'windMph'] as const) {
      const want = k === 'kickoff' ? e.kickoff : k === 'temperatureF' ? e.temperatureF
        : k === 'weather' ? e.weather : e.windMph
      if (want !== undefined && now[k] !== want) {
        return { ok: false, message: `game ${e.row}: ${k} read back as ${now[k]}, not ${want}; nothing was written` }
      }
      if (want === undefined && now[k] !== was[k]) {
        return { ok: false, message: `game ${e.row}: ${k} changed without being asked to; nothing was written` }
      }
    }
    if (JSON.stringify(was) !== JSON.stringify(now)) changed.push({ row: e.row, before: was, after: now })
  }
  if (!changed.length) return { ok: false, message: 'the save already holds those values' }

  const backup = backupPath(path)
  copyFileSync(path, backup)
  // Write beside the original and rename, so a failure mid-write cannot leave
  // a truncated save where the dynasty used to be.
  const tmp = `${path}.dccnew`
  try {
    writeFileSync(tmp, rebuilt)
    renameSync(tmp, path)
  } catch (err) {
    try { unlinkSync(tmp) } catch { /* nothing to clean up */ }
    return { ok: false, message: `could not write the save: ${String((err as Error)?.message ?? err)}`, backup }
  }
  return {
    ok: true,
    message: `updated ${changed.length} game${changed.length === 1 ? '' : 's'}`,
    backup, changed,
  }
}
