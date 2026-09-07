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

/** A game on the calendar, enough of one to say whether it is a bowl. */
export interface DatedGame {
  week: number
  month: number
  day: number
  postseason: boolean
}

/**
 * Which games are the postseason, from the shape of the calendar.
 *
 * This used to be "December or January", and that was wrong twice over. It made
 * a bowl of Army–Navy, which is played on the second of December and is a
 * regular-season game, and — the one that actually cost something — it made a
 * bowl of the conference championships on the ninth. Everything downstream
 * skips the postseason, so the app sat on week 13 in front of a save that had
 * reached week 15: the only unplayed games left were "bowls", and the week you
 * are about to play fell back to the last one you had.
 *
 * The save's own week numbers say it plainly. They run from 0 upwards through
 * the regular season and then **restart** for the bowls: in a real save, weeks
 * 1 and 2 appear in September and again on the fifteenth and twenty-sixth of
 * December. So walk the calendar in date order, and the postseason begins where
 * the week number goes backwards — nothing after week 14 is week 1 unless the
 * counter has started again. Everything from there on is postseason, because a
 * bowl season does not go back to being a regular season.
 *
 * January sorts after December rather than before August, which is the one
 * thing a month number does not say on its own.
 */
export function markPostseason(games: DatedGame[]): void {
  const day = (g: DatedGame) => (g.month >= 8 ? g.month : g.month + 12) * 100 + g.day
  const order = [...games].sort((a, b) => day(a) - day(b))
  let high = -1
  let started = false
  for (const g of order) {
    if (started || (high >= 0 && g.week < high)) {
      started = true
      g.postseason = true
      continue
    }
    if (g.week > high) high = g.week
  }
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


/**
 * What to call a week on screen.
 *
 * The game numbers the regular season 0 to 15 and then keeps counting, so the
 * bye after championship week is "Week 16" and the first bowl week is 17. Its
 * own headers read "WEEK 16, 2028" and "BOWL WEEK 1 OF 4, 2028", so 17 onwards
 * are named as bowl weeks rather than by a number nobody in the game ever sees.
 */
export function weekLabel(week: number | null): string | null {
  if (week === null || week < 0) return null
  if (week <= REGULAR_WEEKS) return `Week ${week}`
  const bowl = week - REGULAR_WEEKS
  return bowl <= BOWL_WEEKS ? `Bowl week ${bowl}` : 'Postseason'
}

/** The last week the game numbers plainly; the bye after the championships. */
const REGULAR_WEEKS = 16
/** "BOWL WEEK 1 OF 4". */
const BOWL_WEEKS = 4


/**
 * Whether the dynasty has left the regular season behind.
 *
 * Once it has, the last week anybody played stops being the news. Nobody
 * previewing the bowls leads with a scoreboard from a fortnight ago.
 */
export function isPostseason(week: number | null): boolean {
  return week !== null && week > REGULAR_WEEKS
}
