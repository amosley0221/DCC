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

/* ------------------------------------------------------------ the playoff */

export const PLAYOFF_SIZE = 12
/** Conference champions that qualify on their title alone. */
export const PLAYOFF_AUTO_BIDS = 5

export interface PlayoffTeam {
  /** 1 through 12. */
  seed: number
  row: LeagueRow
  /** In on a conference title rather than on the strength of the résumé. */
  champion: boolean
  /** Seeds one to four sit out the first round. */
  bye: boolean
}

export interface PlayoffField {
  teams: PlayoffTeam[]
  /** Conference name to the program leading it. */
  leaders: Map<string, string>
  /** True while this is a projection rather than a bracket the save has played. */
  projected: boolean
}

/**
 * The twelve-team field, projected from the table.
 *
 * The five highest-ranked conference champions are in on their titles; the
 * remaining seven places go to the best of everyone left; and all twelve are
 * then seeded strictly by the ranking, which is the straight-seeding format the
 * sport moved to. Seeds one to four sit out the first round.
 *
 * "Champion" is the program leading its conference, because a conference title
 * game has not been played in November and the save cannot be asked who will
 * win one. Every screen that shows this says it is a projection.
 */
export function projectPlayoff(table: Map<string, LeagueRow>): PlayoffField {
  const order = rankings(table)
  const leaders = new Map<string, string>()
  for (const [name, rows] of conferences(table)) {
    if (rows.length) leaders.set(name, rows[0].name)
  }
  const isLeader = new Set(leaders.values())

  const chosen: { row: LeagueRow; champion: boolean }[] = []
  const taken = new Set<string>()
  for (const r of order) {
    if (chosen.length >= PLAYOFF_AUTO_BIDS) break
    if (!isLeader.has(r.name)) continue
    chosen.push({ row: r, champion: true })
    taken.add(r.name)
  }
  for (const r of order) {
    if (chosen.length >= PLAYOFF_SIZE) break
    if (taken.has(r.name)) continue
    chosen.push({ row: r, champion: false })
    taken.add(r.name)
  }

  // Seeded by the ranking, not by how they got in: a champion ranked eleventh
  // is the eleventh seed.
  const rank = new Map(order.map((r, i) => [r.name, i]))
  chosen.sort((a, b) => (rank.get(a.row.name) ?? 999) - (rank.get(b.row.name) ?? 999))

  return {
    leaders,
    projected: true,
    teams: chosen.map((c, i) => ({
      seed: i + 1, row: c.row, champion: c.champion, bye: i < 4,
    })),
  }
}

/**
 * The bracket, in the order it is drawn top to bottom.
 *
 * Written out rather than derived, because the order is the whole point: a
 * bracket is only readable when a game sits level with the two that feed it.
 * The first round runs 8v9, 5v12, 6v11, 7v10 so that the quarterfinals below
 * read 1, 4, 3, 2 — which puts the 1 and 4 brackets in the top semifinal and
 * the 3 and 2 in the bottom, exactly as the sport seeds it.
 */
export const FIRST_ROUND: [number, number][] = [[8, 9], [5, 12], [6, 11], [7, 10]]

/** Quarterfinals: a bye seed against the winner of the first-round game beside it. */
export const QUARTERFINALS: { seed: number; from: [number, number] }[] = [
  { seed: 1, from: [8, 9] },
  { seed: 4, from: [5, 12] },
  { seed: 3, from: [6, 11] },
  { seed: 2, from: [7, 10] },
]

/** The semifinals, by the bye seed whose quarter feeds each side. */
export const SEMIFINALS: [number, number][] = [[1, 4], [3, 2]]

/**
 * The art key for a conference's championship mark.
 *
 * The game's art names a conference the way a broadcast graphic does —
 * `confchamp__BIG10Championship`, `confchamp__PAC12Championship`,
 * `confchamp__CUSAChampionship` — while the save names it the way a table does,
 * "Big Ten", "Pac-12", "Conference USA". Stripping punctuation settles some of
 * it and the rest is spelled out, the same way the school aliases are.
 */
const CONFERENCE_ART: Record<string, string> = {
  bigten: 'big10', big10: 'big10', b1g: 'big10',
  big12: 'big12', bigxii: 'big12',
  pac12: 'pac12', pacific12: 'pac12',
  sec: 'sec', acc: 'acc', mac: 'mac',
  american: 'american', americanathletic: 'american', aac: 'aac',
  conferenceusa: 'cusa', cusa: 'cusa',
  mountainwest: 'mountainwest', mwc: 'mountainwest',
  sunbelt: 'sunbelt',
}

/** Keys to try, best first. An unknown conference simply has no mark. */
export function conferenceArtKeys(conference: string | null): string[] {
  if (!conference) return []
  const norm = conference.toLowerCase().replace(/[^a-z0-9]/g, '')
  const mapped = CONFERENCE_ART[norm]
  const names = mapped && mapped !== norm ? [mapped, norm] : [norm]
  return names.map((n) => `confchamp:${n}championship`)
}

/**
 * The country in the order the save itself keeps, where it has one.
 *
 * A poll ranks twenty-five and leaves everyone else level, so the ranked teams
 * come first in their own order and the rest fall in behind them by the same
 * arithmetic that would have ordered all of them. Nothing is invented: an
 * unranked team is unranked, and only its position among other unranked teams
 * is DCC's opinion.
 */
export function orderByRanks(
  table: Map<string, LeagueRow>,
  ranks: Record<string, number>,
): LeagueRow[] {
  const fallback = rankings(table)
  const place = new Map(fallback.map((r, i) => [r.name, i]))
  return [...table.values()].sort((a, b) => {
    const ra = ranks[a.name] ?? Infinity
    const rb = ranks[b.name] ?? Infinity
    if (ra !== rb) return ra - rb
    return (place.get(a.name) ?? 0) - (place.get(b.name) ?? 0)
  })
}
