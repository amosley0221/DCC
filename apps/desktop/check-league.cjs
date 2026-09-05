// The league table is arithmetic on the save's own game rows, and every screen
// that says "9-1" or "No. 3" is reading it. It is checked against a small
// season worked out by hand, because a standings page that is subtly wrong is
// worse than one that is missing.
const assert = require('node:assert/strict')
const L = require(process.argv[2])

const teams = [
  { name: 'Penn State', conference: 'Big Ten', division: 'East' },
  { name: 'Ohio State', conference: 'Big Ten', division: 'East' },
  { name: 'Iowa', conference: 'Big Ten', division: 'West' },
  { name: 'Alabama', conference: 'SEC', division: null },
  { name: 'Auburn', conference: 'SEC', division: null },
  // Never plays: it must still stand in its conference at 0-0.
  { name: 'Vanderbilt', conference: 'SEC', division: null },
]

const g = (week, home, homeScore, away, awayScore, extra = {}) =>
  ({ week, home, away, homeScore, awayScore, played: true, postseason: false, ...extra })

const games = [
  g(1, 'Penn State', 31, 'Ohio State', 14),   // conference
  g(2, 'Iowa', 10, 'Penn State', 24),         // conference, on the road
  g(3, 'Penn State', 45, 'Alabama', 7),       // out of conference
  g(4, 'Ohio State', 28, 'Iowa', 21),         // conference
  g(5, 'Auburn', 17, 'Alabama', 20),          // conference
  // A bowl: it counts in the overall record and never in the league one.
  g(15, 'Alabama', 35, 'Ohio State', 30, { postseason: true }),
  // Not played: no bearing on anything.
  { week: 6, home: 'Penn State', away: 'Auburn', homeScore: 0, awayScore: 0, played: false, postseason: false },
]

const table = L.buildLeague(games, teams)

/* --------------------------------------------------------------- records */
{
  const psu = table.get('Penn State')
  assert.deepEqual([psu.wins, psu.losses], [3, 0])
  assert.deepEqual([psu.confWins, psu.confLosses], [2, 0])
  assert.equal(psu.pointsFor, 31 + 24 + 45)
  assert.equal(psu.pointsAgainst, 14 + 10 + 7)

  const bama = table.get('Alabama')
  assert.deepEqual([bama.wins, bama.losses], [2, 1], 'the bowl win counts overall')
  assert.deepEqual([bama.confWins, bama.confLosses], [1, 0], 'and never in the conference record')

  const osu = table.get('Ohio State')
  assert.deepEqual([osu.wins, osu.losses], [1, 2])
  assert.deepEqual([osu.confWins, osu.confLosses], [1, 1])

  const vandy = table.get('Vanderbilt')
  assert.deepEqual([vandy.wins, vandy.losses], [0, 0], 'a team that has not played still exists')
  assert.equal(L.played(vandy), 0)
}

/* ------------------------------------------------- a school's own season */
{
  const psu = table.get('Penn State')
  assert.equal(psu.results.length, 3, 'only played games')
  assert.equal(psu.results[0].week, 3, 'newest first')
  const away = psu.results.find((r) => r.week === 2)
  assert.deepEqual([away.home, away.us, away.them, away.won, away.opponent],
    [false, 24, 10, true, 'Iowa'], 'the road game is told from Penn State\'s side')
  const ooc = psu.results.find((r) => r.week === 3)
  assert.equal(ooc.conference, false, 'Alabama is not in the Big Ten')
}

/* ------------------------------------------------------------- the order */
{
  const order = L.rankings(table)
  assert.equal(order[0].name, 'Penn State', '3-0 with the best margin leads')
  assert.equal(L.rankOf(order, 'Penn State'), 1)
  assert.equal(L.rankOf(order, 'Nobody'), null)
  assert.equal(order[order.length - 1].name, 'Vanderbilt', 'a team with no games sinks')

  // The cap: a blowout cannot outweigh a win.
  const lopsided = L.buildLeague([
    g(1, 'A', 98, 'B', 0),
    g(2, 'C', 21, 'D', 20),
    g(3, 'C', 21, 'E', 20),
  ], [{ name: 'A', conference: 'X', division: null }, { name: 'C', conference: 'X', division: null }])
  const top = L.rankings(lopsided)
  assert.equal(top[0].name, 'C', '2-0 by a point beats 1-0 by ninety-eight')
}

/* --------------------------------------------------------- the standings */
{
  const groups = L.conferences(table)
  assert.deepEqual(groups.map(([c]) => c), ['Big Ten', 'SEC'], 'alphabetical, and no unlabelled bucket')
  const bigTen = groups.find(([c]) => c === 'Big Ten')[1]
  assert.deepEqual(bigTen.map((r) => r.name), ['Penn State', 'Ohio State', 'Iowa'])
  const sec = groups.find(([c]) => c === 'SEC')[1]
  assert.equal(sec[0].name, 'Alabama')
  assert.equal(sec[sec.length - 1].name, 'Vanderbilt', 'no conference games played, so last')

  // A team the save gives no conference is left out rather than gathered up.
  const nameless = L.buildLeague([g(1, 'A', 7, 'B', 3)],
    [{ name: 'A', conference: null, division: null }, { name: 'B', conference: null, division: null }])
  assert.deepEqual(L.conferences(nameless), [])
}

/* ------------------------------------------------------------- spoilers */
{
  // The game sims the country before your own Saturday, so week 5 already holds
  // everyone else's week 5. Held games must not reach the table at all — a
  // ranking built from them would give away a week you have not played.
  const held = L.visibleGames(games, 'Penn State', 5)
  assert.ok(held.some((g) => g.week === 5 && g.home === 'Auburn') === false,
    'a week you have not reached is held')
  assert.ok(held.some((g) => g.week === 4 && g.home === 'Ohio State'),
    'earlier weeks are yours to see')
  assert.ok(held.some((g) => g.week === 6 && g.home === 'Penn State'),
    'an unplayed fixture is not a spoiler')
  assert.equal(L.visibleGames(games, 'Penn State', null).length, games.length,
    'no hold point, nothing held')

  const table5 = L.buildLeague(held, teams)
  // Only the week three loss to Penn State: the week five win and the bowl are
  // both past the hold line, and neither is Penn State's game.
  assert.deepEqual([table5.get('Alabama').wins, table5.get('Alabama').losses], [0, 1],
    'a result past the hold line is not in the table')
  const psu5 = table5.get('Penn State')
  assert.deepEqual([psu5.wins, psu5.losses], [3, 0], 'your own record is never held from you')
}

console.log('check-league: records, bowls, a school\'s season, the order, the standings and the spoiler line')
