// Regression test for the depth chart reader: builds a synthetic region of
// three teams, packs known players into known slots, and checks they come back
// — including an empty slot, which a team without a fullback really has and
// which used to end the scan.
const assert = require('node:assert/strict')
const S = require(process.argv[2])

const { DEPTH_REF_TAG: TAG, DEPTH_SLOT_BYTES: W, DEPTH_SLOTS_PER_TEAM: N, DEPTH_SLOTS } = S
assert.equal(DEPTH_SLOTS.length, N, 'the slot table has to cover every slot')
assert.deepEqual(
  [...DEPTH_SLOTS.map((s) => s.abbr)],
  [...DEPTH_SLOTS.map((s) => s.abbr)].sort((a, b) => a.localeCompare(b)),
  'the save stores the slots alphabetically by abbreviation — that is what identified them',
)

const TEAMS = 3
const rows = new Set()
for (let r = 100; r < 400; r++) rows.add(r)

// Noise either side, so the reader has to find the region rather than be handed it.
const pad = Buffer.alloc(500, 0x5a)
const region = Buffer.alloc(TEAMS * N * W)
const want = []
for (let t = 0; t < TEAMS; t++) {
  for (let s = 0; s < N; s++) {
    const at = (t * N + s) * W
    // Slot 4 of team 1 is left empty on purpose.
    const depth = t === 1 && s === 4 ? 0 : (s % 4) + 1
    const list = []
    for (let k = 0; k < depth; k++) {
      const row = 100 + ((t * N + s + k * 7) % 300)
      region.writeUInt16BE(TAG, at + k * 4)
      region.writeUInt16BE(row, at + k * 4 + 2)
      list.push(row)
    }
    want.push(list)
  }
}
const payload = Buffer.concat([pad, region, pad])

const charts = S.readDepthCharts(payload, rows)
assert.ok(charts, 'the region was not found')
assert.equal(charts.length, TEAMS, `expected ${TEAMS} teams, got ${charts.length}`)
let i = 0
for (const c of charts) {
  assert.equal(c.slots.length, N)
  for (const slot of c.slots) assert.deepEqual(slot.rows, want[i++], `slot ${slot.slot} of block ${c.block}`)
}

// The empty slot has to survive as an empty slot, not as a break in the region.
assert.deepEqual(charts[1].slots[4].rows, [])

// A payload with no region at all must say so rather than inventing one.
assert.equal(S.readDepthCharts(Buffer.alloc(4000, 0x11), rows), null)

// The writer rewrites a slot in place: same 24 bytes, references packed at the
// front, tail zeroed, and nothing outside the slot allowed to move.
const W2 = require(process.argv[3])
const base = charts[0].slots[0].offset
const target = charts[2].slots[9]
const reordered = [...target.rows].reverse()
const { next, touched } = W2.applyDepthEdits(payload, [{ block: 2, slot: 9, rows: reordered }], base)
assert.equal(next.length, payload.length, 'the payload must not change size')
for (let i = 0; i < next.length; i++) {
  if (next[i] !== payload[i]) assert.ok(touched.has(i), `byte 0x${i.toString(16)} moved outside the slot`)
}
const back = S.readDepthCharts(next, rows)
assert.deepEqual(back[2].slots[9].rows, reordered, 'the reorder did not read back')
for (let b = 0; b < TEAMS; b++) {
  for (let s = 0; s < N; s++) {
    if (b === 2 && s === 9) continue
    assert.deepEqual(back[b].slots[s].rows, charts[b].slots[s].rows, `slot ${s} of ${b} moved and should not have`)
  }
}
// Shortening a slot has to zero the tail, not leave a stale reference behind.
const short = target.rows.slice(0, 1)
const trimmed = S.readDepthCharts(
  W2.applyDepthEdits(payload, [{ block: 2, slot: 9, rows: short }], base).next, rows)
assert.deepEqual(trimmed[2].slots[9].rows, short, 'the tail was not cleared')

console.log(`check-depth: ${TEAMS} teams x ${N} slots round-trip, empty slot kept, slot table alphabetical,`)
console.log('            reorder rewrites only its own 24 bytes and reads back')
