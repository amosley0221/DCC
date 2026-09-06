/**
 * The two things DCC keeps beside the save rather than in it.
 *
 * The transfer ledger needs two seasons of rosters to say anything, and the
 * tampering threads are conversations the user had. Neither can be rebuilt from
 * the current dynasty file — last season's roster is gone the moment the season
 * turns — so both live in userData, where an in-place upgrade cannot touch them.
 *
 * They are here rather than in `main.ts` because the snapshot carries them to
 * the phone, and the snapshot is built in two places: the export the user saves
 * to a file, and the relay serving it over the network. Both need the same
 * answer, so both ask this.
 */
import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { emptyLedger, moves, LEDGER_VERSION } from './transfers'
import type { Ledger } from './transfers'
import { emptyRecruitLedger, RECRUIT_LEDGER_VERSION } from './recruitLedger'
import type { RecruitEvent, RecruitLedger } from './recruitLedger'
import { standing } from './tamper'
import type { TamperTurn } from './tamper'
import { TEAM_ID_NAMES } from './teamIds'
import type { SnapshotHeisman, SnapshotMove, SnapshotThread } from './snapshot'

export interface TamperThread {
  key: string
  first: string
  last: string
  position: string
  overall: number
  team: string
  interest: number
  resistance: number
  because: string[]
  mood: string
  committed: boolean
  openedSeason: number | null
  openedWeek: number | null
  turns: TamperTurn[]
}

export interface TamperFile { version: number; threads: Record<string, TamperThread> }

/**
 * A press story the user paid for, with enough about the game to show it again
 * without re-reading the save.
 */
export interface StoredStory {
  headline: string
  standfirst: string
  body: string
  kind: 'preview' | 'recap'
  /** When it was written, so a list can be ordered newest first. */
  written: string
  home: string | null
  away: string | null
  week: number
}

export interface PressFile { version: number; stories: Record<string, StoredStory> }

/**
 * The key a story is filed under: the season and the game's row.
 *
 * A row is the only stable id a game has, and it is only unique within a
 * season — row 12 is a different fixture next year — so the season goes in
 * front of it.
 */
export const storyKey = (season: number | null, row: number) => `${season ?? 0}:${row}`

/** Settings live in userData so they survive every in-place upgrade. */
const settingsFile = () => join(app.getPath('userData'), 'settings.json')

export function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(settingsFile(), 'utf8'))
  } catch {
    return {}
  }
}

export function writeSettings(next: Record<string, unknown>) {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(settingsFile(), JSON.stringify(next, null, 2))
}

/**
 * The colours last read out of the school logos.
 *
 * Held rather than recomputed: they come from decoding a hundred and forty
 * PNGs, the renderer already asks for them when it indexes the art folder, and
 * the snapshot needs the same answer.
 */
let schoolColorCache: Record<string, string> = {}
export const rememberSchoolColors = (c: Record<string, string>) => { schoolColorCache = c }

/**
 * Who won each season, last time a save was read.
 *
 * Kept for the same reason as the colours: the snapshot has to carry it, and
 * the roster pass is where it comes from.
 */
let titleCache: { season: number; champion: string | null; runnerUp: string | null }[] = []
export const rememberTitles = (t: typeof titleCache) => { titleCache = t }
export const readTitles = () => titleCache

/**
 * The art pack, last time one was built — as a file on disk.
 *
 * Not in memory: a pack of every face in the country is a few hundred
 * megabytes, and holding it for the length of a session so the relay can hand
 * it over is not a trade worth making. The relay streams it from here instead.
 *
 * The previous one is deleted when a new one replaces it, so a session of
 * rebuilds does not fill the temp folder.
 */
let packFile: { file: string; bytes: number } | null = null

export function rememberPack(file: string, bytes: number) {
  if (packFile && packFile.file !== file) {
    try { rmSync(packFile.file, { force: true }) } catch { /* it is a temp file */ }
  }
  packFile = { file, bytes }
}

export const readPack = () => (packFile && existsSync(packFile.file) ? packFile : null)

/**
 * The ranking the user picked out of their save, and the Heisman five.
 *
 * Held like the titles and the colours: the roster pass is where they come
 * from, and the snapshot has to carry them to the phone so both apps show the
 * game's own numbers rather than each computing an opinion.
 */
let rankCache: Record<string, number> = {}
let heismanCache: SnapshotHeisman[] = []
export const rememberRanks = (r: Record<string, number>) => { rankCache = r }
export const rememberHeisman = (h: SnapshotHeisman[]) => { heismanCache = h }

const ledgerFile = () => join(app.getPath('userData'), 'transfers.json')
const tamperFile = () => join(app.getPath('userData'), 'tampering.json')
const pressFile = () => join(app.getPath('userData'), 'press.json')
const recruitFile = () => join(app.getPath('userData'), 'recruiting.json')

export function readLedger(): Ledger {
  try {
    const l = JSON.parse(readFileSync(ledgerFile(), 'utf8')) as Ledger
    if (!l || typeof l !== 'object' || !Array.isArray(l.records)) return emptyLedger()
    return { version: LEDGER_VERSION, latestYear: l.latestYear ?? null, records: l.records }
  } catch {
    return emptyLedger()
  }
}

export function writeLedger(next: Ledger) {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(ledgerFile(), JSON.stringify(next))
}

/**
 * The stories written so far.
 *
 * These live beside the save for the same reason the tampering threads do, and
 * one more: every story costs the user's own API credit. Losing one to a change
 * of screen is losing money, which is what this fixes.
 */
export function readStories(): PressFile {
  try {
    const f = JSON.parse(readFileSync(pressFile(), 'utf8')) as PressFile
    if (!f || typeof f !== 'object' || !f.stories) return { version: 1, stories: {} }
    return { version: 1, stories: f.stories }
  } catch {
    return { version: 1, stories: {} }
  }
}

export function writeStories(next: PressFile) {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(pressFile(), JSON.stringify(next, null, 2))
}

/** Files one story and returns the whole set, so a caller needs one round trip. */
export function fileStory(key: string, story: StoredStory): PressFile {
  const f = readStories()
  f.stories[key] = story
  writeStories(f)
  return f
}

/** Throws one away. The user paid for it, so only they can decide it is wrong. */
export function forgetStory(key: string): PressFile {
  const f = readStories()
  delete f.stories[key]
  writeStories(f)
  return f
}

/**
 * What the board looked like the last time DCC read a save.
 *
 * Kept for the same reason the transfer ledger is: a commitment is news by
 * changing, and one save cannot tell you what changed. See recruitLedger.ts.
 */
export function readRecruitLedger(): RecruitLedger {
  try {
    const f = JSON.parse(readFileSync(recruitFile(), 'utf8')) as RecruitLedger
    if (!f || typeof f !== 'object' || !f.seen || !Array.isArray(f.events)) return emptyRecruitLedger()
    return { version: RECRUIT_LEDGER_VERSION, seen: f.seen, events: f.events }
  } catch {
    return emptyRecruitLedger()
  }
}

export function writeRecruitLedger(next: RecruitLedger) {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(recruitFile(), JSON.stringify(next, null, 2))
}

export function readThreads(): TamperFile {
  try {
    const f = JSON.parse(readFileSync(tamperFile(), 'utf8')) as TamperFile
    if (!f || typeof f !== 'object' || !f.threads) return { version: 1, threads: {} }
    return { version: 1, threads: f.threads }
  } catch {
    return { version: 1, threads: {} }
  }
}

export function writeThreads(next: TamperFile) {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(tamperFile(), JSON.stringify(next, null, 2))
}

/**
 * Both, shaped for the snapshot.
 *
 * Team ids become names here rather than on the phone: the phone has the team
 * table but not the id-to-name mapping, and a screen that says "team 74" is
 * worse than no screen.
 */
export function snapshotExtras(): {
  transfers: SnapshotMove[]
  threads: SnapshotThread[]
  schoolColors: Record<string, string>
  champions: string[]
  ranks: Record<string, number>
  heisman: SnapshotHeisman[]
  recruitEvents: RecruitEvent[]
} {
  const nameOf = (id: number) => TEAM_ID_NAMES[id] ?? `Team ${id}`
  const transfers: SnapshotMove[] = moves(readLedger()).map((m) => ({
    key: m.key, first: m.first, last: m.last, position: m.position,
    fromSeason: m.fromSeason, toSeason: m.toSeason,
    from: nameOf(m.from), to: nameOf(m.to),
    overallBefore: m.overallBefore, overallAfter: m.overallAfter,
  }))
  const threads: SnapshotThread[] = Object.values(readThreads().threads)
    .map((t) => ({
      key: t.key, first: t.first, last: t.last, position: t.position,
      overall: t.overall, team: t.team,
      interest: t.interest, resistance: t.resistance, because: t.because,
      mood: t.mood, committed: t.committed, standing: standing(t.interest),
      turns: t.turns,
    }))
    .sort((a, b) => b.interest - a.interest)
  // Read out of the save first, then whatever the user has marked by hand for
  // a title the save cannot know about.
  const marked = readSettings().champions
  const champions = new Set<string>(titleCache.map((t) => t.champion).filter((x): x is string => !!x))
  if (Array.isArray(marked)) for (const m of marked) if (typeof m === 'string') champions.add(m)
  return {
    transfers,
    threads,
    // The board's own news, so the phone reports what changed rather than what
    // stands. It cannot work this out itself: only the PC reads saves, so only
    // the PC has a previous read to compare against.
    recruitEvents: readRecruitLedger().events,
    schoolColors: schoolColorCache,
    champions: [...champions],
    ranks: rankCache,
    heisman: heismanCache,
  }
}
