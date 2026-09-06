// Stadium photographs come from outside the game, which makes them the one
// category where a wrong picture is possible. The join is Wikidata's own — a
// team's home venue, and that venue's image — and the matching is checked here
// against recorded responses, because "it found something" is not evidence it
// found the right thing.
const assert = require('node:assert/strict')
const S = require(process.argv[2])

/* --------------------------------------------------- Wikidata's SPARQL JSON */
const sparql = {
  results: {
    bindings: [
      {
        teamLabel: { value: 'Penn State Nittany Lions football' },
        venueLabel: { value: 'Beaver Stadium' },
        image: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/Beaver%20Stadium.jpg' },
      },
      {
        teamLabel: { value: 'Miami Hurricanes football' },
        venueLabel: { value: 'Hard Rock Stadium' },
        image: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/Hard%20Rock.jpg' },
      },
      {
        teamLabel: { value: 'Miami (OH) RedHawks football' },
        venueLabel: { value: 'Yager Stadium' },
        image: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/Yager.jpg' },
      },
      // No image: it must not come through as a venue with an empty picture.
      { teamLabel: { value: 'Nowhere State football' }, venueLabel: { value: 'A Field' } },
    ],
  },
}

const rows = S.parseVenues(sparql)
assert.equal(rows.length, 3, 'a venue with no image is not a venue DCC can use')

/* ------------------------------------------------------------ the queries */
// The first version of this named two Wikidata item ids written from memory and
// returned nothing at all. An item id recalled rather than looked up is a guess
// with no way of being nearly right, so none of these carry one: they are built
// from properties, and anything that must be identified is identified by its
// English label.
assert.ok(S.VENUE_QUERIES.length >= 2, 'one query that might fail is not a plan')
for (const q of S.VENUE_QUERIES) {
  assert.ok(q.name && q.sparql, 'every query says what it is')
  assert.ok(!/\bwd:Q\d+/.test(q.sparql), `${q.name} names a Wikidata item id: ${q.sparql}`)
  assert.ok(/\?teamLabel/.test(q.sparql) && /\?image/.test(q.sparql),
    `${q.name} must return the two fields the matcher needs`)
}
assert.deepEqual(rows[0], {
  team: 'Penn State Nittany Lions football',
  venue: 'Beaver Stadium',
  image: 'http://commons.wikimedia.org/wiki/Special:FilePath/Beaver%20Stadium.jpg',
})
// A venue with no English label is still the right photograph.
assert.equal(
  S.parseVenues({ results: { bindings: [
    { teamLabel: { value: 'Nameless State football' }, image: { value: 'x.jpg' } },
  ] } }).length, 1, 'a missing venue name does not lose the picture')

assert.deepEqual(S.parseVenues({}), [], 'a response that is not one is not a venue list')
assert.deepEqual(S.parseVenues(null), [])

/* ------------------------------------------------------------- the matching */
{
  const schools = [
    { name: 'Penn State' },
    { name: 'Miami' },
    { name: 'Miami (OH)' },
    { name: 'Somewhere Tech' },
  ]
  const { hits, missing, ambiguous } = S.matchVenues(rows, schools)
  const of = (n) => hits.find((h) => h.school === n)?.row.venue

  assert.equal(of('Penn State'), 'Beaver Stadium')
  // The one that matters: "Miami" prefixes "Miami (OH) RedHawks" too, and the
  // longest school name that fits has to win or the two swap grounds.
  assert.equal(of('Miami (OH)'), 'Yager Stadium')
  // And plain "Miami" prefixes BOTH at the same length, so there is no longest
  // name to decide it. Guessing there is how you end up looking at the wrong
  // stadium and believing it, so it is reported rather than picked.
  assert.ok(ambiguous.includes('Miami'), 'a tie between two grounds is not broken')
  assert.ok(!hits.some((h) => h.school === 'Miami'))
  // Nothing matched at all is reported too, never filled in with the nearest.
  assert.deepEqual(missing, ['Somewhere Tech'])
  assert.ok(!hits.some((h) => h.school === 'Somewhere Tech'))

  // One school, two rows, same photograph: not a tie, just a duplicate.
  const dupe = S.matchVenues([
    rows[0],
    { team: 'Penn State Nittany Lions', venue: 'Beaver Stadium', image: rows[0].image },
  ], [{ name: 'Penn State' }])
  assert.equal(dupe.hits.length, 1, 'the same ground twice is still one ground')
  assert.deepEqual(dupe.ambiguous, [])
}

/* ------------------------------------------------------ licences and thumbs */
{
  const body = {
    query: {
      pages: {
        '123': {
          title: 'File:Beaver Stadium.jpg',
          imageinfo: [{
            thumburl: 'https://upload.wikimedia.org/thumb/beaver/1600px-beaver.jpg',
            url: 'https://upload.wikimedia.org/beaver.jpg',
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Beaver_Stadium.jpg',
            extmetadata: {
              LicenseShortName: { value: 'CC BY-SA 4.0' },
              Artist: { value: '<a href="/wiki/User:Someone">Someone</a>' },
            },
          }],
        },
      },
    },
  }
  const c = S.parseCredit('Penn State', 'Beaver Stadium', body)
  assert.equal(c.licence, 'CC BY-SA 4.0')
  assert.equal(c.author, 'Someone', 'the markup around an author is not the author')
  assert.equal(c.page, 'https://commons.wikimedia.org/wiki/File:Beaver_Stadium.jpg')
  assert.equal(c.free, true)
  assert.equal(S.thumbFrom(body), 'https://upload.wikimedia.org/thumb/beaver/1600px-beaver.jpg',
    'the rendered size, not the twenty-megabyte original')

  // Anything Commons marks as non-free is not downloaded at all.
  const unfree = JSON.parse(JSON.stringify(body))
  unfree.query.pages['123'].imageinfo[0].extmetadata.LicenseShortName.value = 'Fair use'
  assert.equal(S.parseCredit('X', 'Y', unfree).free, false)

  assert.equal(S.parseCredit('X', 'Y', {}), null)
  assert.equal(S.thumbFrom({}), null)
}

/* --------------------------------------------------------------- file names */
{
  assert.equal(S.stadiumFileName('Penn State'), 'stadium_PennState.jpg')
  assert.equal(S.stadiumFileName('Miami (OH)'), 'stadium_MiamiOH.jpg')
  // It has to survive the art indexer's own pattern, or the download lands in
  // the folder and is never seen again.
  assert.ok(/^stadium[_-](.+)\.jpg$/i.test(S.stadiumFileName('Texas A&M')))

  const url = S.commonsUrl('http://commons.wikimedia.org/wiki/Special:FilePath/Beaver%20Stadium.jpg')
  assert.ok(url.includes('titles=File%3ABeaver+Stadium.jpg'), url)
  assert.ok(url.includes('iiurlwidth=1600'), url)
  assert.ok(S.commonsUrl('File:Already.jpg').includes('titles=File%3AAlready.jpg'))
}

console.log('check-stadiums: no item ids in any query, the Miami tie, licences, thumbnails and file names')
