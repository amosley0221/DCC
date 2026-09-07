// The statistics were behind a scanner bug, not a missing table. Most stores
// keep their name in a buffer in front of the SPBF marker rather than inside
// it, and the reader that required it inside was throwing 1,503 of the save's
// 1,591 stores away — TeamStats among them. These are the rules that keep the
// decoding a reading of a real box score rather than a shape that happened to
// fit: Penn State 42, USC 17, the Big Ten championship.
const assert = require('node:assert/strict')
const T = require(process.argv[2])

/* ----------------------------------- the marker bit is not part of the number */
{
  // A word carries a marker in its top bit, so 0x80f5 is 245 and not 32, for
  // any reading that keeps all sixteen.
  assert.equal(T.statValue(0x80f5), 245, 'Penn State passed for 245')
  assert.equal(T.statValue(0x8097), 151, 'and rushed for 151')
  assert.equal(T.statValue(0x001a), 26, 'a word without the marker reads plainly')
}

/* ------------------------------------------ and the fifteen under it are signed */
{
  // Sacks come off a team's rushing yards, so the field goes below zero. Read
  // unsigned, a quiet loss of one yard becomes a season-leading 32,767.
  assert.equal(T.statValue(0xffff), -1)
  assert.equal(T.statValue(0xfff8), -8)
  assert.equal(T.statValue(0xffe6), -26)
  assert.ok(T.statValue(0xffff) < 0, 'a team that lost ground did not gain 32,767 yards')
}

/* ------------------------------------------------- total offence has to add up */
{
  // The check that held across all 1,816 team-games in a real save.
  const game = (rush, pass) => ({ rushYards: rush, passYards: pass, totalOffense: rush + pass })
  for (const [rush, pass] of [[151, 245], [57, 169], [-1, 369], [-26, 242]]) {
    const g = game(rush, pass)
    assert.equal(g.totalOffense, g.rushYards + g.passYards)
  }
}

/* -------------------------------------------------------- a win reads 1, a loss 3 */
{
  assert.equal(T.wonFrom(1), true)
  assert.equal(T.wonFrom(3), false)
  assert.equal(T.wonFrom(0), false, 'an unplayed row is not a win')
}

/* ------------------------------------------------------------- season totals */
{
  const line = (teamIndex, over) => ({
    teamIndex, gameIndex: 0, won: true, firstDowns: 0, rushYards: 0, passYards: 0,
    totalOffense: 0, totalYards: 0, passYardsAllowed: 0, rushYardsAllowed: 0,
    thirdDownConversions: 0, thirdDownAttempts: 0, kickReturnYards: 0,
    puntReturnYards: 0, penaltyYards: 0, possessionSeconds: 0, ...over,
  })
  const totals = T.seasonTotals([
    line(94, { rushYards: 151, passYards: 245, totalOffense: 396, passYardsAllowed: 169, rushYardsAllowed: 57 }),
    line(94, { rushYards: 100, passYards: 200, totalOffense: 300, passYardsAllowed: 100, rushYardsAllowed: 50 }),
    line(126, { rushYards: 57, passYards: 169, totalOffense: 226 }),
  ])
  const psu = totals.find((t) => t.teamIndex === 94)
  assert.equal(psu.games, 2)
  assert.equal(psu.totalOffense, 696)
  assert.equal(psu.yardsAllowed, 169 + 57 + 100 + 50)
  assert.equal(T.perGame(psu.totalOffense, psu.games), 348)
}

/* ------------------------------------- fewest yards allowed is the best defence */
{
  const t = (teamIndex, games, totalOffense, yardsAllowed) => ({
    teamIndex, games, totalOffense, yardsAllowed, rushYards: 0, passYards: 0,
    totalYards: 0, passYardsAllowed: 0, rushYardsAllowed: 0, firstDowns: 0,
    thirdDownConversions: 0, thirdDownAttempts: 0, penaltyYards: 0, possessionSeconds: 0,
  })
  const totals = [t(1, 10, 5000, 3000), t(2, 10, 4000, 2000), t(3, 0, 0, 0)]
  assert.deepEqual(T.leaders(totals, 'totalOffense', 2).map((l) => l.teamIndex), [1, 2])
  assert.deepEqual(T.leaders(totals, 'yardsAllowed', 2).map((l) => l.teamIndex), [2, 1])
  assert.ok(!T.leaders(totals, 'yardsAllowed', 3).some((l) => l.teamIndex === 3),
    'a team that has not played is not the best defence in the country')
}

/* ----------------------------------------------- possession reads as a clock */
{
  // 845 and 595 are the two sides of the championship, and they sum to 24:00 —
  // four six-minute quarters, which is what makes them seconds and not anything else.
  assert.equal(T.clock(845), '14:05')
  assert.equal(T.clock(595), '9:55')
  assert.equal(T.clock(845 + 595), '24:00')
}

/* ------------------------------------------------------- rates, and no attempts */
{
  assert.equal(T.rate(3, 8), '38%')
  assert.equal(T.rate(2, 13), '15%')
  assert.equal(T.rate(0, 0), '—', 'nobody converted nothing')
}

console.log('team statistics: ok')
