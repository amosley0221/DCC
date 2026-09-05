// Regression test for the game-table reader: builds a synthetic
// SeasonGameStore with two rows, packs known values into them at the documented
// bit positions, and checks that readSeasonGames gives them back.
const assert = require('node:assert/strict')
const S = require(process.argv[2])

const teams = ['Air Force', 'Akron', 'Alabama', 'UConn', 'Delaware', 'Penn State', 'Pittsburgh']
  .map((name) => ({ slug: name, name, fullName: name === 'Air Force' ? 'Air Force' : name, abbr: null, nickname: null, shortNickname: null, altAbbr: null }))
// Team-table order: full name, UConn as Connecticut → Air Force, Akron, Alabama, UConn, Delaware, Penn State, Pittsburgh
const order = S.teamTableOrder(teams).map((t) => t.name)
assert.deepEqual(order, ['Air Force', 'Akron', 'Alabama', 'UConn', 'Delaware', 'Penn State', 'Pittsburgh'])

const ROW = 100, MEMBERS = 69, ROWS = 2
const name = Buffer.from('SeasonGameStore', 'latin1')
const head = Buffer.concat([
  Buffer.from('SPBF', 'latin1'), u32(486), u32(1), u32(0), u32(name.length), name,
  u32(0x40), u32(0), u32(ROWS),
  Buffer.from('BSFT', 'latin1'), u32(0), u32(0), u32(25), u32(ROWS), u32(MEMBERS), u32(0),
  Buffer.alloc(MEMBERS * 4),
])
const rows = Buffer.alloc(ROW * ROWS)
function u32(v) { const b = Buffer.alloc(4); b.writeUInt32BE(v); return b }
function put(row, bit, w, v) { for (let i = 0; i < w; i++) { const b = bit + i, on = (v >> (w - 1 - i)) & 1; const o = row * ROW + (b >> 3); if (on) rows[o] |= 1 << (7 - (b & 7)) } }
function ref(row, at, idx) { rows.writeUInt16BE(0x319e, row * ROW + at); rows.writeUInt16BE(idx, row * ROW + at + 2) }

// Row 0: Alabama @ Penn State, week 8 Oct 21, 2:15 PM, 106,572, 53°F, Rain, wind 10, 28-21 (7/14/0/7 vs 7/0/0/14)
ref(0, 40, 5); ref(0, 12, 2)
put(0, 578, 11, 855); put(0, 589, 19, 106572); put(0, 640, 8, 28); put(0, 648, 8, 21); put(0, 664, 8, 53 + 40)
put(0, 729, 7, 7); put(0, 722, 7, 14); put(0, 715, 7, 0); put(0, 708, 7, 7)
put(0, 690, 7, 7); put(0, 697, 7, 0); put(0, 747, 7, 0); put(0, 754, 7, 14)
put(0, 736, 5, 10); put(0, 778, 4, 10); put(0, 782, 4, 5); put(0, 791, 4, 8); put(0, 795, 5, 21); put(0, 789, 1, 1)
// Row 1: Penn State @ Pittsburgh, week 11, unplayed, 3:00 PM, overtime flag off
ref(1, 40, 6); ref(1, 12, 5); put(1, 578, 11, 900); put(1, 791, 4, 11); put(1, 778, 4, 11); put(1, 795, 5, 11)

const payload = Buffer.concat([Buffer.alloc(64), head, rows, Buffer.alloc(64)])
const games = S.readSeasonGames(payload, teams)
assert.equal(games.length, 2)
const [g0, g1] = games
assert.equal(g0.home, 'Penn State'); assert.equal(g0.away, 'Alabama')
assert.equal(g0.week, 8); assert.equal(g0.month, 10); assert.equal(g0.day, 21)
assert.equal(g0.kickoff, 855); assert.equal(g0.attendance, 106572); assert.equal(g0.temperatureF, 53)
assert.equal(g0.weather, 5); assert.equal(g0.windMph, 10)
assert.equal(g0.homeScore, 28); assert.equal(g0.awayScore, 21)
assert.deepEqual(g0.homeQ, [7, 14, 0, 7]); assert.deepEqual(g0.awayQ, [7, 0, 0, 14])
assert.equal(g0.played, true); assert.equal(g0.userPlayed, true); assert.equal(g0.overtime, false); assert.equal(g0.postseason, false)
assert.equal(g1.home, 'Pittsburgh'); assert.equal(g1.away, 'Penn State'); assert.equal(g1.week, 11)
assert.equal(g1.played, false); assert.equal(g1.kickoff, 900)
/* -------------------------------------------------- the title, and the season */
// YearSummaryStore is where the champion lives — the game table carries the
// bowls but not the playoff — so a row is built with the two team references it
// holds, plus rows for a season not yet decided and for the free-list chain the
// unused rows carry, which is what makes counting seasons work.
{
  const YROW = 44, YMEMBERS = 17, YROWS = 6
  const yname = Buffer.from('YearSummaryStore', 'latin1')
  const yhead = Buffer.concat([
    Buffer.from('SPBF', 'latin1'), u32(486), u32(1), u32(0), u32(yname.length), yname,
    u32(0x40), u32(0), u32(YROWS),
    Buffer.from('BSFT', 'latin1'), u32(0), u32(0), u32(YROW / 4), u32(YROWS), u32(YMEMBERS), u32(0),
    Buffer.alloc(YMEMBERS * 4),
  ])
  const yrows = Buffer.alloc(YROW * YROWS)
  const yref = (row, at, idx) => {
    yrows.writeUInt16BE(0x319e, row * YROW + at)
    yrows.writeUInt16BE(idx, row * YROW + at + 2)
  }
  // Season 1: Alabama over UConn. Season 2: Penn State over Pittsburgh.
  yrows.writeUInt32BE(304, 0 * YROW); yref(0, 8, 2); yref(0, 16, 3)
  yrows.writeUInt32BE(524, 1 * YROW); yref(1, 8, 5); yref(1, 16, 6)
  // Season 3 is being played: it carries something, but no title yet.
  yrows.writeUInt32BE(652, 2 * YROW)
  // Rows nobody has reached hold their own index plus one, and nothing else.
  for (let r = 3; r < YROWS; r++) yrows.writeUInt32BE(r + 1, r * YROW + 4)

  const ypayload = Buffer.concat([Buffer.alloc(64), yhead, yrows, Buffer.alloc(64)])

  const titles = S.readChampions(ypayload)
  assert.equal(titles.length, 2, 'a season with no title game played names nobody')
  assert.deepEqual(titles.map((t) => t.season), [1, 2])
  assert.equal(order[titles[0].championIndex], 'Alabama')
  assert.equal(order[titles[0].runnerUpIndex], 'UConn')
  assert.equal(order[titles[1].championIndex], 'Penn State')
  assert.equal(order[titles[1].runnerUpIndex], 'Pittsburgh')

  // The season count is the rows carrying anything but the free-list word.
  assert.equal(S.readSeasonOrdinal(ypayload), 3,
    'three rows carry data, so the dynasty is in its third season')

  // And the store header measures itself, which is what locates all of this.
  const t = S.storeTable(ypayload, 'YearSummaryStore')
  assert.equal(t.rowBytes, YROW)
  assert.equal(t.rows, YROWS)
  assert.equal(t.memberBits.length, YMEMBERS)
}

console.log('check-save: game table decodes 2/2 synthetic rows, team order verified,')
console.log('            champions read per season and unplayed seasons name nobody')
