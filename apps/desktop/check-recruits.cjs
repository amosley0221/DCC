// A commitment is news by changing, and one save cannot tell you what changed.
// This is the memory that makes it news, so the two rules that keep it honest —
// a first sighting is never news, and an older save never rewrites the board —
// are checked here rather than trusted.
const assert = require('node:assert/strict')
const R = require(process.argv[2])

const p = (i, stage, school, extra = {}) => ({
  playerIndex: i, first: 'A', last: `Player${i}`, position: 'QB', stars: 5,
  nationalRank: i, stage, school, ...extra,
})

/* ------------------------------------------- the first read is never news */
let led = R.emptyRecruitLedger()
{
  const r = R.fileRecruiting(led, [
    p(1, 'Top10', 'Alabama'),
    p(2, 'HardCommitted', 'Ohio State'),
  ], 2027, 5)
  assert.deepEqual(r.added, [], 'arriving to find somebody committed is not watching them commit')
  assert.equal(Object.keys(r.ledger.seen).length, 2, 'but both are now remembered')
  led = r.ledger
}

/* ----------------------------------------------------- what changed, and when */
{
  const r = R.fileRecruiting(led, [
    // 1 has picked somebody: a commitment.
    p(1, 'SoftCommitted', 'Alabama'),
    // 2 has left: a decommitment.
    p(2, 'Battle', 'Ohio State'),
  ], 2027, 6)
  assert.equal(r.added.length, 2)
  const commit = r.added.find((e) => e.playerIndex === 1)
  assert.equal(commit.kind, 'commit')
  assert.equal(commit.from, null)
  assert.equal(commit.to, 'Alabama')
  assert.equal(commit.week, 6, 'dated to the week the save was on')

  const gone = r.added.find((e) => e.playerIndex === 2)
  assert.equal(gone.kind, 'decommit')
  assert.equal(gone.from, 'Ohio State', 'and it says who he left')
  assert.equal(gone.to, null)
  led = r.ledger
}

/* ------------------------------------------------------------------ a flip */
{
  const r = R.fileRecruiting(led, [p(1, 'HardCommitted', 'Georgia')], 2027, 7)
  assert.equal(r.added.length, 1)
  assert.equal(r.added[0].kind, 'flip')
  assert.equal(r.added[0].from, 'Alabama')
  assert.equal(r.added[0].to, 'Georgia')
  led = r.ledger
}

/* --------------------------------------------------------- signing day */
{
  const r = R.fileRecruiting(led, [p(1, 'Signed', 'Georgia')], 2027, 8)
  assert.equal(r.added.length, 1)
  assert.equal(r.added[0].kind, 'signed')
  led = r.ledger
}

/* ------------------------------------------------- reading the same save twice */
{
  const r = R.fileRecruiting(led, [p(1, 'Signed', 'Georgia')], 2027, 8)
  assert.deepEqual(r.added, [], 'nothing changed, so nothing is filed')
  assert.equal(r.ledger.events.length, led.events.length)
  led = r.ledger
}

/* ------------------------------------------- an older save is not the present */
{
  const before = led.events.length
  const r = R.fileRecruiting(led, [p(1, 'Top10', 'Alabama')], 2027, 3)
  assert.equal(r.added.length, 0, 'week 3 says nothing about a board last seen in week 8')
  assert.equal(r.ledger.events.length, before)
  assert.equal(r.ledger.seen['2027:1'].week, 8, 'and it does not roll the memory back')
}

/* ---------------------------------------------------- a season is its own class */
{
  const r = R.fileRecruiting(led, [p(1, 'HardCommitted', 'Texas')], 2028, 2)
  assert.deepEqual(r.added, [], 'a new class starts over: the first sighting is not news')
  assert.ok(r.ledger.seen['2028:1'], 'and is remembered under its own season')
  assert.ok(r.ledger.seen['2027:1'], 'without disturbing last season')
}

/* ---------------------------------------------------------------- the week's news */
{
  const news = R.recruitingNews(led, 2027, 8)
  assert.ok(news.length >= 1)
  assert.ok(news.every((e) => e.season === 2027 && e.week <= 8))
  assert.ok(news[0].week >= news[news.length - 1].week, 'newest first')
  assert.deepEqual(R.recruitingNews(led, 2027, 1), [], 'nothing has happened by week 1')
  // The window looks back, so a quiet week still has something true to show.
  assert.ok(R.recruitingNews(led, 2027, 8, 3).length >= R.recruitingNews(led, 2027, 8, 0).length)
}

console.log('check-recruits: a first sighting is not news, commits, decommits, flips, signing, re-reads and an older save')
