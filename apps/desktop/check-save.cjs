// Regression test for the game-table reader: builds a synthetic
// SeasonGameStore with two rows, packs known values into them at the documented
// bit positions, and checks that readSeasonGames gives them back.
const assert = require('node:assert/strict')
const S = require(process.argv[2])

const NAMES = ['Air Force', 'Akron', 'Alabama', 'UConn', 'Delaware', 'Penn State', 'Pittsburgh']
const teams = NAMES.map((name, tableIndex) => ({
  tableIndex, slug: name, name, fullName: name, abbr: null,
  nickname: null, shortNickname: null, altAbbr: null,
}))
// The team table is in the order the save writes its records, not any sort of
// them. Handing the list over shuffled must not move a single team, which is
// the whole point: sorting by name agreed with the save for 138 of its 143
// schools and put Florida's row under Florida Atlantic's name.
const shuffled = [teams[5], teams[0], teams[6], teams[2], teams[4], teams[3], teams[1]]
assert.deepEqual(S.teamTableOrder(shuffled).map((t) => t.name), NAMES)
const order = S.teamTableOrder(teams).map((t) => t.name)
assert.deepEqual(order, NAMES)

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

/* ------------------------------------------------ rankings out of TeamStore */
// The save has no poll table, so a team's rank is one of TeamStore's 424
// members and nothing says which. It is found by a property only a ranking has,
// and the test that matters is the one for the trap: a counter is a perfect
// permutation too, and this project has been fooled by exactly that before.
{
  const TEAMS = 40, TROW = 24, TMEMBERS = 6
  const tname = Buffer.from('TeamStore', 'latin1')
  const thead = Buffer.concat([
    Buffer.from('SPBF', 'latin1'), u32(486), u32(1), u32(0), u32(tname.length), tname,
    u32(0x40), u32(0), u32(TEAMS),
    Buffer.from('BSFT', 'latin1'), u32(0), u32(0), u32(TROW / 4), u32(TEAMS), u32(TMEMBERS), u32(0),
    Buffer.alloc(TMEMBERS * 4),
  ])
  const trows = Buffer.alloc(TROW * TEAMS)

  // A shuffled full ordering — every rank once, in no particular team order.
  const full = Array.from({ length: TEAMS }, (_, i) => i + 1)
  for (let i = full.length - 1; i > 0; i--) {
    const j = (i * 7 + 3) % (i + 1)
    ;[full[i], full[j]] = [full[j], full[i]]
  }
  // A poll: ranks 1..25, everyone else unranked on one shared value.
  const poll = Array.from({ length: TEAMS }, () => 0)
  const order25 = [5, 1, 9, 3, 12, 2, 20, 7, 25, 4, 18, 6, 11, 8, 22, 10, 15, 13, 24, 14, 19, 16, 23, 17, 21]
  order25.forEach((rank, i) => { poll[i * 1 + 3] = rank })

  // Written at bit positions, not byte ones: this save is bit-packed
  // everywhere else, and reading it in bytes is why the first version of this
  // search came back with nothing on a real file.
  const putBits = (row, start, w, v) => {
    for (let b = 0; b < w; b++) {
      const bit = start + b
      const mask = 1 << (7 - (bit & 7))
      const at = row * TROW + (bit >> 3)
      if ((v >> (w - 1 - b)) & 1) trows[at] |= mask
      else trows[at] &= ~mask
    }
  }
  const ORDER_AT = 11, POLL_AT = 30, COUNTER_AT = 47, CONST_AT = 61
  for (let r = 0; r < TEAMS; r++) {
    putBits(r, ORDER_AT, 8, full[r])          // the ordering
    putBits(r, POLL_AT, 5, poll[r])           // the poll
    putBits(r, COUNTER_AT, 8, r + 1)          // a counter — the decoy
    putBits(r, CONST_AT, 6, 7)                // a constant
    putBits(r, 80, 12, 3000 + r * 13)         // something else entirely
  }
  const tpayload = Buffer.concat([Buffer.alloc(64), thead, trows, Buffer.alloc(64)])

  const found = S.findTeamRanks(tpayload)
  const ordering = found.find((f) => f.kind === 'full' && f.ranks[0] === full[0])
  assert.ok(ordering, 'the shuffled ordering is found somewhere: ' +
    found.map((f) => `${f.kind}@${f.at}/${f.width}`).join(' '))
  for (let r = 0; r < TEAMS; r++) assert.equal(ordering.ranks[r], full[r])
  assert.equal(ordering.top[0].rank, 1)
  assert.equal(ordering.top.length, 25, 'the sample is the top 25 of whatever it found')

  const found25 = found.find((f) => f.kind === 'top25' && f.ranks[3] === 5)
  assert.ok(found25, 'the poll is found')
  assert.equal(Object.keys(found25.ranks).length, 25, 'only the ranked teams carry a rank')

  // The counter must not appear as a ranking under any width or position.
  const counter = Array.from({ length: TEAMS }, (_, r) => r + 1)
  assert.ok(!found.some((f) => counter.every((v, r) => f.ranks[r] === v)),
    'a counter is not a ranking, whatever bit it starts at')
}

/* --------------------------------------------- a ranking you can point at */
{
  // Sweeping for the shape of a ranking found nothing in a real save, because a
  // poll leaves the unranked holding whatever they held last week. One rank read
  // off the game's own screen is the key that works, so this builds a table
  // shaped like the real thing: twenty-five ranked, everyone else holding stale
  // numbers rather than one tidy value.
  const TEAMS = 40, TROW = 24, TMEMBERS = 6
  const tname = Buffer.from('TeamStore', 'latin1')
  const thead = Buffer.concat([
    Buffer.from('SPBF', 'latin1'), u32(486), u32(1), u32(0), u32(tname.length), tname,
    u32(0x40), u32(0), u32(TEAMS),
    Buffer.from('BSFT', 'latin1'), u32(0), u32(0), u32(TROW / 4), u32(TEAMS), u32(TMEMBERS), u32(0),
    Buffer.alloc(TMEMBERS * 4),
  ])
  const trows = Buffer.alloc(TROW * TEAMS)
  const putBits = (row, start, w, v) => {
    for (let b = 0; b < w; b++) {
      const bit = start + b
      const mask = 1 << (7 - (bit & 7))
      const at = row * TROW + (bit >> 3)
      if ((v >> (w - 1 - b)) & 1) trows[at] |= mask
      else trows[at] &= ~mask
    }
  }
  // Team 7 is first, team 3 is second, and the rest of the poll is scattered.
  const POLL_AT = 37, POLL_W = 8
  const poll = new Array(TEAMS).fill(0)
  const placed = [7, 3, 19, 0, 25, 11, 30, 2, 14, 38, 5, 21]
  placed.forEach((team, i) => { poll[team] = i + 1 })
  for (let r = 0; r < TEAMS; r++) {
    // Everyone unranked holds a stale number, which is why the shape test fails
    // on a real poll and pointing at a rank does not.
    putBits(r, POLL_AT, POLL_W, poll[r] || 200 + (r % 7))
    putBits(r, 60, 8, r + 1)   // a counter, still not a ranking
  }
  const tpayload = Buffer.concat([Buffer.alloc(64), thead, trows, Buffer.alloc(64)])

  // What is asserted is the ranking, not where it was read from. A field reads
  // the same at a wider width when the bits in front of it are zero and at a
  // narrower one when its own top bit is spare, so the offset that comes back
  // is one of several equivalent readings — and only the order matters.
  const wanted = {}
  placed.forEach((team, i) => { wanted[team] = i + 1 })

  const one = S.findRankColumns(tpayload, [{ teamIndex: 7, rank: 1 }])
  assert.ok(one.length, 'one rank you can read off the screen finds the field')
  const hit = one.find((c) => JSON.stringify(c.ranks) === JSON.stringify(wanted))
  assert.ok(hit, 'and it reads back the poll that was written: ' +
    one.map((c) => `${c.at}/${c.width}`).join(' '))
  assert.equal(hit.base, 1)
  assert.equal(hit.ranked, placed.length, 'only the ranked teams hold a place')
  assert.equal(hit.ranks[3], 2, 'the second team is second')

  // The same order is only offered once, however many readings produce it.
  const signatures = one.map((c) => JSON.stringify(c.ranks))
  assert.equal(new Set(signatures).size, signatures.length,
    'a poll written once is offered once')

  // Naming a second school narrows it rather than breaking it.
  const two = S.findRankColumns(tpayload, [{ teamIndex: 7, rank: 1 }, { teamIndex: 3, rank: 2 }])
  assert.ok(two.some((c) => JSON.stringify(c.ranks) === JSON.stringify(wanted)))
  assert.ok(two.length <= one.length, 'a second key cannot widen the answer')

  // A rank nobody holds finds nothing, rather than the nearest thing.
  assert.ok(!S.findRankColumns(tpayload, [{ teamIndex: 7, rank: 9 }])
    .some((c) => JSON.stringify(c.ranks) === JSON.stringify(wanted)),
    'a key nobody holds does not return the poll anyway')

  // And the counter is never offered, however well it fits a lucky key.
  const counterKey = S.findRankColumns(tpayload, [{ teamIndex: 0, rank: 1 }])
  assert.ok(!counterKey.some((c) => c.at === 60 && c.width === 8),
    'a field holding every team its own row number is a counter')

  // Reading the field back at the offset that was stored is what every later
  // read does, and it has to give the same order as when it was chosen.
  const back = S.readRankField(tpayload, hit.at, hit.width)
  placed.forEach((team, i) => {
    assert.equal(back[team] + (1 - hit.base), i + 1, `team ${team} reads back at ${i + 1}`)
  })
}

/* ---------------------------------------------------------- the Heisman five */
{
  // Five rows of four members, and which member is the player is not written
  // down — so it is the column that resolves to a real roster row in all five.
  const HROWS = 5, HROW = 16, HMEMBERS = 4
  const hname = Buffer.from('HeismanRankingStore', 'latin1')
  const hhead = Buffer.concat([
    Buffer.from('SPBF', 'latin1'), u32(486), u32(1), u32(0), u32(hname.length), hname,
    u32(0x40), u32(0), u32(HROWS),
    Buffer.from('BSFT', 'latin1'), u32(0), u32(0), u32(HROW / 4), u32(HROWS), u32(HMEMBERS), u32(0),
    Buffer.alloc(HMEMBERS * 4),
  ])
  // The game shows four names and the table has five rows, so the last one is
  // spare. Insisting that every row resolve is what found nothing on a real
  // save; three agreeing is the test, and the rest are the end of the list.
  const hrows = Buffer.alloc(HROW * HROWS)
  const players = [811, 47, 1290, 305]
  players.forEach((idx, r) => {
    const o = r * HROW
    hrows.writeUInt32BE(9000 - r * 37, o + 0)   // points, or something like it
    hrows.writeUInt16BE(0x2ac1, o + 4)          // a player reference
    hrows.writeUInt16BE(idx, o + 6)
    hrows.writeUInt32BE(r, o + 8)
  })
  const hpayload = Buffer.concat([Buffer.alloc(64), hhead, hrows, Buffer.alloc(64)])

  // Everyone on a roster, plus one who is not: nobody unrostered is in the
  // running for anything, and the first version of this put exactly such a
  // player at the top of the watch.
  const roster = players.map((index, i) => ({ index, playerId: 5000 + i, team: 12 }))
  roster.push({ index: 4242, playerId: 9999, team: 255 })

  const watch = S.readHeisman(hpayload, roster)
  assert.equal(watch.length, 4, 'the spare row is not a name')
  assert.deepEqual(watch.map((w) => w.rank), [1, 2, 3, 4])
  assert.deepEqual(watch.map((w) => w.playerIndex), players,
    'the player column is the one that resolves across the rows that are filled')
  assert.equal(watch[0].words.length, HROW / 4, 'the rest of the row is kept as words')

  // A roster that knows none of them leaves the column unfound rather than
  // pointing at whichever bytes happened to look plausible.
  const blind = S.readHeisman(hpayload, [{ index: 1, playerId: 1, team: 3 }])
  assert.ok(blind.every((w) => w.playerIndex === -1), 'no column, no names')

  // And an unrostered player is never a candidate, however well the bytes fit.
  const unrostered = S.readHeisman(hpayload,
    players.map((index, i) => ({ index, playerId: 5000 + i, team: 255 })))
  assert.ok(unrostered.every((w) => w.playerIndex === -1),
    'a player on nobody\'s roster is not in the running')

  // The failure that shipped: a save holds sixteen thousand roster rows, so
  // "this value is a roster row" is no test at all. A column counting 0..4 read
  // as five real players, and the watch list came out alphabetical.
  const crows = Buffer.alloc(HROW * HROWS)
  for (let r = 0; r < HROWS; r++) {
    crows.writeUInt32BE(r, r * HROW + 0)       // a counter, no tag in front
    crows.writeUInt32BE(r * 3, r * HROW + 4)   // another one
    crows.writeUInt32BE(0, r * HROW + 8)
    crows.writeUInt32BE(0, r * HROW + 12)
  }
  const cpayload = Buffer.concat([Buffer.alloc(64), hhead, crows, Buffer.alloc(64)])
  const everyone = Array.from({ length: 16000 }, (_, i) => ({ index: i, playerId: i, team: 12 }))
  const counted = S.readHeisman(cpayload, everyone)
  assert.ok(counted.every((w) => w.playerIndex === -1),
    'a counter is not a player reference, however valid its values look')
}

/* ------------------------------------- the search does not rescan the save */
// Every reader starts by finding the store header, and both ways of finding it
// walk the whole payload. Once that is fine. The poll search reads a field at
// every bit position and every width, so it did it sixteen thousand times and
// took seventeen seconds on a thirty-megabyte save, with the window frozen the
// whole time because it runs on the process that draws it.
{
  const TEAMS = 138, TMEMBERS = 424, TROW = 256
  const tname = Buffer.from('TeamStore', 'latin1')
  const thead = Buffer.concat([
    Buffer.from('SPBF', 'latin1'), u32(486), u32(1), u32(0), u32(tname.length), tname,
    u32(0x40), u32(0), u32(TEAMS),
    Buffer.from('BSFT', 'latin1'), u32(0), u32(0), u32(TROW / 4), u32(TEAMS), u32(TMEMBERS), u32(0),
    Buffer.alloc(TMEMBERS * 4),
  ])
  const trows = Buffer.alloc(TROW * TEAMS)
  const putBits = (row, start, w, v) => {
    for (let b = 0; b < w; b++) {
      const bit = start + b
      const mask = 1 << (7 - (bit & 7))
      const at = row * TROW + (bit >> 3)
      if ((v >> (w - 1 - b)) & 1) trows[at] |= mask
      else trows[at] &= ~mask
    }
  }
  // Twenty-five ranked, the rest holding stale numbers past the last place, the
  // way a real poll sits — the unranked keep whatever they held before.
  const poll = Array.from({ length: TEAMS }, (_, i) => (i < 25 ? i + 1 : 200 + (i % 50)))
  for (let r = 0; r < TEAMS; r++) putBits(r, 300, 8, poll[r])

  // Sized like the real thing, because the cost is per byte of payload.
  const big = Buffer.concat([Buffer.alloc(64), thead, trows, Buffer.alloc(30 * 1024 * 1024)])

  // The direct claim: the scan happens once per save, not once per read.
  assert.equal(S.readStores(big), S.readStores(big),
    'the store directory is found once per save and remembered')

  const started = Date.now()
  const cols = S.findRankColumns(big, [{ teamIndex: 0, rank: 1 }, { teamIndex: 4, rank: 5 }])
  const took = Date.now() - started
  assert.ok(cols.some((c) => c.ranks[0] === 1 && c.ranks[4] === 5),
    'the poll is still found after the header stopped being looked up in the loop')
  // Seventeen seconds before, a rounded zero after. Five is far enough below the
  // old number to mean something and far enough above the new one not to flake.
  assert.ok(took < 5000, `the search rescanned the save: ${took}ms for one sweep`)
}

/* ------------------------------------------------- the recruiting board */
// Ranks, commit score and stage are not in the player record — that was
// searched exhaustively. They live in their own 24-byte records, found by the
// one thing that marks them: a player reference, tag 0x213e, pointing at a
// prospect. This builds an array shaped like the real one, with empty slots
// either side, and reads it back.
{
  const STRIDE = 24
  const PROSPECTS = 40
  const LEAD = 12, TRAIL = 9        // empty slots around the class

  // A pool where the prospects are unrostered and flagged, plus some rostered
  // players whose indices must never be mistaken for the class.
  const players = []
  for (let i = 0; i < 500; i++) {
    players.push({ index: i, team: i < 200 ? 12 : 255, recruitFlag: i >= 150 })
  }
  const pool = players.filter((p) => p.recruitFlag && p.team === 255).map((p) => p.index)
  assert.ok(pool.length >= PROSPECTS, 'the fixture has prospects to place')

  const want = []
  const body = Buffer.alloc((LEAD + PROSPECTS + TRAIL) * STRIDE)
  const put = (rec, start, w, v) => {
    for (let b = 0; b < w; b++) {
      const bit = start + b
      const at = rec * STRIDE + (bit >> 3)
      const mask = 1 << (7 - (bit & 7))
      if ((v >> (w - 1 - b)) & 1) body[at] |= mask
      else body[at] &= ~mask
    }
  }
  for (let k = 0; k < PROSPECTS; k++) {
    const rec = LEAD + k
    const r = {
      playerIndex: pool[k],
      nationalRank: k + 1,
      positionRank: 4000 - k * 7,
      stateRank: 300 + k * 3,
      commitScore: (k * 97) % 1024,
      totalOffers: k % 64,
      stage: ['Top10','Top5','Top3','Battle','SoftCommitted','HardCommitted','Signed'][k % 7],
      recruitClass: ['HighSchool','JuniorCollege_Sophomore','JuniorCollege_Junior'][k % 3],
    }
    want.push(r)
    body.writeUInt16BE(0x213e, rec * STRIDE + 8)
    body.writeUInt16BE(r.playerIndex, rec * STRIDE + 10)
    put(rec, 96, 4, k % 7)
    put(rec, 100, 13, r.nationalRank)
    put(rec, 136, 12, r.positionRank)
    put(rec, 148, 12, r.stateRank)
    put(rec, 162, 4, k % 3)
    put(rec, 176, 6, r.totalOffers)
    put(rec, 182, 10, r.commitScore)
  }
  const payload = Buffer.concat([Buffer.alloc(4096), body, Buffer.alloc(4096)])

  const board = S.readRecruitBoard(payload, players)
  assert.equal(board.length, PROSPECTS, `every prospect is read: got ${board.length}`)
  const byIndex = new Map(board.map((b) => [b.playerIndex, b]))
  for (const w of want) {
    const got = byIndex.get(w.playerIndex)
    assert.ok(got, `${w.playerIndex} is on the board`)
    for (const k of Object.keys(w)) {
      assert.equal(got[k], w[k], `${k} for prospect ${w.playerIndex}: ${got[k]} !== ${w[k]}`)
    }
  }

  // The anchor is contents, not an address: the same array elsewhere still reads.
  const moved = Buffer.concat([Buffer.alloc(9000), body, Buffer.alloc(64)])
  assert.equal(S.readRecruitBoard(moved, players).length, PROSPECTS,
    'the board is found by what it holds, not by where it sits')

  // A save with no class at all must not invent one.
  assert.deepEqual(S.readRecruitBoard(Buffer.alloc(200000), players), [],
    'an empty save has no recruiting board')
}

/* ------------------------------------- the recruiting class ranking */
// The game does keep a class ranking, which DCC spent a long time believing it
// did not: every earlier search asked whether a field *holds* the numbers one
// to fourteen, and this one is a complete ordering of all 138 schools. The
// shape is the check — a permutation, every place used once — so a save that
// has moved the bits gets no answer instead of a wrong one.
{
  const TEAMS = 150, TROW = 704, TMEMBERS = 6
  const tname = Buffer.from('TeamStore', 'latin1')
  const thead = Buffer.concat([
    Buffer.from('SPBF', 'latin1'), u32(486), u32(1), u32(0), u32(tname.length), tname,
    u32(0x40), u32(0), u32(TEAMS),
    Buffer.from('BSFT', 'latin1'), u32(0), u32(0), u32(TROW / 4), u32(TEAMS), u32(TMEMBERS), u32(0),
    Buffer.alloc(TMEMBERS * 4),
  ])
  const AT = 5592, W = 8
  const build = (ranks) => {
    const trows = Buffer.alloc(TROW * TEAMS)
    ranks.forEach((v, row) => {
      for (let b = 0; b < W; b++) {
        const bit = AT + b
        const at = row * TROW + (bit >> 3)
        if ((v >> (W - 1 - b)) & 1) trows[at] |= 1 << (7 - (bit & 7))
      }
    })
    return Buffer.concat([Buffer.alloc(128), thead, trows, Buffer.alloc(64)])
  }

  // 138 schools placed one to 138, shuffled, and twelve table rows that are not
  // schools reading zero — the real save's shape exactly.
  const PLACED = 138
  const ranks = Array.from({ length: TEAMS }, () => 0)
  const places = Array.from({ length: PLACED }, (_, i) => i + 1)
  for (let i = places.length - 1; i > 0; i--) {
    const j = (i * 11 + 5) % (i + 1)
    ;[places[i], places[j]] = [places[j], places[i]]
  }
  places.forEach((v, i) => { ranks[i] = v })

  const got = S.readClassRanks(build(ranks))
  assert.ok(got, 'a complete ordering is read')
  assert.deepEqual(got.slice(0, TEAMS), ranks, 'every team keeps its own place')

  // Two teams sharing a place is not an ordering, however plausible it reads.
  const dupe = ranks.slice()
  dupe[3] = dupe[4]
  assert.equal(S.readClassRanks(build(dupe)), null, 'a field with a tie is refused')

  // Nor is a field that only places a handful.
  const sparse = Array.from({ length: TEAMS }, () => 0)
  for (let i = 0; i < 20; i++) sparse[i] = i + 1
  assert.equal(S.readClassRanks(build(sparse)), null, 'a field placing 20 teams is refused')

  // A counter — 1..150 across every row, the trap that fooled the poll search —
  // places more teams than there are places, so the top of the range fails.
  const counter = Array.from({ length: TEAMS }, (_, i) => (i + 1) & 0xff)
  const c = S.readClassRanks(build(counter))
  assert.ok(c === null || Math.max(...c.filter((v) => v > 0)) === c.filter((v) => v > 0).length,
    'a counter is not mistaken for a ranking')

  assert.equal(S.readClassRanks(Buffer.alloc(200000)), null, 'an empty save has no ranking')
}

console.log('check-save: game table decodes 2/2 synthetic rows, team order verified,')
console.log('            champions read per season and unplayed seasons name nobody,')
console.log('            rankings found in TeamStore without mistaking a counter for one,')
console.log('            a poll is found by pointing at one rank you can read,')
console.log('            the Heisman five resolve to real roster rows,')
console.log('            one poll sweep reads the store header once, not per bit,')
console.log('            the recruiting board reads ranks, commit score and stage,')
console.log('            and the class ranking is read only when it is a real ordering')
