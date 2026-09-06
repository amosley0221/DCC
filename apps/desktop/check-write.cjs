// Round-trip test for the save writer, on a synthetic container.
// Builds a real FBCHUNKS file with a game table inside it, edits a game, and
// checks the rebuilt file reads back with exactly the intended change.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')
const W = require(process.argv[2])
const S = require(process.argv[3])

const teams = ['Air Force', 'Akron', 'Alabama', 'UConn', 'Delaware', 'Penn State', 'Pittsburgh']
  .map((name) => ({ slug: name, name, fullName: name, abbr: null, nickname: null, shortNickname: null, altAbbr: null }))

const ROW = 100, MEMBERS = 69, ROWS = 3
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32BE(v); return b }
const nm = Buffer.from('SeasonGameStore', 'latin1')
const head = Buffer.concat([
  Buffer.from('SPBF', 'latin1'), u32(486), u32(1), u32(0), u32(nm.length), nm,
  u32(0x40), u32(0), u32(ROWS),
  Buffer.from('BSFT', 'latin1'), u32(0), u32(0), u32(25), u32(ROWS), u32(MEMBERS), u32(0),
  Buffer.alloc(MEMBERS * 4),
])
const rows = Buffer.alloc(ROW * ROWS)
const put = (row, bit, w, v) => { for (let i = 0; i < w; i++) { const b = bit + i; if ((v >> (w - 1 - i)) & 1) rows[row * ROW + (b >> 3)] |= 1 << (7 - (b & 7)) } }
const ref = (row, at, idx) => { rows.writeUInt16BE(0x319e, row * ROW + at); rows.writeUInt16BE(idx, row * ROW + at + 2) }
// Row 1: Alabama @ Penn State, week 11, 3:00 PM, 71°F, partly cloudy, 12 mph
ref(1, 40, 5); ref(1, 12, 2)
put(1, 578, 11, 900); put(1, 664, 8, 71 + 40); put(1, 782, 4, 2); put(1, 736, 5, 12)
put(1, 791, 4, 11); put(1, 778, 4, 11); put(1, 795, 5, 11)
// Rows 0 and 2 are other games and must not move.
ref(0, 40, 6); ref(0, 12, 1); put(0, 578, 11, 720); put(0, 791, 4, 3)
ref(2, 40, 3); ref(2, 12, 0); put(2, 578, 11, 1170); put(2, 791, 4, 5)

const payload = Buffer.concat([Buffer.alloc(64), head, rows, Buffer.alloc(512)])
const stream = zlib.deflateSync(payload, { level: 6 })
// Fixed-size container with slack, exactly as the game writes it.
const file = Buffer.alloc(82 + stream.length + 4096)
file.write('FBCHUNKS', 0, 'latin1')
file.writeUInt32LE(64, 10)
file.writeUInt32LE(file.length - 82, 14)
file.writeUInt32LE(stream.length, 74)
stream.copy(file, 82)
file.write('STALE-LEFTOVER-BYTES', 82 + stream.length, 'latin1')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcc-write-'))
const save = path.join(dir, 'DYNASTY-TEST.sav')
fs.writeFileSync(save, file)

// The container reads.
const c = W.readContainer(fs.readFileSync(save))
assert.ok(c, 'container should parse')
assert.ok(c.payload.equals(payload), 'payload should inflate identically')

// An invalid enum is refused before anything is written.
const bad = W.writeGameEdits(save, [{ row: 1, weather: 99 }])
assert.equal(bad.ok, false)
assert.match(bad.message, /Weather field only holds/)
assert.ok(fs.readFileSync(save).equals(file), 'a refused edit must not touch the file')

// A real edit.
const res = W.writeGameEdits(save, [{ row: 1, kickoff: 720, temperatureF: 33, weather: 1, windMph: 20 }])
assert.equal(res.ok, true, res.message)
assert.ok(fs.existsSync(res.backup), 'a backup should be written')
assert.ok(fs.readFileSync(res.backup).equals(file), 'the backup should be the original file')

const after = W.readContainer(fs.readFileSync(save))
assert.ok(after, 'the rebuilt file should still parse')
assert.equal(after.payload.length, payload.length, 'payload size must not change')
assert.equal(fs.statSync(save).size, file.length, 'the file must keep its original size')

const games = S.readSeasonGames(after.payload, teams)
const g = games.find((x) => x.row === 1)
assert.equal(g.kickoff, 720); assert.equal(g.temperatureF, 33)
assert.equal(g.weather, 1); assert.equal(g.windMph, 20)
assert.equal(g.home, 'Penn State'); assert.equal(g.away, 'Alabama'); assert.equal(g.week, 11)
// Neighbouring games are untouched, which is the failure DynastyOS itself shows.
const g0 = games.find((x) => x.row === 0), g2 = games.find((x) => x.row === 2)
assert.equal(g0.kickoff, 720); assert.equal(g0.week, 3)
assert.equal(g2.kickoff, 1170); assert.equal(g2.week, 5)

// Only the edited row's bytes moved.
let moved = 0
for (let i = 0; i < payload.length; i++) if (payload[i] !== after.payload[i]) moved++
assert.ok(moved > 0 && moved <= 12, `expected a handful of changed bytes, got ${moved}`)

// ---- player records ----
// The player-record constants name the LAST bit of a field, not the first.
// A writer that reads them as start positions lands in the neighbouring field
// and still passes its own read-back, so this pins the convention down.
{
  const OVERALL_BIT = S.OVERALL_BIT, BASE = S.RECORD_BASE, STRIDE = S.RECORD_STRIDE
  const index = 3
  const big = Buffer.alloc((BASE + index + 1) * STRIDE + 16)
  const at = (BASE + index) * STRIDE
  // Write 77 into [OVERALL_BIT-6, OVERALL_BIT] by hand, the way readRoster reads it.
  const value = 77
  for (let k = 0; k < 7; k++) {
    const b = OVERALL_BIT - 6 + k
    if ((value >> (6 - k)) & 1) big[at + (b >> 3)] |= 1 << (7 - (b & 7))
  }
  const got = W.readPlayerNumbers(big, index)
  assert.equal(got.overall, value, 'readPlayerNumbers must treat the constant as the field end')

  // A neighbouring rating must be untouched by an overall edit.
  const neighbour = Object.entries(S.RATING_BITS)
    .map(([n, b]) => ({ n, b }))
    .sort((x, y) => Math.abs(x.b - OVERALL_BIT) - Math.abs(y.b - OVERALL_BIT))[0]
  const edited = W.applyPlayerEdits(big, [{ index, overall: 12 }]).next
  assert.equal(W.readPlayerNumbers(edited, index).overall, 12)
  assert.equal(
    W.readPlayerNumbers(edited, index).ratings[neighbour.n],
    W.readPlayerNumbers(big, index).ratings[neighbour.n],
    `editing overall must not disturb ${neighbour.n}`,
  )
  // Out-of-range values are refused before anything is written.
  assert.equal(W.checkPlayerEdits([{ index, overall: 120 }], index + 1).length, 1)
  assert.equal(W.checkPlayerEdits([{ index: 99999, overall: 50 }], index + 1).length, 1)
  assert.equal(W.checkPlayerEdits([{ index, ratings: { Nonsense: 50 } }], index + 1).length, 1)
  assert.equal(W.checkPlayerEdits([{ index, overall: 50, ratings: { Speed: 99 } }], index + 1).length, 0)
}

/* ------------------------------------------- recruiting edits are refused
   unless they land exactly where they were aimed */
{
  const STRIDE = 24, PLAYER_AT = 8, TAG = 0x213e
  const SCHOOL_ROWS = 4000
  const players = []
  for (let i = 0; i < 500; i++) {
    players.push({ index: i, team: i < 200 ? 12 : 255, recruitFlag: i >= 150 })
  }
  const pool = players.filter((p) => p.recruitFlag && p.team === 255).map((p) => p.index)

  const N = 30
  const body = Buffer.alloc((6 + N + 6) * STRIDE)
  const put = (rec, start, w, v) => {
    for (let b = 0; b < w; b++) {
      const bit = start + b
      const at = rec * STRIDE + (bit >> 3)
      const mask = 1 << (7 - (bit & 7))
      if ((v >> (w - 1 - b)) & 1) body[at] |= mask
      else body[at] &= ~mask
    }
  }
  // Every unedited bit of the record is set, so a write that strays anywhere
  // outside its field clears one and the "nothing else moved" check bites.
  body.fill(0xff)
  for (let k = 0; k < N; k++) {
    const rec = 6 + k
    body.writeUInt16BE(TAG, rec * STRIDE + PLAYER_AT)
    body.writeUInt16BE(pool[k], rec * STRIDE + PLAYER_AT + 2)
    put(rec, 96, 4, k % 7)          // stage
    put(rec, 100, 13, k + 1)        // national rank
    put(rec, 136, 12, 100 + k)
    put(rec, 148, 12, 200 + k)
    put(rec, 176, 6, k % 64)
    put(rec, 182, 10, (k * 37) % 1024)
  }

  // The interest table: ten four-byte rows per recruit, from row 1.
  const sname = Buffer.from('HighSchoolProspectTopSchoolsStore', 'latin1')
  const shead = Buffer.concat([
    Buffer.from('SPBF', 'latin1'), u32(486), u32(1), u32(0), u32(sname.length), sname,
    u32(0x40), u32(0), u32(SCHOOL_ROWS),
    Buffer.from('BSFT', 'latin1'), u32(0), u32(0), u32(1), u32(SCHOOL_ROWS), u32(2), u32(0),
    Buffer.alloc(8),
  ])
  const srows = Buffer.alloc(SCHOOL_ROWS * 4)
  // Team ids the reader will resolve to names; 2 and 5 are real schools.
  for (let k = 0; k < N; k++) {
    const start = k * 10 + 1
    for (let j = 0; j < 10; j++) srows.writeUInt16BE(j + 2, (start + j) * 4)
    for (let j = 0; j < 10; j++) srows.writeUInt16BE(500 - j * 10, (start + j) * 4 + 2)
  }

  const payload = Buffer.concat([Buffer.alloc(2048), body, Buffer.alloc(512), shead, srows, Buffer.alloc(512)])
  const board = S.readRecruitBoard(payload, players)
  assert.equal(board.length, N, `the fixture board reads: ${board.length}`)
  const one = board.find((b) => b.nationalRank === 4)
  assert.ok(one, 'rank four is on the board')
  assert.equal(one.topSchools.length, 10, 'ten schools hang off the rank')

  // Out-of-range and off-list edits never reach the writer.
  assert.equal(W.checkRecruitEdits([{ playerIndex: one.playerIndex, commitScore: 1024 }], board).length, 1)
  assert.equal(W.checkRecruitEdits([{ playerIndex: one.playerIndex, stage: 'Nonsense' }], board).length, 1)
  assert.equal(W.checkRecruitEdits([{ playerIndex: 99999, commitScore: 1 }], board).length, 1)
  assert.equal(
    W.checkRecruitEdits([{ playerIndex: one.playerIndex, interest: { 'Not A School': 5 } }], board).length, 1,
    'a school the recruit has never heard of is refused',
  )
  assert.equal(
    W.checkRecruitEdits([{ playerIndex: one.playerIndex, commitScore: 1023, stage: 'Signed' }], board).length, 0,
    'a legal edit passes the check',
  )

  // The edit lands, and only where it was aimed.
  const school = one.topSchools[3].school
  const { next, touched } = W.applyRecruitEdits(
    payload, [{ playerIndex: one.playerIndex, commitScore: 777, stage: 'Battle', interest: { [school]: 4242 } }], board,
  )
  for (let i = 0; i < next.length; i++) {
    assert.ok(next[i] === payload[i] || touched.has(i),
      `byte ${i} moved without being claimed by the edit`)
  }
  const after = S.readRecruitBoard(next, players)
  const got = after.find((b) => b.playerIndex === one.playerIndex)
  assert.equal(got.commitScore, 777)
  assert.equal(got.stage, 'Battle')
  assert.equal(got.topSchools.find((t) => t.school === school).interest, 4242)
  // Its neighbours in the same record are untouched.
  assert.equal(got.nationalRank, one.nationalRank, 'the rank did not move')
  assert.equal(got.positionRank, one.positionRank, 'the position rank did not move')
  assert.equal(got.stateRank, one.stateRank, 'the state rank did not move')
  assert.equal(got.totalOffers, one.totalOffers, 'the offer count did not move')
  // And so is every other recruit.
  const wasBy = new Map(board.map((b) => [b.playerIndex, JSON.stringify(b)]))
  for (const b of after) {
    if (b.playerIndex === one.playerIndex) continue
    assert.equal(JSON.stringify(b), wasBy.get(b.playerIndex), `recruit ${b.playerIndex} moved`)
  }
}

/* --------------------- named fields end where the reader says they end */
// Every bit position in saveAnalysis names the LAST bit of its field. The
// writer read and wrote NIL as if the number were the first, which is invisible
// on a one-bit flag and eight bits wrong on a nine-bit one.
{
  const index = 5
  const big = Buffer.alloc((S.RECORD_BASE + index + 2) * S.RECORD_STRIDE)
  const at = (S.RECORD_BASE + index) * S.RECORD_STRIDE
  const put = (endBit, width, value) => {
    for (let i = 0; i < width; i++) {
      const b = endBit - width + 1 + i
      const mask = 1 << (7 - (b & 7))
      if ((value >> (width - 1 - i)) & 1) big[at + (b >> 3)] |= mask
      else big[at + (b >> 3)] &= ~mask
    }
  }
  // Lay the record out the way saveAnalysis reads it, then ask the writer.
  put(S.NIL_BIT, 9, 40 + 255)
  put(S.STARS_BIT, 3, 4 - 1)
  put(S.DEV_TRAIT_BIT, 2, S.DEV_TRAITS.indexOf('Star'))
  put(S.DEALBREAKER_BIT, 4, S.DEALBREAKERS.indexOf('Playing Time'))
  put(S.PITCH_BIT, 5, S.IDEAL_PITCHES.indexOf('Sunday Bound'))

  const read = W.readPlayerNumbers(big, index)
  assert.equal(read.nilK, 40, `nilK reads where saveAnalysis writes it: got ${read.nilK}`)
  assert.equal(read.stars, 4, `stars: got ${read.stars}`)
  assert.equal(read.devTrait, 'Star')
  assert.equal(read.dealbreaker, 'Playing Time')
  assert.equal(read.idealPitch, 'Sunday Bound')

  // And a write lands on the same bits it just read.
  const { next, touched } = W.applyPlayerEdits(big, [{
    index, nilK: -12, stars: 2, devTrait: 'Elite', dealbreaker: 'Pro Potential', idealPitch: 'The Clutch',
  }])
  for (let i = 0; i < next.length; i++) {
    assert.ok(next[i] === big[i] || touched.has(i), `byte ${i} moved unclaimed`)
  }
  const after = W.readPlayerNumbers(next, index)
  assert.equal(after.nilK, -12)
  assert.equal(after.stars, 2)
  assert.equal(after.devTrait, 'Elite')
  assert.equal(after.dealbreaker, 'Pro Potential')
  assert.equal(after.idealPitch, 'The Clutch')
  // Ratings sit elsewhere in the record and must be untouched by any of it.
  assert.deepEqual(after.ratings, read.ratings, 'a named-field write left the ratings alone')

  // Values the game has no name for never reach the save.
  assert.equal(W.checkPlayerEdits([{ index, devTrait: 'Godlike' }], index + 1).length, 1)
  assert.equal(W.checkPlayerEdits([{ index, stars: 9 }], index + 1).length, 1)
  assert.equal(W.checkPlayerEdits([{ index, idealPitch: 'Whatever' }], index + 1).length, 1)
  assert.equal(W.checkPlayerEdits([{ index, stars: 5, devTrait: 'Elite' }], index + 1).length, 0)
}

fs.rmSync(dir, { recursive: true, force: true })
console.log(`check-write: container round-trips, edit applied, ${moved} bytes changed, neighbours intact,`)
console.log('            player fields read from the field end, a recruiting edit lands on its own bits,')
console.log('            and stars, dev trait, NIL and personality write where the reader reads them')
