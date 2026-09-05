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

fs.rmSync(dir, { recursive: true, force: true })
console.log(`check-write: container round-trips, edit applied, ${moved} bytes changed, neighbours intact`)
