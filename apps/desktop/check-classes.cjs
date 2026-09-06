// The class table: how a school's recruiting class is ordered.
// Pure arithmetic over commits, so this needs no save — which is the point of
// keeping it in its own module that both apps import.
const assert = require('node:assert/strict')
const R = require(process.argv[2])

/* ------------------------------------------------ which stages join a class */
{
  for (const s of ['SoftCommitted', 'HardCommitted', 'Signed']) {
    assert.ok(R.isCommitted(s), `${s} is in somebody's class`)
  }
  for (const s of ['Top10', 'Top5', 'Top3', 'Battle']) {
    assert.ok(!R.isCommitted(s), `${s} is still being recruited`)
  }
  assert.ok(!R.isFirm('SoftCommitted'), 'a soft commit can still flip')
  assert.ok(R.isFirm('HardCommitted') && R.isFirm('Signed'))
}

/* -------------------------------- one great recruit beats a pile of ordinary */
{
  const elite = [{ school: 'A', stars: 5, nationalRank: 1, firm: true }]
  const many = Array.from({ length: 12 }, (_, i) => ({
    school: 'B', stars: 2, nationalRank: 2000 + i, firm: true,
  }))
  const table = R.classTable([...elite, ...many])
  assert.equal(table[0].school, 'A',
    `the country's best recruit outweighs twelve two-stars: got ${table[0].school}`)
  assert.equal(table[0].commits, 1)
  assert.equal(table[1].commits, 12)
}

/* ------------------------------------------- and depth still counts for something */
{
  const one = [{ school: 'A', stars: 4, nationalRank: 300, firm: true }]
  const five = Array.from({ length: 5 }, (_, i) => ({
    school: 'B', stars: 4, nationalRank: 290 + i, firm: true,
  }))
  const table = R.classTable([...one, ...five])
  assert.equal(table[0].school, 'B', 'five equals beat one of them')
}

/* ------------------------------------------------------- what a row reports */
{
  const table = R.classTable([
    { school: 'A', stars: 5, nationalRank: 4, firm: true },
    { school: 'A', stars: 5, nationalRank: 9, firm: false },
    { school: 'A', stars: 3, nationalRank: 700, firm: true },
    { school: '', stars: 5, nationalRank: 2, firm: true },
  ])
  assert.equal(table.length, 1, 'a commit with no school is not a class')
  const a = table[0]
  assert.equal(a.commits, 3)
  assert.equal(a.soft, 1, 'the one who can still flip is counted apart')
  assert.deepEqual(a.byStar, [2, 0, 1, 0, 0], 'two fives and a three')
  assert.equal(a.best, 4, 'the headline is the best commit')
}

/* ------------------------------------- ties break somewhere rather than wobble */
{
  const table = R.classTable([
    { school: 'Zephyr', stars: 4, nationalRank: 50, firm: true },
    { school: 'Anvil', stars: 4, nationalRank: 50, firm: true },
  ])
  assert.equal(table[0].school, 'Anvil', 'identical classes order by name, not by chance')
}

/* -------------------------------------------------- an empty class list is empty */
assert.deepEqual(R.classTable([]), [])

console.log('check-classes: commits join a class from the right stages, one great recruit')
console.log('               outweighs a pile of ordinary ones, depth still counts, and a')
console.log('               row reports its softs, its stars and its best')
