// The wire is the home screen's front page: what happened around the country,
// derived from the save rather than written. Every rule in it can print a
// sentence about a real school, so each one is checked against a season worked
// out by hand — an upset that is an upset, a close game that is close, and a
// commitment that the recruit's own record actually supports.
const assert = require('node:assert/strict')
const W = require(process.argv[2])
const L = require(process.argv[3])

const teams = [
  { name: 'Penn State', conference: 'Big Ten', division: 'East' },
  { name: 'Ohio State', conference: 'Big Ten', division: 'East' },
  { name: 'Iowa', conference: 'Big Ten', division: 'West' },
  { name: 'Purdue', conference: 'Big Ten', division: 'West' },
  { name: 'Alabama', conference: 'SEC', division: null },
  { name: 'Auburn', conference: 'SEC', division: null },
]

let row = 0
const g = (week, home, homeScore, away, awayScore, extra = {}) =>
  ({ row: row++, week, home, away, homeScore, awayScore, played: true, postseason: false, ...extra })

const games = [
  // Week 1 is history: the wire only ever prints the week you have reached.
  g(1, 'Penn State', 42, 'Purdue', 3),
  // Week 2, the week under test.
  g(2, 'Purdue', 24, 'Ohio State', 21),        // No. 2 loses to the unranked: an upset
  g(2, 'Penn State', 20, 'Iowa', 17),          // one possession, No. 1 involved
  g(2, 'Alabama', 55, 'Auburn', 10),           // No. 3 by 45: a statement
  g(2, 'Iowa', 30, 'Purdue', 28, { played: false }), // unplayed: never news
]
const table = L.buildLeague(games, teams)
const ranks = new Map([['Penn State', 1], ['Ohio State', 2], ['Alabama', 3]])

const recruits = [
  {
    index: 10, first: 'Cooper', last: 'Barkate', position: 'WR', stars: 5,
    nationalRank: 1, stage: 'HardCommitted',
    topSchools: [{ school: 'Alabama', interest: 900 }, { school: 'Penn State', interest: 500 }],
  },
  {
    index: 11, first: 'Grant', last: 'Lawless', position: 'QB', stars: 5,
    nationalRank: 2, stage: 'Battle',
    topSchools: [{ school: 'Iowa', interest: 700 }, { school: 'Purdue', interest: 680 }],
  },
  {
    index: 12, first: 'Nobody', last: 'Yet', position: 'HB', stars: 3,
    nationalRank: 3, stage: 'Top10',
    topSchools: [{ school: 'Auburn', interest: 700 }, { school: 'Iowa', interest: 200 }],
  },
]

const wire = W.buildWire({ games, week: 2, table, ranks, recruits, me: 'Penn State' })
const kinds = wire.map((i) => i.kind)
const by = (kind) => wire.filter((i) => i.kind === kind)

/* ------------------------------------------------------------ the games */
{
  const upset = by('upset')
  assert.equal(upset.length, 1, 'one upset in the week')
  assert.equal(upset[0].team, 'Purdue', 'the winner heads it')
  assert.equal(upset[0].other, 'Ohio State')
  assert.ok(upset[0].headline.includes('No. 2 Ohio State 21'), upset[0].headline)
  assert.equal(upset[0].row, 1, 'it opens its own box score')

  const close = by('thriller')
  assert.equal(close.length, 1)
  assert.equal(close[0].team, 'Penn State')
  assert.ok(/3 points in it/.test(close[0].line), close[0].line)

  const statement = by('statement')
  assert.equal(statement.length, 1)
  assert.equal(statement[0].team, 'Alabama')
  assert.ok(/by 45/.test(statement[0].line), statement[0].line)

  // Week 1's blowout is not this week's news, and an unplayed game is nobody's.
  assert.ok(!wire.some((i) => i.row === 0), 'last week stays in last week')
  assert.ok(!wire.some((i) => i.row === 4), 'an unplayed game is never on the wire')
}

/* ------------------------------------------------------- the standings */
{
  const unbeaten = by('unbeaten')
  assert.equal(unbeaten.length, 1)
  // Penn State 2-0 and Alabama 1-0 are the only two without a loss, and two
  // names is a sentence rather than a count.
  assert.equal(unbeaten[0].headline, 'Penn State and Alabama are still perfect')
  assert.ok(/have not lost yet/.test(unbeaten[0].line), unbeaten[0].line)
}

/* ----------------------------------------------------------- the class */
{
  const commit = by('commit')
  assert.equal(commit.length, 1, 'only the committed are reported as committed')
  assert.equal(commit[0].team, 'Alabama', 'to the school leading their list')
  assert.equal(commit[0].playerIndex, 10, 'and it opens the prospect')
  assert.ok(/1st prospect in the country/.test(commit[0].line), commit[0].line)

  const battle = by('battle')
  assert.equal(battle.length, 1, 'a fight is two schools close together')
  assert.equal(battle[0].team, 'Iowa')
  assert.equal(battle[0].other, 'Purdue')
  assert.ok(/lead by 20/.test(battle[0].line), battle[0].line)
  // Auburn are 500 clear on their man: that is not a battle and not news.
  assert.ok(!wire.some((i) => i.playerIndex === 12), 'a runaway lead is not a story')
}

/* ------------------------------------------------------------ the order */
{
  assert.equal(kinds[0], 'upset', 'the biggest result in the country leads')
  // Yours is a story, but never the top one: the close game Penn State won
  // falls behind the country's.
  const mine = wire.findIndex((i) => i.team === 'Penn State' || i.other === 'Penn State')
  assert.ok(mine > 0, 'your own team never leads the wire')
  assert.ok(new Set(wire.map((i) => i.key)).size === wire.length, 'keys are unique')
}

/* -------------------------------------------------- nothing to report */
{
  const empty = W.buildWire({ games: [], week: null, table: new Map(), ranks: new Map(), recruits: [] })
  assert.deepEqual(empty, [], 'a save with nothing played prints nothing rather than inventing')

  // No poll: the games are only scores, so no upset can be claimed.
  const noRanks = W.buildWire({ games, week: 2, table, ranks: new Map(), recruits: [] })
  assert.ok(!noRanks.some((i) => i.kind === 'upset'), 'no ranking, no upsets')
  assert.ok(!noRanks.some((i) => i.kind === 'thriller'), 'and no ranked thriller either')
}

/* ------------------------------------- the board's news beats the board's state */
{
  const events = [
    {
      key: 'k1', season: 2027, week: 2, playerIndex: 11,
      first: 'Grant', last: 'Lawless', position: 'QB', stars: 5, nationalRank: 2,
      kind: 'decommit', from: 'Iowa', to: null,
    },
    {
      key: 'k2', season: 2027, week: 2, playerIndex: 10,
      first: 'Cooper', last: 'Barkate', position: 'WR', stars: 5, nationalRank: 1,
      kind: 'flip', from: 'Penn State', to: 'Alabama',
    },
  ]
  const w = W.buildWire({ games, week: 2, table, ranks, recruits, events, me: 'Penn State' })
  const decommit = w.find((i) => i.kind === 'decommit')
  assert.ok(decommit, 'a decommitment is on the wire')
  assert.equal(decommit.team, 'Iowa', 'headed by the school that lost him')
  assert.ok(/reopens his recruitment/.test(decommit.headline), decommit.headline)

  const flip = w.find((i) => i.kind === 'flip')
  assert.ok(flip)
  assert.ok(/flips from Penn State to Alabama/.test(flip.headline), flip.headline)
  assert.equal(flip.other, 'Penn State', 'both schools, so both helmets')
  assert.ok(/He was yours/.test(flip.line), flip.line)

  // What the class *stands* at is not printed beside what actually moved: a
  // standing dressed as a headline next to a real commitment devalues both.
  assert.ok(!w.some((i) => i.key.startsWith('commit:')), 'no standing-of-the-class items')
  assert.ok(!w.some((i) => i.kind === 'battle'), 'and no battles either')

  // With nothing moved, the standing comes back — an empty board is worse.
  const quiet = W.buildWire({ games, week: 2, table, ranks, recruits, events: [], me: 'Penn State' })
  assert.ok(quiet.some((i) => i.kind === 'commit'), 'a quiet week still says where the class stands')
}

console.log('check-wire: upsets, one-possession games, statements, the unbeaten, commitments, decommitments, flips, battles and the order')
