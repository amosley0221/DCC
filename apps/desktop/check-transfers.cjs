// Regression test for the transfer ledger. The ledger is the one thing in DCC
// that cannot be rebuilt from the current save — last season's roster is gone
// once the season turns — so the diff has to be right the first time.
const assert = require('node:assert/strict')
const T = require(process.argv[2])

const p = (first, last, town, state, team, overall = 70, position = 'QB') =>
  ({ first, last, hometown: town, homeState: state, position, overall, team })

const UNASSIGNED = 255

// The key has to separate two players with the same name and join one player
// across a season in which everything else about them changed.
{
  const a = p('Zeke', 'Mama', 'Tampa', 'Florida', 12)
  const b = p('Zeke', 'Mama', 'Mobile', 'Alabama', 12)
  assert.notEqual(T.playerKey(a), T.playerKey(b), 'same name, different hometown, different player')

  const grown = p('Zeke', 'Mama', 'Tampa', 'Florida', 44, 88, 'C')
  assert.equal(T.playerKey(a), T.playerKey(grown), 'a transfer keeps the key')
}

// Unrostered players are recruits and the portal pool, not roster members.
{
  const rec = T.buildRecord(
    [p('A', 'One', 'Tampa', 'Florida', 3), p('B', 'Two', 'Reno', 'Nevada', UNASSIGNED)],
    { season: 1, week: 4, unassigned: UNASSIGNED, now: 'x' },
  )
  assert.equal(rec.players.length, 1, 'the recruit pool is not a roster')
  assert.equal(rec.season, 1)
  assert.equal(rec.week, 4)
}

// One record per season, latest wins, in season order however they arrive.
{
  let l = T.emptyLedger()
  l = T.fileRecord(l, T.buildRecord([p('A', 'One', 'Tampa', 'Florida', 3)], { season: 2, week: 1, unassigned: UNASSIGNED, now: 'a' }))
  l = T.fileRecord(l, T.buildRecord([p('A', 'One', 'Tampa', 'Florida', 3)], { season: 1, week: 1, unassigned: UNASSIGNED, now: 'b' }))
  l = T.fileRecord(l, T.buildRecord([p('A', 'One', 'Tampa', 'Florida', 9)], { season: 2, week: 8, unassigned: UNASSIGNED, now: 'c' }))
  assert.deepEqual(l.records.map((r) => r.season), [1, 2], 'one per season, in order')
  assert.equal(l.records[1].players[0].team, 9, 'the later read of a season wins')
}

// The diff itself.
{
  const s1 = [
    p('Zeke', 'Mama', 'Tampa', 'Florida', 12, 71, 'C'),
    p('Cooper', 'Barkate', 'Provo', 'Utah', 12, 80, 'WR'),
    p('Leaves', 'Early', 'Reno', 'Nevada', 30, 66, 'K'),
  ]
  const s2 = [
    p('Zeke', 'Mama', 'Tampa', 'Florida', 44, 78, 'C'),   // moved, and got better
    p('Cooper', 'Barkate', 'Provo', 'Utah', 12, 84, 'WR'), // stayed
    p('New', 'Guy', 'Miami', 'Florida', 12, 62, 'HB'),     // arrived from nowhere
  ]
  let l = T.emptyLedger()
  l = T.fileRecord(l, T.buildRecord(s1, { season: 1, week: 12, unassigned: UNASSIGNED, now: 'a' }))
  l = T.fileRecord(l, T.buildRecord(s2, { season: 2, week: 3, unassigned: UNASSIGNED, now: 'b' }))

  const m = T.moves(l)
  assert.equal(m.length, 1, 'one transfer: a player who stayed is not one, and neither is a new signing')
  assert.equal(m[0].last, 'Mama')
  assert.equal(m[0].from, 12)
  assert.equal(m[0].to, 44)
  assert.equal(m[0].overallBefore, 71)
  assert.equal(m[0].overallAfter, 78)
  assert.equal(m[0].fromSeason, 1)
  assert.equal(m[0].toSeason, 2)

  // A player who leaves the game entirely is not a transfer to anywhere.
  assert.ok(!m.some((x) => x.last === 'Early'), 'graduating is not a transfer')

  const paths = T.paths(l)
  assert.equal(paths.length, 1, 'only the mover has been at two schools')
  assert.deepEqual(paths[0].stops.map((s) => s.team), [12, 44])
  assert.deepEqual(paths[0].stops.map((s) => s.season), [1, 2])
}

// A single season yields nothing, which is the state the screen has to explain.
{
  let l = T.emptyLedger()
  l = T.fileRecord(l, T.buildRecord([p('A', 'One', 'Tampa', 'Florida', 3)], { season: 1, week: 1, unassigned: UNASSIGNED, now: 'a' }))
  assert.deepEqual(T.moves(l), [])
  assert.deepEqual(T.paths(l), [])
}

// A skipped season still gives the move, attributed to the gap it is known to
// have happened in rather than to a season nobody recorded.
{
  let l = T.emptyLedger()
  l = T.fileRecord(l, T.buildRecord([p('A', 'One', 'Tampa', 'Florida', 3)], { season: 1, week: 1, unassigned: UNASSIGNED, now: 'a' }))
  l = T.fileRecord(l, T.buildRecord([p('A', 'One', 'Tampa', 'Florida', 8)], { season: 4, week: 1, unassigned: UNASSIGNED, now: 'b' }))
  const m = T.moves(l)
  assert.equal(m.length, 1)
  assert.equal(m[0].fromSeason, 1)
  assert.equal(m[0].toSeason, 4)
}

// Naming one season names them all, and naming none leaves them counted.
{
  let l = T.emptyLedger()
  l = T.fileRecord(l, T.buildRecord([], { season: 2, week: null, unassigned: UNASSIGNED, now: 'a' }))
  l = T.fileRecord(l, T.buildRecord([], { season: 4, week: null, unassigned: UNASSIGNED, now: 'b' }))
  assert.equal(T.yearOf(l, 4), null, 'nothing is named until the user names it')
  l = { ...l, latestYear: 2029 }
  assert.equal(T.yearOf(l, 4), 2029)
  assert.equal(T.yearOf(l, 2), 2027, 'earlier seasons count back from the named one')
}

console.log('transfers OK')
