/**
 * Stadium photographs, fetched from Wikimedia Commons on your own machine.
 *
 * ## Why this is in the app rather than checked into the repository
 *
 * Nothing here could be gathered where DCC is written. That sandbox reaches
 * GitHub, npm and PyPI and nothing else — a request to `commons.wikimedia.org`
 * is refused by the proxy with a 403 before it leaves — so the images have to
 * be fetched by the machine that actually runs the app. That turns out to be
 * the better arrangement anyway: a hundred and forty photographs would be tens
 * of megabytes in git, in the installer and in the APK, for a thing only one
 * person will ever look at.
 *
 * ## Finding the link, not the name
 *
 * Searching Commons for "Penn State stadium" and taking the first hit is the
 * failure this project keeps producing: a fuzzy match makes a folder of
 * unrelated pictures look like a success. So the join is a real one, out of
 * Wikidata:
 *
 *     team  --P115 (home venue)-->  venue  --P18 (image)-->  a file on Commons
 *
 * The query asks for every venue that is the home ground of an American
 * football team in NCAA Division I, with its image, and DCC then matches the
 * team's own label against the school names in your save — strictly, on the
 * same normalisation the rest of the art uses. Anything that does not match is
 * reported rather than guessed at, and a school with no photograph simply keeps
 * the drawn field behind its headline.
 *
 * ## Licences
 *
 * Commons is free content but not unconditional: most photographs are CC BY or
 * CC BY-SA, which ask for the photographer's name. DCC records the file, its
 * author, its licence and the page it came from for every image it downloads,
 * in `credits.json` beside them. Anything Commons marks as non-free is skipped.
 *
 * The parsing here is pure and checked against recorded responses; only
 * `fetchStadiums` touches the network.
 */

/** One venue, as Wikidata describes it. */
export interface VenueRow {
  /** The team's own label, e.g. "Penn State Nittany Lions football". */
  team: string
  /** The venue's label, e.g. "Beaver Stadium". */
  venue: string
  /** The Commons file page, e.g. "http://commons.wikimedia.org/wiki/Special:FilePath/Beaver%20Stadium.jpg". */
  image: string
}

/** What DCC ends up with for one school. */
export interface StadiumCredit {
  school: string
  venue: string
  /** The Commons file name, which is the licence's subject. */
  file: string
  author: string
  licence: string
  /** The file's page on Commons, which is where the terms live. */
  page: string
}

/**
 * Every FBS home ground with a photograph.
 *
 * `P118` is the league and `P115` the home venue; asking for the league rather
 * than for "college football" is what keeps high schools and stadiums that
 * merely host a bowl out of it. Both the FBS item and the older Division I-A
 * item are accepted, because Wikidata uses both.
 */
/**
 * The queries, tried in order until one answers.
 *
 * The first attempt at this was one query built on two Wikidata item ids
 * written from memory — `wd:Q5308823`, `wd:Q1194951`, meant to be the FBS and
 * Division I-A — and it returned nothing at all, because an item id recalled
 * rather than looked up is a guess with no way to be nearly right. It is the
 * same mistake as searching Commons for a school's name, one level further up.
 *
 * So none of these name an item id. They are built only from properties, which
 * are few and stable and which a wrong guess would break loudly rather than
 * silently:
 *
 *   P115  home venue      P18   image
 *   P641  sport           P466  occupant
 *
 * and where an entity has to be identified, it is identified by its English
 * label, which is a thing that can be read rather than recalled.
 *
 * They also get broader as they go. The first asks only that a team have a home
 * venue with a photograph and the word "football" in its name — that is nearly
 * every college programme and almost nothing else, and it does not depend on
 * Wikidata having classified the team at all. Breadth is safe here because the
 * *matching* is strict: a row only becomes a stadium if its team label begins
 * with one of your schools' names.
 */
export const VENUE_QUERIES: { name: string; sparql: string }[] = [
  {
    name: 'football teams with a home venue',
    sparql: `
SELECT DISTINCT ?teamLabel ?venueLabel ?image WHERE {
  ?team wdt:P115 ?venue .
  ?venue wdt:P18 ?image .
  ?team rdfs:label ?teamLabel . FILTER(LANG(?teamLabel) = "en")
  FILTER(CONTAINS(LCASE(?teamLabel), "football"))
  OPTIONAL { ?venue rdfs:label ?venueLabel . FILTER(LANG(?venueLabel) = "en") }
}
`.trim(),
  },
  {
    name: 'teams whose sport is American football',
    sparql: `
SELECT DISTINCT ?teamLabel ?venueLabel ?image WHERE {
  ?sport rdfs:label "American football"@en .
  ?team wdt:P641 ?sport ; wdt:P115 ?venue .
  ?venue wdt:P18 ?image .
  ?team rdfs:label ?teamLabel . FILTER(LANG(?teamLabel) = "en")
  OPTIONAL { ?venue rdfs:label ?venueLabel . FILTER(LANG(?venueLabel) = "en") }
}
`.trim(),
  },
  {
    name: 'venues by their occupant',
    sparql: `
SELECT DISTINCT ?teamLabel ?venueLabel ?image WHERE {
  ?venue wdt:P466 ?team ; wdt:P18 ?image .
  ?team rdfs:label ?teamLabel . FILTER(LANG(?teamLabel) = "en")
  FILTER(CONTAINS(LCASE(?teamLabel), "football"))
  OPTIONAL { ?venue rdfs:label ?venueLabel . FILTER(LANG(?venueLabel) = "en") }
}
`.trim(),
  },
]

/** Kept as the first query's text, for anything that wants just one. */
export const VENUE_QUERY = VENUE_QUERIES[0].sparql

/** Wikidata's SPARQL JSON, reduced to the three fields that matter. */
export function parseVenues(body: unknown): VenueRow[] {
  const rows = (body as { results?: { bindings?: Record<string, { value?: string }>[] } })
    ?.results?.bindings
  if (!Array.isArray(rows)) return []
  const out: VenueRow[] = []
  for (const r of rows) {
    const team = r.teamLabel?.value
    const image = r.image?.value
    // The venue's own name is a nicety — it goes in the credit line. A row
    // without one is still a photograph of the right ground.
    if (team && image) out.push({ team, venue: r.venueLabel?.value ?? '', image })
  }
  return out
}

/** The same normalisation the rest of the art uses. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * The words Wikidata puts around a school in a team's name.
 *
 * "Penn State Nittany Lions football" is the school plus a nickname plus the
 * sport. The nickname is the part that cannot be listed — there are a hundred
 * and thirty of them — so instead of trying to strip it, the match works from
 * the front: a team label matches a school when the label *starts with* that
 * school's name. "Penn State…" matches Penn State and nothing else, and a
 * longer school name always wins over a shorter one that prefixes it, which is
 * what keeps Miami from taking Miami (OH)'s ground.
 */
export function matchVenues(
  rows: VenueRow[],
  schools: { name: string; fullName?: string | null }[],
): { hits: { school: string; row: VenueRow }[]; missing: string[]; ambiguous: string[] } {
  // Rows are assigned to schools, not schools to rows, and that is the whole
  // trick. Going the other way, "Alabama" prefixes both "Alabama Crimson Tide
  // football" and "Alabama A&M Bulldogs football", so it saw two grounds and
  // gave up — and it did that to thirty-five schools, every one of them a state
  // whose name is also the start of another school's. Assigning each row to the
  // LONGEST school name that prefixes it hands the A&M row to Alabama A&M,
  // which is in the save too, and leaves Alabama with exactly one.
  const keyed = schools.map((s) => ({
    school: s.name,
    keys: [norm(s.name), ...(s.fullName ? [norm(s.fullName)] : [])].filter(Boolean),
  }))
  const claimed = new Map<string, VenueRow[]>()
  for (const row of rows) {
    const label = norm(row.team)
    let best: { school: string; len: number } | null = null
    for (const k of keyed) {
      for (const key of k.keys) {
        if (!label.startsWith(key)) continue
        if (!best || key.length > best.len) best = { school: k.school, len: key.length }
      }
    }
    if (!best) continue
    const list = claimed.get(best.school)
    if (list) list.push(row)
    else claimed.set(best.school, [row])
  }

  const hits: { school: string; row: VenueRow }[] = []
  const missing: string[] = []
  const ambiguous: string[] = []
  for (const s of schools) {
    const picked = claimed.get(s.name)
    if (!picked?.length) { missing.push(s.name); continue }
    // Two different grounds still claiming the same school is not something to
    // break a tie on. "Miami" is the start of both the Hurricanes' and the
    // RedHawks' names and no school in the save is a longer prefix of either,
    // so there is nothing left to decide it. Picking whichever came back first
    // is how you end up looking at the wrong stadium and believing it.
    const venues = new Set(picked.map((r) => r.image))
    if (venues.size > 1) { ambiguous.push(s.name); continue }
    hits.push({ school: s.name, row: picked[0] })
  }
  return { hits, missing, ambiguous }
}

/** Licences Commons marks as anything other than free. */
const NON_FREE = /fair\s*use|non-?free|all rights reserved|©|copyright(?!ed free)/i

/** The credit line for one Commons file, from its `extmetadata`. */
export function parseCredit(
  school: string, venue: string, body: unknown,
): Omit<StadiumCredit, 'file'> & { file: string; free: boolean } | null {
  const pages = (body as { query?: { pages?: Record<string, unknown> } })?.query?.pages
  if (!pages) return null
  const page = Object.values(pages)[0] as {
    title?: string
    imageinfo?: {
      thumburl?: string; url?: string; descriptionurl?: string
      extmetadata?: Record<string, { value?: string }>
    }[]
  } | undefined
  const info = page?.imageinfo?.[0]
  if (!info) return null
  const meta = info.extmetadata ?? {}
  const strip = (v?: string) => (v ?? '').replace(/<[^>]*>/g, '').trim()
  const licence = strip(meta.LicenseShortName?.value) || strip(meta.License?.value) || 'unknown'
  const author = strip(meta.Artist?.value) || 'unknown'
  return {
    school,
    venue,
    file: page?.title ?? '',
    author,
    licence,
    page: info.descriptionurl ?? '',
    // Only a *positive* non-free marking excludes a picture. A lookup that
    // failed says nothing about the terms, and treating silence as a refusal is
    // what made the first run keep none of the ninety-seven it had found.
    free: !NON_FREE.test(licence),
  }
}

/**
 * The URL that asks Commons for one file's licence and a thumbnail of it.
 *
 * A thumbnail rather than the original because the originals run to twenty
 * megabytes each and the app draws them at most a couple of thousand pixels
 * wide. Commons renders the size asked for, so nothing here has to resize.
 */
export function commonsUrl(file: string, width = 1600): string {
  const q = new URLSearchParams({
    action: 'query', format: 'json',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: String(width),
    titles: commonsTitle(file),
  })
  // No `origin=*`: that is a browser's CORS handshake, and sending it from a
  // desktop app asks MediaWiki to treat the request under rules written for
  // something else.
  return `https://commons.wikimedia.org/w/api.php?${q}`
}

/** "File:Beaver Stadium.jpg", from a P18 value or from a title already. */
export function commonsTitle(file: string): string {
  if (file.startsWith('File:')) return file
  return `File:${decodeURIComponent(file.split('/').pop() ?? file)}`
}

/**
 * Where to actually download the picture, without asking the API anything.
 *
 * `Special:FilePath` renders and redirects to the size asked for, so the image
 * arrives whether or not the metadata call worked. The first version made the
 * download depend on that call: every one of ninety-seven matches went through
 * it, every one failed, and the run wrote nothing at all while reporting a
 * single undifferentiated "skipped". A picture and a credit line are two
 * separate things and they now fail separately.
 */
export function filePathUrl(file: string, width = 1600): string {
  const name = commonsTitle(file).slice('File:'.length)
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${width}`
}

/** What the file is called in the art folder: the same shape every other mark uses. */
export const stadiumFileName = (school: string, ext = 'jpg') =>
  `stadium_${school.replace(/[^A-Za-z0-9]+/g, '')}.${ext}`
