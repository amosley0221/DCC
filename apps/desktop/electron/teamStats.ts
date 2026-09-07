/**
 * A team's statistics for one game, out of the save's `TeamStats` store.
 *
 * Every played game's row in `SeasonGameStore` carries two references tagged
 * `0x2024` — one four bytes behind each team reference — and each points at an
 * 80-byte row here. The row is plain 16-bit big-endian words, and the fields
 * below were read off a real box score: Penn State 42, USC 17 in the Big Ten
 * championship, which is row 985 against row 997.
 *
 * Two things the decoding turns on:
 *
 * The top bit of a word is a marker, not part of the number, so a value is the
 * low fifteen bits — and those are signed. Rushing yards go negative when a
 * team loses more to sacks than it gains on the ground, which is how college
 * football counts it, and reading them unsigned turns a quiet -1 into 32,767.
 * Across 908 played games total offence equals rushing plus passing in all
 * 1,816 rows once the sign is respected, and in none of them without it.
 *
 * Time of possession is the field that proves the rest. Word 16 reads 845 for
 * Penn State and 595 for USC; 595 seconds is the 9:55 on the screen, and the
 * two sum to 24:00, which is four six-minute quarters. Nothing else in the row
 * would land on both halves of that by accident.
 */
export interface TeamGameStats {
  /** Row in the team table, which `teamTableOrder` names. */
  teamIndex: number
  /** Row in `SeasonGameStore`. */
  gameIndex: number
  won: boolean
  firstDowns: number
  rushYards: number
  passYards: number
  /** Rushing plus passing, as the box score's "total offense". */
  totalOffense: number
  /** Offence plus return yards, as the box score's "total yards". */
  totalYards: number
  passYardsAllowed: number
  rushYardsAllowed: number
  thirdDownConversions: number
  thirdDownAttempts: number
  kickReturnYards: number
  puntReturnYards: number
  penaltyYards: number
  /** Seconds of possession. A shortened quarter makes the two sides sum below 3,600. */
  possessionSeconds: number
}

/**
 * A stat line as it reaches a client: named by school rather than by table row,
 * so a screen can read it without holding the team table.
 */
export interface TeamGameStatsView extends TeamGameStats {
  school: string
}

/** Word index in an 80-byte row for each field that has been placed. */
export const TEAM_STAT_WORDS = {
  result: 2,
  totalYards: 6,
  kickReturnYards: 7,
  thirdDownConversions: 8,
  thirdDownAttempts: 9,
  rushYards: 10,
  passYards: 11,
  totalOffense: 12,
  passYardsAllowed: 13,
  rushYardsAllowed: 14,
  firstDowns: 15,
  possessionSeconds: 16,
  puntReturnYards: 17,
  penaltyYards: 19,
} as const

/** The row's marker bit off, and the fifteen bits under it read as signed. */
export function statValue(word: number): number {
  const v = word & 0x7fff
  return v & 0x4000 ? v - 0x8000 : v
}

/** A win reads 1 and a loss 3; anything else is left as not won. */
export function wonFrom(word: number): boolean {
  return statValue(word) === 1
}

/** A team's totals across the games it has played. */
export interface TeamSeasonStats {
  teamIndex: number
  games: number
  rushYards: number
  passYards: number
  totalOffense: number
  totalYards: number
  passYardsAllowed: number
  rushYardsAllowed: number
  yardsAllowed: number
  firstDowns: number
  thirdDownConversions: number
  thirdDownAttempts: number
  penaltyYards: number
  possessionSeconds: number
}

export function seasonTotals(games: TeamGameStats[]): TeamSeasonStats[] {
  const by = new Map<number, TeamSeasonStats>()
  for (const g of games) {
    let t = by.get(g.teamIndex)
    if (!t) {
      t = {
        teamIndex: g.teamIndex, games: 0, rushYards: 0, passYards: 0, totalOffense: 0,
        totalYards: 0, passYardsAllowed: 0, rushYardsAllowed: 0, yardsAllowed: 0,
        firstDowns: 0, thirdDownConversions: 0, thirdDownAttempts: 0, penaltyYards: 0,
        possessionSeconds: 0,
      }
      by.set(g.teamIndex, t)
    }
    t.games += 1
    t.rushYards += g.rushYards
    t.passYards += g.passYards
    t.totalOffense += g.totalOffense
    t.totalYards += g.totalYards
    t.passYardsAllowed += g.passYardsAllowed
    t.rushYardsAllowed += g.rushYardsAllowed
    t.yardsAllowed += g.passYardsAllowed + g.rushYardsAllowed
    t.firstDowns += g.firstDowns
    t.thirdDownConversions += g.thirdDownConversions
    t.thirdDownAttempts += g.thirdDownAttempts
    t.penaltyYards += g.penaltyYards
    t.possessionSeconds += g.possessionSeconds
  }
  return [...by.values()]
}

/** Per game rather than per season, so teams that have played fewer games compare fairly. */
export function perGame(total: number, games: number): number {
  return games > 0 ? total / games : 0
}

export type StatLeaderKey =
  | 'totalOffense' | 'rushYards' | 'passYards' | 'yardsAllowed' | 'totalYards'

export interface StatLeader {
  teamIndex: number
  value: number
  games: number
}

/**
 * The teams at the top of one category, per game.
 *
 * Yards allowed sorts the other way — fewest is best — and a team with no games
 * played is left out rather than sorted to the front on a zero.
 */
export function leaders(
  totals: TeamSeasonStats[],
  key: StatLeaderKey,
  count = 5,
): StatLeader[] {
  const rows = totals
    .filter((t) => t.games > 0)
    .map((t) => ({ teamIndex: t.teamIndex, games: t.games, value: perGame(t[key], t.games) }))
  const ascending = key === 'yardsAllowed'
  rows.sort((a, b) => (ascending ? a.value - b.value : b.value - a.value))
  return rows.slice(0, count)
}

/** `845` reads as `14:05`. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** `3 of 8` reads as `38%`, and no attempts reads as a dash rather than a zero. */
export function rate(made: number, attempts: number): string {
  return attempts > 0 ? `${Math.round((100 * made) / attempts)}%` : '—'
}
