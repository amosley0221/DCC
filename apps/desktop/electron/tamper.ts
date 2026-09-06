/**
 * Tampering: texting players on other rosters, which the rulebook and the game
 * both say you cannot do.
 *
 * It opens in week 11, when the season is decided enough for a player who is
 * not playing to be thinking about next year, and it runs on conversation
 * rather than on numbers. You send a text. The player answers the way an
 * eighteen-to-twenty-one-year-old actually answers a coach from another school
 * texting him out of nowhere, and how far he moves toward you depends on how
 * little he has to lose by moving.
 *
 * ## What makes a player hard to move
 *
 * Two things, in this order:
 *
 * - **Where he is on the depth chart.** A starter has the thing everyone else
 *   in the portal is looking for. A third-stringer has a season of watching
 *   ahead of him and a phone that just buzzed.
 * - **Where he plays.** A backup at a program that wins ten games has a
 *   national-title ring to weigh against your promise; a starter at a program
 *   that wins four has already heard this pitch and may be waiting for it.
 *
 * Both are read out of the save — the depth chart from `readDepthCharts`, the
 * program's standing from its record and the strength of its roster, which is
 * as close to prestige as the save gets until that field is decoded.
 *
 * The call to the model lives in `tamperTalk.ts`, not here. This half is pure
 * so the screen can import it: the week it opens, what makes a man hard to
 * move, and what the number means are all things the user is shown.
 *
 * ## What DCC does and does not do
 *
 * It keeps the conversation and a number: how far you have moved him, which is
 * where you stand if he enters the portal. It does **not** write any of this
 * into the save, because the fields the game would read — the portal list, the
 * commit score, the recruiting stage — are not decoded yet. Saying so on the
 * screen is better than pretending, and when they are decoded this becomes a
 * write rather than a rewrite.
 */
/** The week illegal contact opens. Before this the screen is locked. */
export const TAMPER_OPENS_WEEK = 11

/** Where a player sits in his own team's depth chart, if he is on it at all. */
export interface DepthStanding {
  /** The slot's abbreviation, e.g. QB, LT, 3DRB. */
  slot: string
  /** 1 for the starter, 2 for the backup, and so on. */
  string: number
  /** How many players are in that slot. */
  of: number
}

export interface TamperTarget {
  first: string
  last: string
  position: string
  overall: number
  /** Their school, named. */
  team: string
  /** Their standing, or null when they are not on their team's chart. */
  depth: DepthStanding | null
  /** Their program this season, as far as the save shows. */
  teamWins: number
  teamLosses: number
  /** Average overall of their roster, which stands in for the program's pull. */
  teamStrength: number
  /** Freshman through Senior, or null when the save does not say. */
  year?: string | null
}

export interface TamperCoach {
  /** The user's school. */
  team: string
  wins: number
  losses: number
  strength: number
}

export interface TamperTurn {
  from: 'coach' | 'player'
  text: string
  /** How far the player moved on this turn, for a player turn. */
  move?: number
}

/**
 * How hard this player is to move, 0 to 100, with the reasons in plain words.
 *
 * Deliberately not a hidden number: the screen shows both the figure and the
 * sentences, because a player who will not budge is only interesting if you can
 * see why.
 */
export function resistance(t: TamperTarget, coach: TamperCoach): { score: number; because: string[] } {
  const because: string[] = []
  let score = 40

  // Depth is the biggest single term. A starter is playing; nobody in the
  // portal is looking for less of that.
  if (!t.depth) {
    score -= 12
    because.push('He is not on their depth chart at all.')
  } else if (t.depth.string === 1) {
    score += 26
    because.push(`He starts at ${t.depth.slot}.`)
  } else if (t.depth.string === 2) {
    score -= 4
    because.push(`He is second at ${t.depth.slot}, behind one man.`)
  } else {
    score -= 16
    because.push(`He is ${t.depth.string}${ord(t.depth.string)} at ${t.depth.slot}, with ${t.depth.of - 1} ahead of him.`)
  }

  // A program that is winning is a reason to stay whatever your role is.
  const games = t.teamWins + t.teamLosses
  const winPct = games ? t.teamWins / games : 0.5
  if (games >= 4) {
    if (winPct >= 0.8) { score += 14; because.push(`${t.team} is ${t.teamWins}-${t.teamLosses}.`) }
    else if (winPct <= 0.35) { score -= 12; because.push(`${t.team} is ${t.teamWins}-${t.teamLosses}.`) }
  }

  // And the room he would be walking into. A roster stronger than his own is a
  // harder sell for playing time, and a weaker one is a harder sell full stop.
  const gap = Math.round(coach.strength - t.teamStrength)
  if (gap >= 3) { score -= 10; because.push(`Your roster grades ${gap} points above theirs.`) }
  else if (gap <= -3) { score += 10; because.push(`Their roster grades ${-gap} points above yours.`) }

  // A player already better than the room he is in knows it.
  if (t.overall >= t.teamStrength + 12) {
    score += 6
    because.push('He is one of the best players on his team.')
  }

  const coachGames = coach.wins + coach.losses
  if (coachGames >= 4) {
    const mine = coach.wins / coachGames
    if (mine >= 0.8) { score -= 8; because.push(`You are ${coach.wins}-${coach.losses}.`) }
    else if (mine <= 0.35) { score += 8; because.push(`You are ${coach.wins}-${coach.losses}.`) }
  }

  return { score: clamp(score, 5, 95), because }
}

const ord = (n: number) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th')
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/**
 * How much a turn is allowed to move him.
 *
 * The model judges the message and returns its own figure; this is the ceiling
 * DCC puts on it, so a resistant player cannot be talked round in three texts
 * however good the writing is. A hostile reply is not capped the same way —
 * saying the wrong thing to a starter should cost you.
 */
export function capMove(raw: number, resist: number): number {
  const ceiling = Math.max(1, Math.round((100 - resist) / 8))
  return clamp(Math.round(raw), -8, ceiling)
}

/** Where you stand with him, in words, from the interest figure. */
export function standing(interest: number): string {
  if (interest >= 85) return 'He is coming with you if he enters.'
  if (interest >= 65) return 'You are top of his list.'
  if (interest >= 45) return 'You are on his list.'
  if (interest >= 25) return 'He is listening.'
  if (interest > 0) return 'He has not told you to stop.'
  return 'Nothing yet.'
}


/**
 * What he says when he picks up to a number he does not know.
 *
 * Written here rather than asked of the model: it is the same line every time
 * for the same player, it costs no API credit, and a man who answered his phone
 * with a paragraph would give the game away. The reply the model writes comes
 * after the coach has actually said something.
 *
 * Chosen from the player's own key so it does not change as the screen redraws.
 */
export const OPENERS = [
  'Who is this?',
  'Yeah? Who\u2019s this?',
  'Hello? Who am I talking to?',
  'New number \u2014 who\u2019s this?',
  'Yeah, this is him. Who\u2019s asking?',
  'Who dis?',
] as const

export function opener(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return OPENERS[h % OPENERS.length]
}
