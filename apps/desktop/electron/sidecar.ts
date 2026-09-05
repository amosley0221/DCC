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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { emptyLedger, moves, LEDGER_VERSION } from './transfers'
import type { Ledger } from './transfers'
import { standing } from './tamper'
import type { TamperTurn } from './tamper'
import { TEAM_ID_NAMES } from './teamIds'
import type { SnapshotMove, SnapshotThread } from './snapshot'

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

const ledgerFile = () => join(app.getPath('userData'), 'transfers.json')
const tamperFile = () => join(app.getPath('userData'), 'tampering.json')

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
    schoolColors: schoolColorCache,
    champions: [...champions],
  }
}
