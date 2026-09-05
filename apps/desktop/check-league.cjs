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

/* -------------------------------------------------------------- the playoff */
{
  // Twelve teams out of four conferences, so the auto-bid rule has something to
  // bite on: the five best conference leaders are in on their titles, the rest
  // of the field is the best of everyone else, and all twelve seed by rank.
  const conf = (name, n) => Array.from({ length: n }, (_, i) => ({
    name: `${name}${i + 1}`, conference: name, division: null,
  }))
  const teams = [...conf('A', 6), ...conf('B', 6), ...conf('C', 6), ...conf('D', 6),
                 ...conf('E', 3), ...conf('F', 3)]
  // Each school's record is set by playing a fixed number of wins against a
  // punching bag in its own conference, so the ordering is known up front.
  const games = []
  let row = 0
  const beat = (w, l, week) => games.push({
    week, home: w, away: l, homeScore: 30, awayScore: 10, played: true, postseason: false, row: row++,
  })
  // A1 best in A, B1 best in B, and so on; the second team in each conference is
  // strong nationally but never a leader.
  const wins = {
    A1: 9, A2: 8, B1: 8, B2: 7, C1: 7, C2: 6, D1: 6, D2: 5, E1: 5, E2: 4, F1: 4, F2: 3,
  }
  for (const [team, n] of Object.entries(wins)) {
    const bag = team[0] + '6'
    for (let i = 0; i < n; i++) beat(team, bag === team ? team[0] + '5' : bag, i + 1)
  }
  const table = L.buildLeague(games, teams)
  const field = L.projectPlayoff(table)

  assert.equal(field.teams.length, 12)
  assert.equal(field.projected, true, 'it never claims to be a played bracket')
  assert.deepEqual(field.teams.map((t) => t.seed), [1,2,3,4,5,6,7,8,9,10,11,12])
  assert.ok(field.teams.slice(0, 4).every((t) => t.bye), 'the top four sit out the first round')
  assert.ok(field.teams.slice(4).every((t) => !t.bye), 'nobody else does')

  // Exactly five are in on a conference title.
  assert.equal(field.teams.filter((t) => t.champion).length, 5)
  const champs = field.teams.filter((t) => t.champion).map((t) => t.row.name)
  assert.deepEqual(champs.sort(), ['A1', 'B1', 'C1', 'D1', 'E1'],
    'the five best leaders, not all six')

  // F1 leads its conference but is the sixth-best leader, so it is in on merit
  // or not at all — here it is in, but as an at-large.
  const f1 = field.teams.find((t) => t.row.name === 'F1')
  if (f1) assert.equal(f1.champion, false, 'the sixth leader has no automatic bid')

  // Seeding follows the ranking, not how a team got in.
  const order = L.rankings(table).map((r) => r.name)
  const seeded = field.teams.map((t) => t.row.name)
  assert.deepEqual(seeded, order.filter((n) => seeded.includes(n)),
    'the twelve are seeded in ranking order')

  assert.equal(field.leaders.get('A'), 'A1')
  assert.equal(field.leaders.size, 6, 'one leader per conference')

  // The bracket shape is the twelve-team one, and every seed appears once.
  const inFirst = L.FIRST_ROUND.flat()
  assert.deepEqual([...inFirst].sort((a, b) => a - b), [5, 6, 7, 8, 9, 10, 11, 12])
  assert.deepEqual(L.QUARTERFINALS.map((q) => q.seed).sort((a, b) => a - b), [1, 2, 3, 4])
  const fed = L.QUARTERFINALS.flatMap((q) => q.from).sort((a, b) => a - b)
  assert.deepEqual(fed, inFirst.sort((a, b) => a - b), 'every first-round game feeds a quarterfinal')
}

/* ----------------------------------------------- the save's own ordering */
{
  // A poll ranks twenty-five and leaves everyone else level. The ranked teams
  // have to come out in the poll's order, and the rest behind them — never
  // mixed through, and never dropped.
  const ranked = { 'Ohio State': 1, Iowa: 2, Alabama: 3 }
  const order = L.orderByRanks(table, ranked)
  assert.deepEqual(order.slice(0, 3).map((r) => r.name), ['Ohio State', 'Iowa', 'Alabama'],
    'the poll decides the top, whatever the records say')
  assert.equal(order.length, table.size, 'nobody is dropped for being unranked')
  const rest = order.slice(3).map((r) => r.name)
  assert.ok(rest.includes('Penn State'), 'an unranked team is still in the list')
  // Penn State is 3-0 and the best of the unranked, so it leads them.
  assert.equal(rest[0], 'Penn State', 'unranked teams fall in by the same arithmetic')

  // No ranking at all is the ordering DCC would have used anyway.
  assert.deepEqual(
    L.orderByRanks(table, {}).map((r) => r.name),
    L.rankings(table).map((r) => r.name),
    'an empty ranking changes nothing')
}

console.log('check-league: records, bowls, a school\'s season, the order, the standings, the spoiler line, the playoff field and the save\'s own order')
