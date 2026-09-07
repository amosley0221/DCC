// "Penn State host USC" for a conference championship is three failures at
// once: dull, wrong — nobody hosts a neutral-site game — and blind to a rematch
// and a Heisman contender that are both in the save. These are the rules that
// find those, and refuse to claim them when they are not there.
const assert = require('node:assert/strict')
const M = require(process.argv[2])

let row = 0
const g = (week, home, away, hs = 0, as = 0, extra = {}) =>
  ({ row: row++, week, home, away, homeScore: hs, awayScore: as, played: hs + as > 0,
     postseason: false, neutralSite: false, ...extra })

const CONF = { 'Penn State': 'Big Ten', USC: 'Big Ten', Iowa: 'Big Ten', Alabama: 'SEC' }
const RANK = { 'Penn State': 1, USC: 14, Iowa: 21 }
const REC = { 'Penn State': { wins: 12, losses: 0 }, USC: { wins: 10, losses: 3 }, Iowa: { wins: 8, losses: 4 } }
const heisman = [
  { first: 'Quinton', last: 'Martin Jr.', position: 'HB', team: 'Penn State' },
  { first: 'Grant', last: 'Lawless', position: 'QB', team: 'Oklahoma' },
]
const opts = (game, games) => ({
  game, games,
  conferenceOf: (n) => CONF[n] ?? null,
  rankOf: (n) => RANK[n] ?? null,
  recordOf: (n) => REC[n] ?? null,
  heisman,
})

/* ------------------------------------------------- the real one, week 15 */
{
  const games = []
  // Thirteen ordinary weeks of sixty-odd games, so championship weekend reads
  // as the collapse in the schedule that it is.
  for (let w = 1; w <= 13; w++) for (let i = 0; i < 60; i++) games.push(g(w, `H${w}_${i}`, `A${w}_${i}`, 20, 10))
  // Week 11: they already played, and Penn State won by a distance.
  const first = g(11, 'USC', 'Penn State', 14, 41)
  games.push(first)
  // Week 15: twelve games nationally, and this is one of them.
  for (let i = 0; i < 11; i++) games.push(g(15, `X${i}`, `Y${i}`, 0, 0))
  // The Big Ten plays its championship at a neutral site, and the save says so.
  const title = g(15, 'Penn State', 'USC', 0, 0, { neutralSite: true })
  games.push(title)

  const f = M.matchupFacts(opts(title, games))
  assert.equal(f.title, 'Big Ten', 'two Big Ten teams in a twelve-game week is the title game')
  assert.equal(f.neutral, true, 'read from the save, not assumed from the round')
  assert.ok(f.rematch, 'they played in week 11')
  assert.equal(f.rematch.winner, 'Penn State')
  assert.equal(f.rematch.winnerScore, 41)
  assert.equal(f.rematch.week, 11)
  assert.equal(f.homeUnbeaten, true)
  assert.equal(f.awayUnbeaten, false)
  assert.deepEqual(f.contenders.map((c) => c.last), ['Martin Jr.'], "the other side's man is not in this game")

  const head = M.matchupHeadline(title, f, 'Penn State')
  assert.equal(head, 'Penn State and USC again, for the Big Ten')
  assert.ok(!/host/.test(head), 'nobody hosts a neutral-site game')

  const sub = M.matchupStandfirst(title, f)
  assert.ok(/Big Ten goes to the winner/.test(sub), sub)
  assert.ok(/won the first 41-14 in week 11/.test(sub), sub)
  assert.ok(/Martin Jr\. is on the Heisman shortlist/.test(sub), sub)

  // And the story is told all of it, rather than a date and the weather.
  const lines = M.matchupLines(title, f).join('\n')
  assert.ok(/neutral site/.test(lines), lines)
  assert.ok(/already met this season/.test(lines), lines)
  assert.ok(/Heisman shortlist/.test(lines), lines)
}

/* ------------------- a championship the better seed actually hosts */
{
  // Five conferences play theirs on campus — the Sun Belt, Pac-12, Mountain
  // West, Conference USA and the American. Assuming a title game is neutral
  // gets those five wrong, which is why the flag is read rather than derived.
  const games = []
  for (let w = 1; w <= 13; w++) for (let i = 0; i < 60; i++) games.push(g(w, `H${w}_${i}`, `A${w}_${i}`, 20, 10))
  for (let i = 0; i < 11; i++) games.push(g(15, `X${i}`, `Y${i}`, 0, 0))
  const hosted = g(15, 'Penn State', 'Iowa')   // neutralSite stays false
  games.push(hosted)
  const f = M.matchupFacts(opts(hosted, games))
  assert.equal(f.title, 'Big Ten', 'still the title game')
  assert.equal(f.neutral, false, 'but somebody is at home, because the save says so')
  const lines = M.matchupLines(hosted, f).join('\n')
  assert.ok(/championship game/.test(lines), lines)
  assert.ok(!/neutral site/.test(lines), 'and the story is not told otherwise')
}

/* ------------------------------- an ordinary week is not championship weekend */
{
  const games = []
  for (let w = 1; w <= 13; w++) for (let i = 0; i < 60; i++) games.push(g(w, `H${w}_${i}`, `A${w}_${i}`, 20, 10))
  const plain = g(13, 'Penn State', 'Iowa')
  games.push(plain)
  const f = M.matchupFacts(opts(plain, games))
  assert.equal(f.title, null, 'sixty games that week; nothing is being decided')
  assert.equal(f.neutral, false)
  assert.equal(f.rematch, null)
  // Two ranked sides is the better line, and it wins over the unbeaten one.
  assert.equal(M.matchupHeadline(plain, f, 'Penn State'), 'No. 1 Penn State meet No. 21 Iowa')

  // Against somebody unranked, the unbeaten record is what there is to say.
  const easy = g(13, 'Penn State', 'Rutgers')
  const f2 = M.matchupFacts(opts(easy, [...games, easy]))
  assert.equal(M.matchupHeadline(easy, f2, 'Penn State'), 'Unbeaten Penn State take on Rutgers')

  // And with nothing at all to say, the fixture, right way round.
  const nobody = g(13, 'Rutgers', 'Maryland')
  const f3 = M.matchupFacts(opts(nobody, [...games, nobody]))
  assert.equal(M.matchupHeadline(nobody, f3, 'Maryland'), 'Maryland travel to Rutgers')

  // Army-Navy is neither ranked nor unbeaten nor a rematch, and still nobody
  // travels to it.
  const classic = g(14, 'Army', 'Navy', 0, 0, { neutralSite: true })
  const f4 = M.matchupFacts(opts(classic, [...games, classic]))
  assert.equal(M.matchupHeadline(classic, f4, 'Navy'), 'Navy meet Army')
}

/* ------------------------------- two conferences do not play for one title */
{
  const games = []
  for (let w = 1; w <= 13; w++) for (let i = 0; i < 60; i++) games.push(g(w, `H${w}_${i}`, `A${w}_${i}`, 20, 10))
  for (let i = 0; i < 11; i++) games.push(g(15, `X${i}`, `Y${i}`, 0, 0))
  const cross = g(15, 'Penn State', 'Alabama')
  games.push(cross)
  const f = M.matchupFacts(opts(cross, games))
  assert.equal(f.title, null, 'a Big Ten team and an SEC team are not playing for either title')
}

/* --------------------------------------------- two ranked sides, no history */
{
  const games = []
  for (let w = 1; w <= 13; w++) for (let i = 0; i < 60; i++) games.push(g(w, `H${w}_${i}`, `A${w}_${i}`, 20, 10))
  const ranked = g(9, 'Iowa', 'USC')
  games.push(ranked)
  const f = M.matchupFacts(opts(ranked, games))
  assert.equal(M.matchupHeadline(ranked, f, null), 'No. 14 USC meet No. 21 Iowa',
    'the better team leads when neither is the reader\'s')
  assert.equal(M.matchupStandfirst(ranked, f), '', 'nothing to say is said with nothing')
}

console.log('check-matchup: a title game, a rematch, a Heisman contender, and the ordinary game that is none of those')
