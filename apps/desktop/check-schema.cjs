// The schema is the reference the rest of the decoding leans on, so what is
// checked is the thing that would silently rot: that the index still resolves
// the stores DCC actually reads, and that a store with no match says so rather
// than picking the nearest name.
const assert = require('node:assert/strict')
const { gunzipSync } = require('node:zlib')
const { readFileSync } = require('node:fs')
const S = require(process.argv[2])

const index = JSON.parse(gunzipSync(readFileSync(process.argv[3])).toString('utf8'))
assert.equal(index.meta.major, 486, 'the index is built from the 486 dump the saves declare')
assert.ok(Object.keys(index.types).length > 3000, 'every type is carried, not a selection')

/* ------------------------------------------------- the stores DCC reads */
{
  // Straight from the name.
  const team = S.typeForStore(index, 'TeamStore', 424)
  assert.equal(team.type, 'Team')
  assert.equal(team.members.length, 424)
  const ranks = team.members.filter((m) => /Poll_CurrentRank$/.test(m.n)).map((m) => m.n).sort()
  assert.deepEqual(ranks, ['CFPPoll_CurrentRank', 'CoachesPoll_CurrentRank', 'MediaPoll_CurrentRank'],
    'the three polls the game switches between are all named')
  for (const r of ranks) {
    const m = team.members.find((x) => x.n === r)
    assert.equal(m.w, 8, `${r} is eight bits wide`)
    assert.deepEqual([m.lo, m.hi], [0, 255])
  }

  const game = S.typeForStore(index, 'SeasonGameStore', 69)
  assert.equal(game.type, 'SeasonGame')

  // Not straight from the name: HeismanRankingStore holds HeismanAwardRanking,
  // and only the member count and the shared name get there.
  const heisman = S.typeForStore(index, 'HeismanRankingStore', 4)
  assert.equal(heisman.type, 'HeismanAwardRanking')
  assert.deepEqual(heisman.members.map((m) => m.n), ['CurrentRank', 'LastWeekRank', 'Player', 'Team'])
  assert.deepEqual(
    [heisman.members[0].lo, heisman.members[0].hi], [0, 5],
    'the shortlist holds at most six names, which is why five rows and four used')
}

/* ------------------------------------------------------- what it refuses */
{
  // A name that resolves outright is trusted, count or no count: TeamStore
  // holds Team whatever the header says.
  assert.equal(S.typeForStore(index, 'TeamStore', 9999).type, 'Team')

  // A name that does not resolve falls back to the member count, and a count
  // nothing has is answered with nothing rather than the nearest thing.
  assert.equal(S.typeForStore(index, 'HeismanRankingStore', 9999), null)
  assert.equal(S.typeForStore(index, 'NoSuchThingAtAllStore', 3), null)
}

/* ------------------------------------------- what the recruit fields are */
{
  // The fields that have cost this project the most are named here, which is
  // the whole reason the dump is worth carrying.
  const r = index.types.Recruit
  assert.ok(r, 'Recruit is a type in the schema')
  const by = Object.fromEntries(r.map((m) => [m.n, m]))
  assert.deepEqual([by.NationalRank.lo, by.NationalRank.hi], [0, 4500])
  assert.deepEqual([by.CommitScore.lo, by.CommitScore.hi], [0, 1023])
  assert.equal(by.RecruitStage.e.length, 11, 'the recruiting stages are enumerated')
  assert.equal(by.TopSchoolsList.t, 'ProspectTargetSchool[]')
}

console.log('check-schema: the index carries every type, resolves the stores DCC reads,')
console.log('              names all three polls at eight bits, and refuses a store it cannot place')
