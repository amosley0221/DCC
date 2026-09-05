// Pins how a recruit is told apart from a player on a roster.
//
// This is the classification that decides what both apps show, and getting it
// wrong is quiet: rosters silently lose players to the recruit pool and nothing
// errors. It was wrong once — the team check was missing — which left Penn
// State showing 26 of its 85 players and a recruiting pool of 10,790.
const assert = require('node:assert/strict')
const Snap = require(process.argv[2])

const UNASSIGNED = 255
const player = (over) => ({
  index: 1, playerId: 1, first: 'A', last: 'B', team: 7, position: 'QB', overall: 70,
  hometown: '', assetId: 'Unique_BA_1', redshirt: false, recruitFlag: false, ratings: {},
  ...over,
})

// A recruit: nobody's roster, flagged, and generated rather than a real person.
assert.equal(Snap.isRecruit(player({ team: UNASSIGNED, recruitFlag: true, assetId: 'Generic_1_P_T0001_A_1_1' })), true)

// Every one of the three conditions has to hold.
assert.equal(Snap.isRecruit(player({ team: UNASSIGNED, recruitFlag: false, assetId: 'Generic_1_P_T0001_A_1_1' })), false,
  'unflagged players who have left a roster are not recruits')
assert.equal(Snap.isRecruit(player({ team: UNASSIGNED, recruitFlag: true, assetId: 'Unique_Smith_9' })), false,
  'a real named player is not a recruit')
assert.equal(Snap.isRecruit(player({ team: 74, recruitFlag: true, assetId: 'Generic_1_P_T0001_A_1_1' })), false,
  'the flag stays set after signing, so anyone on a roster is a player')

// The regression itself: a rostered player carrying the flag must stay a player.
const roster = [
  player({ index: 1, team: 74, recruitFlag: true, assetId: 'Generic_1_P_T0074_A_1_1' }),
  player({ index: 2, team: 74, recruitFlag: false, assetId: 'Unique_Jones_2' }),
  player({ index: 3, team: UNASSIGNED, recruitFlag: true, assetId: 'Generic_2_P_T0000_A_1_1' }),
]
assert.deepEqual(roster.map(Snap.isRecruit), [false, false, true])

console.log('check-snapshot: a recruit is unrostered, flagged and generated — all three')
