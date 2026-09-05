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
