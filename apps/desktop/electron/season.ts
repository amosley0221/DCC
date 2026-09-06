/**
 * The week a dynasty is on.
 *
 * One definition, in a module with no imports, because four places needed it
 * and they did not all agree: the desktop's title bar said week 10 while the
 * phone said week 11 off the same save, because one was reporting the last
 * week played and the other the first not played.
 *
 * The first unplayed one is right. It is the week the game itself is sitting
 * on — the one you are about to play — and it is what everything else in DCC
 * already keys off: the snapshot's `currentWeek`, the ledger's stamp, and the
 * week tampering opens in.
 */

export interface WeekGame {
  week: number
  played: boolean
  postseason: boolean
  home: string | null
  away: string | null
}

/** A game that also knows whether the person playing the dynasty played it. */
export interface UserGame extends WeekGame {
  /** The user played this one rather than simulating it. */
  userPlayed: boolean
}

/**
 * Whose dynasty this is, read off the save rather than asked for.
 *
 * DCC used to know your team only because you had once pointed at it, and it
 * kept that in its own settings — which meant that the moment those settings
 * were lost the app went back to "pick your team" in front of a save that says
 * plainly whose it is.
 *
 * The save marks every game the user played rather than simulated. Your team is
 * in all of them and each opponent is in one, so the tally is not close: on a
 * real week 13 save it is nine to one. That is the link, and it is worth more
 * than a remembered preference because it cannot go stale.
 *
 * It is deliberately strict. One game cannot name a team — both sides played it
 * — so two are needed; the leader has to appear in *every* game the user
 * played, and nobody may match it. A dynasty that simulates everything gives
 * nothing here, and gets the picker, which is the honest outcome rather than a
 * guess at the best team in the country.
 */
export function userTeamOf(games: UserGame[]): string | null {
  const mine = games.filter((g) => g.userPlayed && (g.home || g.away))
  if (mine.length < 2) return null
  const tally = new Map<string, number>()
  for (const g of mine) {
    for (const n of [g.home, g.away]) if (n) tally.set(n, (tally.get(n) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  let second = 0
  for (const [name, n] of tally) {
    if (n > bestN) { second = bestN; best = name; bestN = n }
    else if (n > second) second = n
  }
  // In every one of them, and alone in that.
  if (bestN < mine.length || second >= bestN) return null
  return best
}

/**
 * The first week the team has not played, or the last week it has once the
 * regular season is over. Null when the team has no games in the save at all,
 * which is the state before a team has been picked.
 */
export function currentWeek(games: WeekGame[], team: string | null): number | null {
  if (!team) return null
  const mine = games.filter((g) => !g.postseason && (g.home === team || g.away === team))
  if (!mine.length) return null
  const next = mine.filter((g) => !g.played).map((g) => g.week)
  return next.length ? Math.min(...next) : Math.max(...mine.map((g) => g.week))
}
