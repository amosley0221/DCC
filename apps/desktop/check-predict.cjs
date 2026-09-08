// A prediction is the one number on the page the save does not contain, so it
// has to be defensible on its own terms: never dressed up as the game's, never
// built on a record that does not exist yet, and never so large that it stops
// describing football. These are the rules that keep it honest.
const assert = require('node:assert/strict')
const P = require(process.argv[2])

const row = (name, wins, losses, pf, pa) => ({
  name, conference: 'Big Ten', division: null,
  wins, losses, confWins: 0, confLosses: 0,
  pointsFor: pf, pointsAgainst: pa, results: [],
})

const unbeaten = row('Penn State', 12, 0, 480, 190)
const middling = row('Purdue', 6, 6, 300, 310)
const poor = row('Kent State', 2, 10, 180, 420)

/* ------------------------------------------- the better team is the favourite */
{
  const p = P.predict(unbeaten, middling, true)
  assert.equal(p.favourite, 'Penn State')
  assert.equal(p.underdog, 'Purdue')
  assert.ok(p.margin >= 14 && p.margin <= 25,
    `12-0 over 6-6 should look like a two- or three-score game, got ${p.margin}`)
}

/* ------------------------- and it stays the favourite when the sides are swapped */
{
  // At a neutral site nothing distinguishes the two slots, so the answer must
  // not depend on which one the schedule happened to write the team into.
  const a = P.predict(unbeaten, middling, true)
  const b = P.predict(middling, unbeaten, true)
  assert.equal(a.favourite, b.favourite)
  assert.equal(a.margin, b.margin)
}

/* ------------------------------------------------ home advantage exists, barely */
{
  const same = () => row('Iowa', 8, 4, 320, 280)
  const neutral = P.predict(same(), same(), true)
  const atHome = P.predict(same(), same(), false)
  assert.ok(neutral.tossUp, 'two identical teams on neutral ground is a coin toss')
  assert.equal(atHome.favourite, 'Iowa')
  assert.ok(atHome.margin <= 3, `home field is worth a field goal, not a touchdown, got ${atHome.margin}`)
}

/* ------------------------------------ a team with no games has nothing to judge */
{
  // `power` would read an empty record as mediocrity rather than as silence,
  // and week one would open with a page of confident nonsense.
  assert.equal(P.predict(row('Ohio State', 0, 0, 0, 0), middling, true), null)
  assert.equal(P.predict(middling, row('Ohio State', 0, 0, 0, 0), true), null)
  assert.equal(P.predict(undefined, middling, true), null)
  assert.equal(P.predict(middling, undefined, true), null)
}

/* ---------------------------------------------------- the margin stays plausible */
{
  const p = P.predict(unbeaten, poor, true)
  assert.ok(p.margin <= 35, `no estimate should exceed five touchdowns, got ${p.margin}`)
  assert.ok(p.margin >= 1)
  // Nobody is ever favoured by nothing: a rounded-down edge is still an edge.
  const hair = P.predict(row('A', 7, 5, 300, 299), row('B', 7, 5, 300, 300), true)
  assert.ok(hair.margin >= 1, 'a favourite by zero is not a favourite')
}

/* -------------------------------------------- confidence describes the same gap */
{
  // Unbeaten against a .500 team really is two and a half scores, so the
  // middle band needs a genuinely middling gap to sit in: 9-3 against 6-6.
  assert.equal(P.predict(unbeaten, poor, true).confidence, 'heavy')
  assert.equal(P.predict(unbeaten, middling, true).confidence, 'heavy')
  assert.equal(P.predict(row('Illinois', 9, 3, 380, 300), middling, true).confidence, 'clear')
  assert.equal(P.predict(row('A', 7, 5, 300, 280), row('B', 6, 6, 290, 290), true).confidence, 'slight')
}

/* ------------------------------------ and a coin toss says so rather than guessing */
{
  const same = () => row('Iowa', 8, 4, 320, 280)
  assert.equal(P.predictionLine(P.predict(same(), same(), true)), 'Too close to call')
  assert.equal(P.predictionLine(P.predict(unbeaten, middling, true)),
    `Penn State by ${P.predict(unbeaten, middling, true).margin}`)
  assert.equal(P.predictionLine(null), null, 'no prediction prints nothing, not "null"')
}

/* --------------------------------------- the poll outranks the record when it disagrees */
{
  // Purdue at 6-6 is nobody's idea of a contender, but a poll that says
  // otherwise knows something the record does not: who they played.
  const withoutPoll = P.predict(unbeaten, middling, true)
  const withPoll = P.predict(unbeaten, middling, true, { home: 12, away: 3 })
  assert.equal(withoutPoll.favourite, 'Penn State')
  assert.ok(withPoll.margin < withoutPoll.margin,
    'a poll that rates the underdog highly should narrow the gap, not widen it')
}

/* ------------------------------------ an unread poll changes nothing at all */
{
  // Most saves have no poll column identified, and those pages must read
  // exactly as they did before the poll was ever wired in.
  const bare = P.predict(unbeaten, middling, true)
  const empty = P.predict(unbeaten, middling, true, { home: null, away: null })
  assert.equal(bare.margin, empty.margin)
  assert.equal(bare.favourite, empty.favourite)
  // A poll place outside the top 25 is not a place at all.
  const beyond = P.predict(unbeaten, middling, true, { home: 44, away: 61 })
  assert.equal(bare.margin, beyond.margin)
}

/* -------------------------------- being ranked beats not being ranked */
{
  const a = row('A', 8, 4, 320, 280)
  const b = row('B', 8, 4, 320, 280)
  const p = P.predict(a, b, true, { home: 25, away: null })
  assert.equal(p.favourite, 'A', 'the last ranked team is still ahead of an unranked one')
  assert.ok(p.margin >= 1)
}

/* --------------------------------------- and the poll is still only half the answer */
{
  // A number one seed does not become a nineteen-point favourite over an
  // unbeaten peer just because the poll separates them by one place.
  const p = P.predict(unbeaten, row('Georgia', 12, 0, 470, 200), true, { home: 1, away: 2 })
  assert.ok(p.margin <= 4, `#1 against #2 is not a rout, got ${p.margin}`)
}

/* -------------------------------------------------- the bracket plays itself out */
{
  const field = { teams: [] }
  for (let i = 1; i <= 12; i++) {
    // Strictly descending quality, so the favourite in every game is knowable
    // by hand and the champion has to be the top seed.
    field.teams.push({ seed: i, row: row(`Seed ${i}`, 13 - i, i - 1, 500 - i * 20, 150 + i * 15) })
  }
  const b = P.predictBracket(field)
  assert.equal(b.games.length, 11, 'four, four, two and the title')
  assert.equal(b.champion, 'Seed 1')

  // Every slot is reachable by a key that does not move as the teams do.
  const keys = b.games.map((g) => g.key)
  assert.deepEqual(keys.slice(0, 4).sort(), ['first:5v12', 'first:6v11', 'first:7v10', 'first:8v9'])
  assert.deepEqual(keys.slice(4, 8), ['quarter:1', 'quarter:4', 'quarter:3', 'quarter:2'])
  assert.deepEqual(keys.slice(8, 10), ['semi:1v4', 'semi:3v2'])
  assert.equal(keys[10], 'final')
  assert.equal(new Set(keys).size, 11, 'no two games answer to the same key')

  // The first round is on a campus and nothing after it is.
  assert.ok(b.games.slice(0, 4).every((g) => g.onCampus))
  assert.ok(b.games.slice(4).every((g) => !g.onCampus))

  // The seeds that meet in the title game come from opposite halves.
  const final = b.games[10]
  assert.notEqual(final.home, final.away)
}

/* -------------------------------- a bracket that cannot be filled says so, quietly */
{
  // Rather than throwing, or naming a champion out of four teams and eight holes.
  const b = P.predictBracket({ teams: [{ seed: 1, row: unbeaten }, { seed: 2, row: middling }] })
  assert.ok(b.games.length > 0)
  assert.ok(b.games.some((g) => g.prediction === null), 'a game with an empty slot has no call')
}

console.log('predict: ok')
