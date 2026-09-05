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
import {
  DEPTH_REF_TAG, DEPTH_SLOT_BYTES, DEPTH_SLOT_FIELDS, DEPTH_SLOTS_PER_TEAM,
  GAME_BITS, NIL_BIT, OVERALL_BIT, RATING_BITS, RECORD_BASE, RECORD_STRIDE, REDSHIRT_BIT,
  readDepthCharts, readRoster, seasonGameTable,
} from './saveAnalysis'
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


/* ------------------------------------------------------- player tampering */

/**
 * One player's edited numbers. The index is the player's position in the save's
 * own record array, which is what `readRoster` reports.
 */
export interface PlayerEdit {
  index: number
  overall?: number
  /** Rating name to value, using the names `RATING_BITS` keys. */
  ratings?: Record<string, number>
  /** The redshirt flag — one bit, and the first field this format gave up. */
  redshirt?: boolean
  /** NIL in thousands. Nine bits with a 255 floor, so -255 to 256. */
  nilK?: number
}

/** Ratings and overall are 7-bit fields, so 0 to 99 is the whole usable range. */
const RATING_MIN = 0
const RATING_MAX = 99

export function checkPlayerEdits(edits: PlayerEdit[], playerCount: number): EditProblem[] {
  const out: EditProblem[] = []
  for (const e of edits) {
    if (!Number.isInteger(e.index) || e.index < 0 || e.index >= playerCount) {
      out.push({ row: e.index, field: 'player', message: 'no such player in this save' })
      continue
    }
    const check = (field: string, v: number | undefined) => {
      if (v === undefined) return
      if (!Number.isInteger(v) || v < RATING_MIN || v > RATING_MAX) {
        out.push({ row: e.index, field, message: `must be a whole number from ${RATING_MIN} to ${RATING_MAX}` })
      }
    }
    check('overall', e.overall)
    if (e.nilK !== undefined && (!Number.isInteger(e.nilK) || e.nilK < -255 || e.nilK > 256)) {
      out.push({ row: e.index, field: 'nilK', message: 'the field holds -255 to 256 (in thousands)' })
    }
    for (const [name, v] of Object.entries(e.ratings ?? {})) {
      if (!(name in RATING_BITS)) { out.push({ row: e.index, field: name, message: 'not a rating DCC can place' }); continue }
      check(name, v)
    }
  }
  return out
}

/**
 * The overall and ratings of one player, read back the way the game will.
 *
 * The player-record constants name the *last* bit of a field, not the first —
 * `readRoster` reads `[end - width + 1, end]` — so a writer that treated them as
 * start positions would land seven bits into the neighbouring field. It would
 * also pass its own verification, because it would read back the same wrong
 * place, which is why this convention is spelled out here rather than assumed.
 */
const PLAYER_FIELD_WIDTH = 7
const startOf = (endBit: number) => endBit - PLAYER_FIELD_WIDTH + 1

export function readPlayerNumbers(
  payload: Buffer, index: number,
): { overall: number; ratings: Record<string, number>; redshirt: boolean; nilK: number } | null {
  const at = (RECORD_BASE + index) * RECORD_STRIDE
  if (at + RECORD_STRIDE > payload.length) return null
  const rd = (endBit: number) => {
    let v = 0
    for (let b = startOf(endBit); b <= endBit; b++) v = (v << 1) | ((payload[at + (b >> 3)] >> (7 - (b & 7))) & 1)
    return v
  }
  const ratings: Record<string, number> = {}
  for (const [name, bit] of Object.entries(RATING_BITS)) ratings[name] = rd(bit)
  const bit = (b: number, w: number) => {
    let v = 0
    for (let i = b; i < b + w; i++) v = (v << 1) | ((payload[at + (i >> 3)] >> (7 - (i & 7))) & 1)
    return v
  }
  return {
    overall: rd(OVERALL_BIT), ratings,
    redshirt: bit(REDSHIRT_BIT, 1) === 1,
    nilK: bit(NIL_BIT, 9) - 255,
  }
}

export function applyPlayerEdits(payload: Buffer, edits: PlayerEdit[]): { next: Buffer; touched: Set<number> } {
  const next = Buffer.from(payload)
  const touched = new Set<number>()
  for (const e of edits) {
    const at = (RECORD_BASE + e.index) * RECORD_STRIDE
    const write = (endBit: number, value: number) => {
      const start = startOf(endBit)
      putBits(next, at, start, PLAYER_FIELD_WIDTH, value)
      for (let b = start; b <= endBit; b++) touched.add(at + (b >> 3))
    }
    if (e.overall !== undefined) write(OVERALL_BIT, e.overall)
    for (const [name, v] of Object.entries(e.ratings ?? {})) {
      const bit = RATING_BITS[name]
      if (bit !== undefined) write(bit, v)
    }
    // These two are their own widths rather than the seven-bit rating field.
    if (e.redshirt !== undefined) {
      putBits(next, at, REDSHIRT_BIT, 1, e.redshirt ? 1 : 0)
      touched.add(at + (REDSHIRT_BIT >> 3))
    }
    if (e.nilK !== undefined) {
      putBits(next, at, NIL_BIT, 9, e.nilK + 255)
      for (let b = NIL_BIT; b < NIL_BIT + 9; b++) touched.add(at + (b >> 3))
    }
  }
  return { next, touched }
}

export interface PlayerWriteResult {
  ok: boolean
  message: string
  backup?: string
  changed?: { index: number; field: string; before: number; after: number }[]
}

/**
 * Writes player edits, with the same refusals the schedule writer uses: nothing
 * outside the edited fields may move, the rebuilt file must read back
 * identically, and every field must come back as the value asked for.
 *
 * Ratings share a record with fields DCC has not placed, so the "nothing else
 * moved" check is doing real work here — a wrong bit position would land in a
 * neighbouring field and be refused rather than written.
 */
export function writePlayerEdits(path: string, edits: PlayerEdit[], playerCount: number): PlayerWriteResult {
  if (!edits.length) return { ok: false, message: 'nothing to change' }
  const file = readFileSync(path)
  const c = readContainer(file)
  if (!c) return { ok: false, message: 'this file is not a save DCC can read' }

  const problems = checkPlayerEdits(edits, playerCount)
  if (problems.length) return { ok: false, message: problems.map((p) => `${p.field}: ${p.message}`).join('; ') }

  const { next, touched } = applyPlayerEdits(c.payload, edits)
  if (next.length !== c.payload.length) return { ok: false, message: 'the edit changed the payload size' }
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== c.payload[i] && !touched.has(i)) {
      return { ok: false, message: `refusing to write: byte 0x${i.toString(16)} changed and should not have` }
    }
  }

  const rebuilt = packContainer(c, next)
  if (!rebuilt) return { ok: false, message: 'the edited save does not compress small enough to fit its file' }
  const check = readContainer(rebuilt)
  if (!check || !check.payload.equals(next)) {
    return { ok: false, message: 'the rebuilt save did not read back identically; nothing was written' }
  }

  const changed: { index: number; field: string; before: number; after: number }[] = []
  for (const e of edits) {
    const was = readPlayerNumbers(c.payload, e.index)
    const now = readPlayerNumbers(check.payload, e.index)
    if (!was || !now) return { ok: false, message: `could not read player ${e.index} back` }
    const wanted = new Map<string, number>()
    if (e.overall !== undefined) wanted.set('overall', e.overall)
    for (const [n, v] of Object.entries(e.ratings ?? {})) wanted.set(n, v)
    for (const [field, want] of wanted) {
      const got = field === 'overall' ? now.overall : now.ratings[field]
      if (got !== want) return { ok: false, message: `player ${e.index}: ${field} read back as ${got}, not ${want}; nothing was written` }
      const before = field === 'overall' ? was.overall : was.ratings[field]
      if (before !== got) changed.push({ index: e.index, field, before, after: got })
    }
    // The two fields that are not seven-bit ratings, verified the same way.
    for (const [field, want, before, after] of [
      ['redshirt', e.redshirt, was.redshirt, now.redshirt],
      ['nilK', e.nilK, was.nilK, now.nilK],
    ] as [string, unknown, unknown, unknown][]) {
      if (want !== undefined) {
        if (after !== want) {
          return { ok: false, message: `player ${e.index}: ${field} read back as ${after}, not ${want}; nothing was written` }
        }
        if (before !== after) changed.push({ index: e.index, field, before: Number(before), after: Number(after) })
      } else if (before !== after) {
        return { ok: false, message: `player ${e.index}: ${field} changed without being asked to; nothing was written` }
      }
    }

    // Every field not named must be exactly as it was.
    if (!wanted.has('overall') && was.overall !== now.overall) {
      return { ok: false, message: `player ${e.index}: overall changed without being asked to; nothing was written` }
    }
    for (const n of Object.keys(was.ratings)) {
      if (!wanted.has(n) && was.ratings[n] !== now.ratings[n]) {
        return { ok: false, message: `player ${e.index}: ${n} changed without being asked to; nothing was written` }
      }
    }
  }
  if (!changed.length) return { ok: false, message: 'the save already holds those values' }

  const backup = backupPath(path)
  copyFileSync(path, backup)
  const tmp = `${path}.dccnew`
  try {
    writeFileSync(tmp, rebuilt)
    renameSync(tmp, path)
  } catch (err) {
    try { unlinkSync(tmp) } catch { /* nothing to clean up */ }
    return { ok: false, message: `could not write the save: ${String((err as Error)?.message ?? err)}`, backup }
  }
  return { ok: true, message: `updated ${changed.length} value${changed.length === 1 ? '' : 's'}`, backup, changed }
}

// ── the depth chart ───────────────────────────────────────────────────────────

export interface DepthEdit {
  /** The team's block in the depth chart region. */
  block: number
  /** 0-34, indexing DEPTH_SLOTS. */
  slot: number
  /** Roster rows in the order they should sit, first string first. */
  rows: number[]
}

export interface DepthWriteResult {
  ok: boolean
  message: string
  backup?: string
  changed?: { block: number; slot: number; before: number[]; after: number[] }[]
}

/**
 * Rewrites depth chart slots.
 *
 * A slot is a fixed 24 bytes, so a reorder is a rewrite of the same span and
 * never moves anything: the six fields are written from the front and the tail
 * is zeroed. The edit is refused rather than truncated if it carries more names
 * than a slot can hold.
 */
export function applyDepthEdits(
  payload: Buffer,
  edits: DepthEdit[],
  base: number,
): { next: Buffer; touched: Set<number> } {
  const next = Buffer.from(payload)
  const touched = new Set<number>()
  for (const e of edits) {
    const at = base + (e.block * DEPTH_SLOTS_PER_TEAM + e.slot) * DEPTH_SLOT_BYTES
    for (let k = 0; k < DEPTH_SLOT_FIELDS; k++) {
      const o = at + k * 4
      const row = e.rows[k]
      if (row === undefined) { next.writeUInt32BE(0, o) } else {
        next.writeUInt16BE(DEPTH_REF_TAG, o)
        next.writeUInt16BE(row, o + 2)
      }
      for (let b = 0; b < 4; b++) touched.add(o + b)
    }
  }
  return { next, touched }
}

export function writeDepthEdits(path: string, edits: DepthEdit[]): DepthWriteResult {
  if (!edits.length) return { ok: false, message: 'nothing to change' }
  for (const e of edits) {
    if (e.rows.length > DEPTH_SLOT_FIELDS) {
      return { ok: false, message: `a slot holds at most ${DEPTH_SLOT_FIELDS} players; slot ${e.slot} was given ${e.rows.length}` }
    }
    if (new Set(e.rows).size !== e.rows.length) {
      return { ok: false, message: `slot ${e.slot} lists the same player twice` }
    }
    if (e.rows.some((r) => !Number.isInteger(r) || r < 0 || r > 0xffff)) {
      return { ok: false, message: `slot ${e.slot} has a player row outside the table` }
    }
  }

  const file = readFileSync(path)
  const c = readContainer(file)
  if (!c) return { ok: false, message: 'this file is not a save DCC can read' }

  const rows = new Set(readRoster(c.payload).map((p) => p.index))
  const charts = readDepthCharts(c.payload, rows)
  if (!charts) return { ok: false, message: 'this save has no depth chart DCC can find' }
  // The reader hands back where every slot starts, so the writer never
  // recomputes the region and the two cannot disagree about it.
  const base = charts[0].slots[0].offset

  for (const e of edits) {
    if (!charts[e.block]) return { ok: false, message: `there is no team block ${e.block}` }
    if (e.slot < 0 || e.slot >= DEPTH_SLOTS_PER_TEAM) return { ok: false, message: `there is no slot ${e.slot}` }
    const was = charts[e.block].slots[e.slot].rows
    // Reordering is safe because it cannot put a player somewhere the game did
    // not already have them. Adding or removing names is a different edit and
    // is not what this writes.
    if ([...was].sort().join() !== [...e.rows].sort().join()) {
      return { ok: false, message: `slot ${e.slot} of block ${e.block}: this writes a reorder, not a change of who is in the slot` }
    }
  }

  const { next, touched } = applyDepthEdits(c.payload, edits, base)
  if (next.length !== c.payload.length) return { ok: false, message: 'the edit changed the payload size' }
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== c.payload[i] && !touched.has(i)) {
      return { ok: false, message: `refusing to write: byte 0x${i.toString(16)} changed and should not have` }
    }
  }

  const rebuilt = packContainer(c, next)
  if (!rebuilt) return { ok: false, message: 'the edited save does not compress small enough to fit its file' }
  const check = readContainer(rebuilt)
  if (!check || !check.payload.equals(next)) {
    return { ok: false, message: 'the rebuilt save did not read back identically; nothing was written' }
  }

  // Read every chart back the way the game will, and confirm the slots asked
  // for hold what was asked and no other slot moved at all.
  const after = readDepthCharts(check.payload, rows)
  if (!after) return { ok: false, message: 'the rebuilt save no longer has a readable depth chart; nothing was written' }
  const asked = new Map(edits.map((e) => [`${e.block}:${e.slot}`, e.rows]))
  const changed: { block: number; slot: number; before: number[]; after: number[] }[] = []
  for (let b = 0; b < charts.length; b++) {
    for (let s = 0; s < DEPTH_SLOTS_PER_TEAM; s++) {
      const was = charts[b].slots[s].rows
      const now = after[b].slots[s].rows
      const want = asked.get(`${b}:${s}`)
      if (want) {
        if (now.join() !== want.join()) {
          return { ok: false, message: `slot ${s} of block ${b} read back as ${now.join(',')}, not ${want.join(',')}; nothing was written` }
        }
        if (was.join() !== now.join()) changed.push({ block: b, slot: s, before: was, after: now })
      } else if (was.join() !== now.join()) {
        return { ok: false, message: `slot ${s} of block ${b} changed without being asked to; nothing was written` }
      }
    }
  }
  if (!changed.length) return { ok: false, message: 'the save already holds that order' }

  const backup = backupPath(path)
  copyFileSync(path, backup)
  const tmp = `${path}.dccnew`
  try {
    writeFileSync(tmp, rebuilt)
    renameSync(tmp, path)
  } catch (err) {
    try { unlinkSync(tmp) } catch { /* nothing to clean up */ }
    return { ok: false, message: `could not write the save: ${String((err as Error)?.message ?? err)}`, backup }
  }
  return { ok: true, message: `reordered ${changed.length} slot${changed.length === 1 ? '' : 's'}`, backup, changed }
}
