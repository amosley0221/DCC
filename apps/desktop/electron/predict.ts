import { LeagueRow, power, played, FIRST_ROUND, QUARTERFINALS, SEMIFINALS } from './league'

/**
 * Who is favoured in a game that has not been played.
 *
 * DCC's own estimate, not the game's. The save holds no line, no win
 * probability and no simulation to ask, so this is arithmetic over what has
 * already been read, and it is labelled as an estimate everywhere it is shown.
 * A number that looks like the game's own and is not would be worse than no
 * number at all.
 *
 * It rests on `power`, the same score that orders the rankings screen, rather
 * than on rank, record and margin separately: `power` is already built from
 * record and margin, so feeding those in again beside it would count the same
 * evidence three times and make every mismatch look like a rout.
 *
 * The one thing worth adding beside it is the game's own poll, when the user
 * has pointed DCC at a poll column. That is not the same evidence twice: a poll
 * knows who a team played, and `power` — which sees only wins, losses and
 * points — cannot tell an unbeaten schedule of nobody from an unbeaten schedule
 * of everybody. Where both are known they are weighed equally; where the poll
 * is absent, `power` answers alone.
 */
export interface Prediction {
  favourite: string
  underdog: string
  /** Points, rounded, never below 1 — a favourite by nothing is not a favourite. */
  margin: number
  /** For wording, not arithmetic. */
  confidence: 'slight' | 'clear' | 'heavy'
  /** True when the two are close enough that naming a favourite is a coin toss. */
  tossUp: boolean
}

/**
 * Points per unit of `power`.
 *
 * `power` runs from about 50 for a .500 team to about 88 for an unbeaten one,
 * so this puts a perfect season against a mediocre one at roughly seventeen
 * points, which is about what that game looks like.
 */
const POINTS_PER_UNIT = 0.45

/** Home advantage, in points. Nil at a neutral site, which is most of the postseason. */
const HOME_EDGE = 2.0

/** Beyond this the estimate stops being a guess and starts being a fantasy. */
const MAX_MARGIN = 35

/**
 * Where a team the poll left out is treated as sitting.
 *
 * Just outside it, rather than level with it, so that being ranked 25th still
 * counts for something against a team that is not ranked at all — and not far
 * outside, because the poll genuinely has no opinion about the gap between the
 * 40th best team and the 90th.
 */
const UNRANKED_PLACE = 30

/** Points per place in the poll: #1 against #25 comes out around two and a half scores. */
const POINTS_PER_PLACE = 0.7

/** How far apart two poll places can be before the extra distance stops meaning anything. */
const MAX_PLACE_GAP = 29

/**
 * The poll's view of the two, in points, or null when it has no view of either.
 *
 * A poll that ranks neither team says nothing about the game, and treating both
 * as equally unranked would drag a genuine mismatch back towards even.
 */
function pollGap(homePlace: number | null, awayPlace: number | null): number | null {
  const ranked = (p: number | null) => p !== null && p >= 1 && p <= 25
  if (!ranked(homePlace) && !ranked(awayPlace)) return null
  const h = ranked(homePlace) ? (homePlace as number) : UNRANKED_PLACE
  const a = ranked(awayPlace) ? (awayPlace as number) : UNRANKED_PLACE
  // Lower place is better, so the away number leads.
  const places = Math.max(-MAX_PLACE_GAP, Math.min(MAX_PLACE_GAP, a - h))
  return places * POINTS_PER_PLACE
}

export function predict(
  home: LeagueRow | undefined,
  away: LeagueRow | undefined,
  neutral: boolean,
  /** The game's own poll places, 1-25, or null where the poll is unread or the team unranked. */
  poll?: { home: number | null; away: number | null },
): Prediction | null {
  if (!home || !away) return null
  // A team that has not played has no record to reason from, and `power` would
  // read its emptiness as mediocrity rather than as silence.
  if (!played(home) || !played(away)) return null

  const fromPower = (power(home) - power(away)) * POINTS_PER_UNIT
  const fromPoll = poll ? pollGap(poll.home, poll.away) : null
  const merged = fromPoll === null ? fromPower : (fromPower + fromPoll) / 2
  const gap = merged + (neutral ? 0 : HOME_EDGE)
  const size = Math.min(MAX_MARGIN, Math.abs(gap))
  return {
    favourite: gap >= 0 ? home.name : away.name,
    underdog: gap >= 0 ? away.name : home.name,
    margin: Math.max(1, Math.round(size)),
    confidence: size >= 17 ? 'heavy' : size >= 7 ? 'clear' : 'slight',
    tossUp: size < 2.5,
  }
}

/** "Penn State by 10", or an admission that it is a coin toss. */
export function predictionLine(p: Prediction | null): string | null {
  if (!p) return null
  return p.tossUp ? 'Too close to call' : `${p.favourite} by ${p.margin}`
}

/* ------------------------------------------------------------------ the bracket */

export interface BracketGame {
  /**
   * A stable name for this slot in the bracket — `first:8v9`, `quarter:1`,
   * `semi:1v4`, `final`.
   *
   * Named by the seeds that feed the game rather than by the teams in it,
   * because the teams change as the projection runs and a screen looking one
   * up needs a key that does not.
   */
  key: string
  /** "First round", "Quarterfinal", "Semifinal", "National championship". */
  round: string
  homeSeed: number | null
  awaySeed: number | null
  home: string | null
  away: string | null
  /** True where the sport plays the game on the higher seed's field. */
  onCampus: boolean
  prediction: Prediction | null
}

export interface BracketProjection {
  games: BracketGame[]
  /** Who DCC thinks lifts it, or null when the bracket cannot be filled. */
  champion: string | null
}

const ROUNDS = ['First round', 'Quarterfinal', 'Semifinal', 'National championship']

/**
 * The playoff played out to a winner.
 *
 * Every round is decided by the same estimate that fronts a single bowl, and
 * the winner is carried into the next one, so the champion at the end is the
 * consequence of eleven predictions rather than a thirteenth opinion. That
 * makes it wrong more often than any one game is — a single upset early
 * rewrites everything below it — and the screens say so.
 *
 * Only the first round is played on a campus; from the quarterfinals on the
 * sport moves to neutral sites, so the home edge stops applying there.
 */
export function predictBracket(
  field: { teams: { seed: number; row: LeagueRow }[] },
  poll?: Map<string, number | null>,
): BracketProjection {
  const bySeed = new Map(field.teams.map((t) => [t.seed, t.row]))
  const games: BracketGame[] = []

  const place = (name: string | null) => (name ? poll?.get(name) ?? null : null)

  const play = (
    key: string,
    round: string,
    top: LeagueRow | undefined,
    bottom: LeagueRow | undefined,
    topSeed: number | null,
    bottomSeed: number | null,
    onCampus: boolean,
  ): LeagueRow | undefined => {
    // The better seed is the home side, which only changes the answer on campus.
    const p = predict(top, bottom, !onCampus, {
      home: place(top?.name ?? null), away: place(bottom?.name ?? null),
    })
    games.push({
      key,
      round,
      homeSeed: topSeed, awaySeed: bottomSeed,
      home: top?.name ?? null, away: bottom?.name ?? null,
      onCampus,
      prediction: p,
    })
    if (!p) return undefined
    return p.favourite === top?.name ? top : bottom
  }

  const winners = new Map<number, LeagueRow | undefined>()
  for (const [hi, lo] of FIRST_ROUND) {
    winners.set(hi, play(`first:${hi}v${lo}`, ROUNDS[0], bySeed.get(hi), bySeed.get(lo), hi, lo, true))
  }

  const quarters = new Map<number, LeagueRow | undefined>()
  for (const q of QUARTERFINALS) {
    const other = winners.get(q.from[0])
    quarters.set(q.seed, play(
      `quarter:${q.seed}`, ROUNDS[1], bySeed.get(q.seed), other, q.seed,
      other ? (other.name === bySeed.get(q.from[0])?.name ? q.from[0] : q.from[1]) : null,
      false,
    ))
  }

  const semis: (LeagueRow | undefined)[] = []
  for (const [a, b] of SEMIFINALS) {
    semis.push(play(`semi:${a}v${b}`, ROUNDS[2], quarters.get(a), quarters.get(b), a, b, false))
  }

  const champion = play('final', ROUNDS[3], semis[0], semis[1], null, null, false)
  return { games, champion: champion?.name ?? null }
}

/**
 * Teams the postseason has already placed, and so cannot be in the playoff.
 *
 * Only meaningful once the bowls are on the schedule; before that it is empty
 * and the projection is unconstrained, which is correct — in October nothing
 * has placed anybody.
 */
export function bowlBound(games: { postseason: boolean; home: string | null; away: string | null }[]): Set<string> {
  const out = new Set<string>()
  for (const g of games) {
    if (!g.postseason) continue
    if (g.home) out.add(g.home)
    if (g.away) out.add(g.away)
  }
  return out
}
