// Regression test for what makes a player hard to talk out of his school.
// The conversation is the model's; the ordering is DCC's, and it has to hold —
// a starter at a ten-win program must always be a harder call than a
// third-stringer at a losing one, whatever else changes.
const assert = require('node:assert/strict')
const T = require(process.argv[2])

const target = (over) => ({
  first: 'A', last: 'One', position: 'WR', overall: 78,
  team: 'Their School', depth: { slot: 'WR', string: 2, of: 3 },
  teamWins: 6, teamLosses: 4, teamStrength: 78,
  ...over,
})
const coach = (over) => ({ team: 'Yours', wins: 6, losses: 4, strength: 78, ...over })

const score = (t, c) => T.resistance(t, c).score

// Depth is the biggest single term, and it has to run the right way round.
{
  const starter = score(target({ depth: { slot: 'WR', string: 1, of: 3 } }), coach())
  const backup = score(target({ depth: { slot: 'WR', string: 2, of: 3 } }), coach())
  const third = score(target({ depth: { slot: 'WR', string: 3, of: 3 } }), coach())
  const off = score(target({ depth: null }), coach())
  assert.ok(starter > backup, 'a starter is harder to move than his backup')
  assert.ok(backup > third, 'the man behind two is easier than the man behind one')
  assert.ok(third < starter && off < starter, 'anyone not starting is easier than the starter')
}

// A winning program is a reason to stay; a losing one is a reason to listen.
{
  const winning = score(target({ teamWins: 9, teamLosses: 1 }), coach())
  const losing = score(target({ teamWins: 2, teamLosses: 8 }), coach())
  assert.ok(winning > losing, 'their record matters, and in the obvious direction')
}

// And so does the room he would be walking into.
{
  const better = score(target({ teamStrength: 70 }), coach({ strength: 82 }))
  const worse = score(target({ teamStrength: 84 }), coach({ strength: 70 }))
  assert.ok(better < worse, 'a stronger roster than his own is an easier sell')
}

// The hardest possible call and the easiest, at the extremes, stay in range.
{
  const hardest = score(
    target({ depth: { slot: 'QB', string: 1, of: 3 }, teamWins: 11, teamLosses: 0, teamStrength: 90, overall: 95 }),
    coach({ wins: 1, losses: 10, strength: 66 }),
  )
  const easiest = score(
    target({ depth: null, teamWins: 1, teamLosses: 10, teamStrength: 66 }),
    coach({ wins: 11, losses: 0, strength: 90 }),
  )
  assert.ok(hardest > 80, `the hardest call should read hard, got ${hardest}`)
  assert.ok(easiest < 25, `the easiest call should read easy, got ${easiest}`)
  assert.ok(hardest <= 95 && easiest >= 5, 'nothing is impossible and nothing is free')
}

// Every reason shown is a sentence, because the screen prints them as prose.
{
  const { because } = T.resistance(target(), coach())
  assert.ok(because.length >= 1)
  for (const line of because) assert.ok(/[.]$/.test(line), `"${line}" should read as a sentence`)
}

// The cap is what stops a resistant player being talked round in three texts.
{
  assert.equal(T.capMove(50, 90), 1, 'a very resistant player barely moves however good the text')
  assert.ok(T.capMove(50, 10) > T.capMove(50, 90), 'an easier player moves further on the same text')
  assert.equal(T.capMove(-40, 10), -8, 'saying the wrong thing costs the same whoever he is')
  assert.equal(T.capMove(0, 50), 0, 'a text that lands flat moves nothing')
}

// Standing is what the user reads instead of the number, so it has to be
// monotone in it.
{
  const steps = [0, 10, 30, 50, 70, 90].map((n) => T.standing(n))
  assert.equal(new Set(steps).size, steps.length, 'each band says something different')
  assert.match(T.standing(0), /Nothing/)
  assert.match(T.standing(100), /coming with you/)
}

/* ----------------------------------------- he answers before you say anything */
// A new conversation opens with the player picking up to a number he does not
// know. The line is DCC's own: it costs no API credit, and it is what makes the
// coach's first text a reply rather than a cold open.
{
  assert.ok(T.OPENERS.length >= 3, 'there is more than one way to answer a phone')
  for (const line of T.OPENERS) assert.ok(/\?$/.test(line), `"${line}" asks who is calling`)
  // The same player always answers the same way, so the screen does not reshuffle
  // as it redraws.
  const k = 'smith:john:42'
  assert.equal(T.opener(k), T.opener(k), 'the same key gives the same line')
  assert.ok(T.OPENERS.includes(T.opener(k)), 'the line comes from the list')
  // And different players do not all say the same thing.
  const seen = new Set()
  for (let i = 0; i < 400; i++) seen.add(T.opener(`player:${i}`))
  assert.ok(seen.size >= 3, `keys spread across the openers: got ${seen.size}`)
  assert.equal(T.opener(''), T.OPENERS[0], 'an empty key still answers')
}

console.log('tamper OK')