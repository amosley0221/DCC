/**
 * The league table, worked out from the games the save has played.
 *
 * The save records results, not standings: there is no table in the file, no
 * poll and no conference record. All of it is derived here, once, from the
 * season's own game rows — so the desktop and the phone can show the same
 * numbers without either inventing them.
 *
 * Pure on purpose. `saveAnalysis.ts` pulls in `node:zlib`, which the renderer
 * cannot load, so anything both sides need lives in a module like this one with
 * no imports at all.
 */

/** One result, from one team's point of view. */
export interface LeagueResult {
  week: number
  opponent: string
  us: number
  them: number
  home: boolean
  won: boolean
  conference: boolean
  postseason: boolean
}

export interface LeagueRow {
  name: string
  conference: string | null
  division: string | null
  wins: number
  losses: number
  confWins: number
  confLosses: number
  pointsFor: number
  pointsAgainst: number
  /** Newest first, so a screen can print a schedule without re-sorting. */
  results: LeagueResult[]
}

export interface LeagueGame {
  week: number
  home: string | null
  away: string | null
  homeScore: number
  awayScore: number
  played: boolean
  postseason: boolean
}

const empty = (name: string, conference: string | null, division: string | null): LeagueRow => ({
  name, conference, division,
  wins: 0, losses: 0, confWins: 0, confLosses: 0,
  pointsFor: 0, pointsAgainst: 0, results: [],
})

/**
 * Every program's season so far.
 *
 * `teams` seeds the table so a program that has not played — or whose games are
 * all still ahead of it — still appears at 0-0 rather than vanishing from its
 * own conference.
 *
 * Bowl games count in the overall record and never in the conference one, which
 * is how the sport counts them.
 */
export function buildLeague(
  games: LeagueGame[],
  teams: { name: string; conference: string | null; division: string | null }[],
): Map<string, LeagueRow> {
  const table = new Map<string, LeagueRow>()
  const confOf = new Map<string, string | null>()
  for (const t of teams) {
    if (!t.name) continue
    table.set(t.name, empty(t.name, t.conference, t.division))
    confOf.set(t.name, t.conference)
  }
  const row = (name: string) => {
    let r = table.get(name)
    if (!r) { r = empty(name, confOf.get(name) ?? null, null); table.set(name, r) }
    return r
  }

  for (const g of games) {
    if (!g.played || !g.home || !g.away) continue
    const h = row(g.home), a = row(g.away)
    const homeWon = g.homeScore > g.awayScore
    const sameConf = !g.postseason && !!h.conference && h.conference === a.conference

    h.pointsFor += g.homeScore; h.pointsAgainst += g.awayScore
    a.pointsFor += g.awayScore; a.pointsAgainst += g.homeScore
    if (homeWon) { h.wins++; a.losses++ } else { h.losses++; a.wins++ }
    if (sameConf) { if (homeWon) { h.confWins++; a.confLosses++ } else { h.confLosses++; a.confWins++ } }

    h.results.push({
      week: g.week, opponent: g.away, us: g.homeScore, them: g.awayScore,
      home: true, won: homeWon, conference: sameConf, postseason: g.postseason,
    })
    a.results.push({
      week: g.week, opponent: g.home, us: g.awayScore, them: g.homeScore,
      home: false, won: !homeWon, conference: sameConf, postseason: g.postseason,
    })
  }

  for (const r of table.values()) r.results.sort((x, y) => y.week - x.week)
  return table
}

export const played = (r: LeagueRow) => r.wins + r.losses
export const winPct = (r: LeagueRow) => (played(r) ? r.wins / played(r) : 0)
export const margin = (r: LeagueRow) =>
  played(r) ? (r.pointsFor - r.pointsAgainst) / played(r) : 0

/**
 * Games a record is credited with before it is believed. Four, so an undefeated
 * team in September is not immediately the best in the country.
 */
const PRIOR = 4

/**
 * A win rate that knows how many games it is standing on.
 *
 * Plain percentage cannot separate 1-0 from 11-0 — both are 1.000 — so an
 * unbeaten week one would sit level with an unbeaten November. Four imaginary
 * games at .500 are added to every record, which a real season quickly drowns
 * out and one game does not.
 */
const settledPct = (r: LeagueRow) =>
  (r.wins + PRIOR / 2) / (played(r) + PRIOR)

/**
 * DCC's own ordering, and it says so wherever it is shown.
 *
 * The save carries no poll — the AP and coaches numbers are not in the file, or
 * are not found yet — so a ranking has to be computed. Record first, because
 * that is what the sport rewards, with scoring margin only as a tie-break
 * between teams that have the same one, and a cap on it so that a 98-0 win over
 * nobody cannot outweigh a second win.
 */
export const power = (r: LeagueRow) =>
  settledPct(r) * 100 + Math.max(-21, Math.min(21, margin(r))) * 0.25

/** Programs strongest first. Unplayed teams sink rather than tie at the top. */
export function rankings(table: Map<string, LeagueRow>): LeagueRow[] {
  return [...table.values()].sort((a, b) =>
    (played(b) ? 1 : 0) - (played(a) ? 1 : 0) ||
    power(b) - power(a) ||
    (b.wins - b.losses) - (a.wins - a.losses) ||
    a.name.localeCompare(b.name))
}

/** The rank a program holds in that ordering, 1-based, or null if it is absent. */
export function rankOf(order: LeagueRow[], name: string | null): number | null {
  if (!name) return null
  const i = order.findIndex((r) => r.name === name)
  return i < 0 ? null : i + 1
}

const confPct = (r: LeagueRow) => {
  const n = r.confWins + r.confLosses
  return n ? r.confWins / n : -1
}

/**
 * Conference by conference, each in its own order: league record first, then
 * overall, which is how a standings page is read.
 *
 * Teams with no conference are dropped rather than gathered into an
 * "independent" bucket — the save leaves the field empty when it has not been
 * read, and a table of everything DCC failed to decode is not a standings page.
 */
export function conferences(table: Map<string, LeagueRow>): [string, LeagueRow[]][] {
  const by = new Map<string, LeagueRow[]>()
  for (const r of table.values()) {
    if (!r.conference) continue
    const l = by.get(r.conference)
    if (l) l.push(r); else by.set(r.conference, [r])
  }
  for (const l of by.values()) {
    l.sort((a, b) =>
      confPct(b) - confPct(a) ||
      winPct(b) - winPct(a) ||
      margin(b) - margin(a) ||
      a.name.localeCompare(b.name))
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

/**
 * The season minus the Saturdays you have not reached.
 *
 * The game simulates the rest of the country ahead of your own game, so a save
 * sitting on week 11 already holds week 11's results for everyone else. A table
 * built from those would spoil a week you have not played. Your own games are
 * never held: you played them.
 *
 * `holdFrom` is the first week with an unplayed game of yours. Pass null — or
 * turn spoilers on — and nothing is held.
 */
export function visibleGames<T extends LeagueGame>(
  games: T[], team: string | null, holdFrom: number | null,
): T[] {
  if (holdFrom === null) return games
  return games.filter((g) =>
    !(g.played && g.week >= holdFrom && g.home !== team && g.away !== team))
}
