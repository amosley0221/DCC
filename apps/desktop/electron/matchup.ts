/**
 * What a game is *about*, worked out from the season around it.
 *
 * The front page used to headline an upcoming game with "Penn State host USC",
 * which is three failures at once: it is dull, it is wrong — a conference
 * championship is played at a neutral site, so nobody hosts — and it throws
 * away everything that made the fixture worth leading with. The same two teams
 * had already played in week 11. The winner takes the conference. One of them
 * has a man on the Heisman shortlist. All three of those are in the save.
 *
 * Nothing here is invented. A rematch is a game between the same two teams
 * earlier in the same season; a title game is two teams from one conference in
 * the round after the last full Saturday; a contender is a name on the save's
 * own Heisman shortlist. Where a fact is absent the line simply gets shorter.
 *
 * Pure, so both the placeholder headline and the fact sheet the story is
 * written from are built by the same code, and so it can be checked without a
 * save file.
 */

/** Enough of a game to place it in its season. */
export interface MatchGame {
  row: number
  week: number
  home: string | null
  away: string | null
  homeScore: number
  awayScore: number
  played: boolean
  postseason: boolean
}

/** A name on the save's own Heisman shortlist. */
export interface Contender {
  first: string
  last: string
  position: string
  team: string | null
}

export interface MatchupFacts {
  /** The conference whose title is on it, when this is that game. */
  title: string | null
  /** Nobody hosts a conference championship. */
  neutral: boolean
  /** The earlier meeting this season, when there was one. */
  rematch: { week: number; winner: string; loser: string; winnerScore: number; loserScore: number } | null
  homeRank: number | null
  awayRank: number | null
  homeUnbeaten: boolean
  awayUnbeaten: boolean
  /** Shortlisted players on either side, best-placed first. */
  contenders: Contender[]
}

/**
 * The round after the last full Saturday, played between two teams of one
 * conference, is a conference championship.
 *
 * Identified by the collapse in the schedule rather than by a date: an ordinary
 * week has sixty-odd games in it and championship weekend has a dozen. That is
 * a difference no calendar quirk produces, and it does not care which December
 * the game falls in.
 */
const TITLE_ROUND_MAX = 25

export function matchupFacts(opts: {
  game: MatchGame
  games: MatchGame[]
  conferenceOf: (school: string | null) => string | null
  rankOf: (school: string | null) => number | null
  recordOf: (school: string | null) => { wins: number; losses: number } | null
  heisman?: Contender[]
}): MatchupFacts {
  const { game: g, games, conferenceOf, rankOf, recordOf } = opts
  const regular = games.filter((x) => !x.postseason)
  const lastWeek = regular.length ? Math.max(...regular.map((x) => x.week)) : g.week
  const inRound = regular.filter((x) => x.week === g.week).length
  const homeConf = conferenceOf(g.home)
  const awayConf = conferenceOf(g.away)

  const title = !g.postseason && g.week === lastWeek && inRound > 0 && inRound <= TITLE_ROUND_MAX &&
    homeConf && homeConf === awayConf
    ? homeConf
    : null

  // The same two teams, earlier, this season.
  const earlier = games.find((x) =>
    x.row !== g.row && x.played && x.week < g.week &&
    ((x.home === g.home && x.away === g.away) || (x.home === g.away && x.away === g.home)))
  const rematch = earlier
    ? (() => {
        const homeWon = earlier.homeScore > earlier.awayScore
        return {
          week: earlier.week,
          winner: (homeWon ? earlier.home : earlier.away) ?? '',
          loser: (homeWon ? earlier.away : earlier.home) ?? '',
          winnerScore: Math.max(earlier.homeScore, earlier.awayScore),
          loserScore: Math.min(earlier.homeScore, earlier.awayScore),
        }
      })()
    : null

  const unbeaten = (n: string | null) => {
    const r = recordOf(n)
    return !!r && r.losses === 0 && r.wins > 0
  }
  const contenders = (opts.heisman ?? []).filter((p) => p.team === g.home || p.team === g.away)

  return {
    title,
    neutral: title !== null,
    rematch,
    homeRank: rankOf(g.home),
    awayRank: rankOf(g.away),
    homeUnbeaten: unbeaten(g.home),
    awayUnbeaten: unbeaten(g.away),
    contenders,
  }
}

const withRank = (name: string | null, rank: number | null) =>
  rank && rank <= 25 ? `No. ${rank} ${name}` : (name ?? 'TBD')

/**
 * The line the page leads with before anybody asks for a story.
 *
 * Ordered by what actually makes a game matter: a conference on the line, then
 * a rematch, then two ranked sides, then an unbeaten record, and only at the
 * end the bare fixture. It stays a headline — short, no colon, no subtitle —
 * and everything that supports it goes in the standfirst underneath.
 */
export function matchupHeadline(g: MatchGame, f: MatchupFacts, userTeam?: string | null): string {
  const home = g.home ?? 'TBD'
  const away = g.away ?? 'TBD'
  // The reader's own team leads the sentence; otherwise the better team does.
  const [first, second] = userTeam === away ? [away, home]
    : userTeam === home ? [home, away]
    : (f.awayRank ?? 999) < (f.homeRank ?? 999) ? [away, home] : [home, away]

  if (f.title) {
    if (f.rematch) return `${first} and ${second} again, for the ${f.title}`
    return `${first} and ${second} for the ${f.title}`
  }
  if (g.postseason) return `${first} meet ${second} in the postseason`
  if (f.rematch) return `${first} and ${second}, again`

  const firstRank = first === home ? f.homeRank : f.awayRank
  const secondRank = second === home ? f.homeRank : f.awayRank
  if (firstRank && firstRank <= 25 && secondRank && secondRank <= 25) {
    return `${withRank(first, firstRank)} meet ${withRank(second, secondRank)}`
  }
  const firstUnbeaten = first === home ? f.homeUnbeaten : f.awayUnbeaten
  if (firstUnbeaten) return `Unbeaten ${first} take on ${second}`
  return `${first} ${g.home === first ? 'host' : 'travel to'} ${second}`
}

/** The sentence under the headline: what is riding on it, and what came before. */
export function matchupStandfirst(g: MatchGame, f: MatchupFacts): string {
  const bits: string[] = []
  if (f.title) bits.push(`The ${f.title} goes to the winner.`)
  if (f.rematch) {
    bits.push(`${f.rematch.winner} won the first ${f.rematch.winnerScore}-${f.rematch.loserScore} ` +
      `in week ${f.rematch.week}.`)
  }
  const unbeaten = [
    f.homeUnbeaten ? g.home : null,
    f.awayUnbeaten ? g.away : null,
  ].filter(Boolean)
  if (unbeaten.length === 1) bits.push(`${unbeaten[0]} have not lost.`)
  else if (unbeaten.length === 2) bits.push('Neither has lost.')
  const c = f.contenders[0]
  if (c) bits.push(`${c.first} ${c.last} is on the Heisman shortlist.`)
  return bits.join(' ')
}

/**
 * The same context, as lines for the fact sheet a story is written from.
 *
 * Without these the model was handed a date, a kickoff and the weather, and
 * wrote what you would expect from that. The point of the fixture — a title, a
 * rematch, a man in the Heisman race — was never in front of it.
 */
export function matchupLines(g: MatchGame, f: MatchupFacts): string[] {
  const out: string[] = []
  if (f.title) {
    out.push(`This is the ${f.title} championship game, played at a neutral site. ` +
      'Neither team is at home. The conference title goes to the winner.')
  }
  if (f.rematch) {
    out.push(`These teams already met this season: ${f.rematch.winner} beat ${f.rematch.loser} ` +
      `${f.rematch.winnerScore}-${f.rematch.loserScore} in week ${f.rematch.week}.`)
  }
  if (f.homeRank && f.homeRank <= 25) out.push(`${g.home} are ranked ${f.homeRank}.`)
  if (f.awayRank && f.awayRank <= 25) out.push(`${g.away} are ranked ${f.awayRank}.`)
  if (f.homeUnbeaten) out.push(`${g.home} are unbeaten.`)
  if (f.awayUnbeaten) out.push(`${g.away} are unbeaten.`)
  for (const c of f.contenders.slice(0, 3)) {
    out.push(`${c.first} ${c.last} (${c.position}, ${c.team}) is on the save's Heisman shortlist.`)
  }
  return out
}
