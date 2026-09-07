// Which team is yours was a preference DCC kept in its own settings, and losing
// those put "pick your team" in front of a save that says plainly whose it is.
// The save marks every game the user played rather than simulated, and one team
// is in all of them. These are the rules that keep that a reading rather than a
// guess about the best team in the country.
const assert = require('node:assert/strict')
const S = require(process.argv[2])

const g = (week, home, away, extra = {}) =>
  ({ week, home, away, played: true, postseason: false, userPlayed: false, ...extra })

/* ------------------------------------------------------------ the real shape */
{
  // What a week 13 save actually looks like: nine games played by hand, the
  // same team in every one and each opponent in exactly one.
  const opponents = ['Tennessee', 'Syracuse', 'West Virginia', 'Nebraska',
    'Michigan State', 'Iowa', 'Ohio State', 'USC', 'Purdue']
  const games = opponents.map((o, i) =>
    g(i + 1, i % 2 ? 'Penn State' : o, i % 2 ? o : 'Penn State', { userPlayed: true }))
  // And seven hundred the game simulated around them, which say nothing.
  for (let i = 0; i < 700; i++) games.push(g(1 + (i % 13), `Team ${i}`, `Team ${i + 700}`))
  assert.equal(S.userTeamOf(games), 'Penn State')
}

/* ------------------------------------------- one game cannot name a team */
{
  const games = [g(1, 'Penn State', 'Iowa', { userPlayed: true })]
  assert.equal(S.userTeamOf(games), null, 'both sides played it; there is nothing to tell them apart')
}

/* ------------------------------------- the leader must be in every one */
{
  // Eight of nine is not all of them — a save where somebody watched a rivalry
  // game they were not in should not name a team at all.
  const games = [
    g(1, 'Penn State', 'Iowa', { userPlayed: true }),
    g(2, 'Penn State', 'Ohio State', { userPlayed: true }),
    g(3, 'Michigan', 'Purdue', { userPlayed: true }),
  ]
  assert.equal(S.userTeamOf(games), null)
}

/* ------------------------------------------------ a tie is not an answer */
{
  // Two teams that always play each other: both are in every game.
  const games = [
    g(1, 'Penn State', 'Iowa', { userPlayed: true }),
    g(2, 'Iowa', 'Penn State', { userPlayed: true }),
  ]
  assert.equal(S.userTeamOf(games), null, 'nobody may match the leader')
}

/* ------------------------------------------ a dynasty that sims everything */
{
  const games = [g(1, 'Penn State', 'Iowa'), g(2, 'Penn State', 'Ohio State')]
  assert.equal(S.userTeamOf(games), null, 'no games played by hand, so the save does not say')
  assert.equal(S.userTeamOf([]), null)
}

/* -------------------------------------------------- what is actually a bowl */
{
  // The calendar out of a real save, in the shape that broke it. The week
  // counter runs up through the regular season and RESTARTS for the bowls, so
  // weeks 1 and 2 appear in September and again in December.
  const d = (week, month, day) => ({ week, month, day, postseason: false })
  const games = [
    d(0, 8, 26),   // week zero
    d(1, 9, 2),
    d(2, 9, 9),
    d(13, 11, 25), // the last ordinary Saturday
    d(14, 12, 2),  // Army–Navy: December, and not a bowl
    d(15, 12, 9),  // the conference championships: December, and not a bowl
    d(1, 12, 15),  // the counter restarts — from here it is the postseason
    d(2, 12, 26),
    d(2, 1, 3),    // January sorts after December, not before August
  ]
  S.markPostseason(games)
  const post = (w, m, dd) => games.find((g) => g.week === w && g.month === m && g.day === dd).postseason

  assert.equal(post(0, 8, 26), false)
  assert.equal(post(1, 9, 2), false, 'week 1 in September is week 1')
  assert.equal(post(13, 11, 25), false)
  assert.equal(post(14, 12, 2), false, 'Army-Navy is a regular-season game in December')
  assert.equal(post(15, 12, 9), false, 'so is a conference championship')
  assert.equal(post(1, 12, 15), true, 'the week counter going backwards is where the bowls start')
  assert.equal(post(2, 12, 26), true)
  assert.equal(post(2, 1, 3), true, 'and January is the end of the season, not the start')

  // Which is what the week you are about to play depends on: with the
  // championship counted as a bowl, this fell back to the last week played.
  const psu = games.map((g) => ({
    ...g, home: 'Penn State', away: 'Someone', played: g.month === 11 || g.month < 11,
  }))
  assert.equal(S.currentWeek(psu, 'Penn State'), 14,
    'the next regular-season game, not the last one played')
}

/* ----------------------------------------------------------- the week, still */
{
  const games = [
    g(1, 'Penn State', 'Iowa'),
    g(2, 'Ohio State', 'Penn State'),
    { week: 3, home: 'Penn State', away: 'Purdue', played: false, postseason: false, userPlayed: false },
  ]
  assert.equal(S.currentWeek(games, 'Penn State'), 3, 'the first week not played')
  assert.equal(S.currentWeek(games, null), null)
  assert.equal(S.currentWeek(games, 'Nobody'), null)
}

console.log('check-season: the save names your team from the games you played, and refuses to when it cannot')
