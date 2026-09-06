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
export const VENUE_QUERY = `
SELECT DISTINCT ?team ?teamLabel ?venueLabel ?image WHERE {
  VALUES ?league { wd:Q5308823 wd:Q1194951 }
  ?team wdt:P118 ?league ;
        wdt:P115 ?venue .
  ?venue wdt:P18 ?image .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
`.trim()

/** Wikidata's SPARQL JSON, reduced to the three fields that matter. */
export function parseVenues(body: unknown): VenueRow[] {
  const rows = (body as { results?: { bindings?: Record<string, { value?: string }>[] } })
    ?.results?.bindings
  if (!Array.isArray(rows)) return []
  const out: VenueRow[] = []
  for (const r of rows) {
    const team = r.teamLabel?.value
    const venue = r.venueLabel?.value
    const image = r.image?.value
    if (team && venue && image) out.push({ team, venue, image })
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
): { hits: { school: string; row: VenueRow }[]; missing: string[] } {
  const hits: { school: string; row: VenueRow }[] = []
  const missing: string[] = []
  for (const s of schools) {
    const keys = [norm(s.name), ...(s.fullName ? [norm(s.fullName)] : [])].filter(Boolean)
    let best: { row: VenueRow; len: number } | null = null
    for (const row of rows) {
      const label = norm(row.team)
      for (const k of keys) {
        if (!k || !label.startsWith(k)) continue
        // The longest school name that still prefixes this label wins, so a
        // school whose name contains another's cannot steal it.
        if (!best || k.length > best.len) best = { row, len: k.length }
      }
    }
    if (best) hits.push({ school: s.name, row: best.row })
    else missing.push(s.name)
  }
  return { hits, missing }
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
  const title = file.startsWith('File:') ? file : `File:${decodeURIComponent(file.split('/').pop() ?? file)}`
  const q = new URLSearchParams({
    action: 'query', format: 'json', origin: '*',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: String(width),
    titles: title,
  })
  return `https://commons.wikimedia.org/w/api.php?${q}`
}

/** The thumbnail a `commonsUrl` response points at, or the original. */
export function thumbFrom(body: unknown): string | null {
  const pages = (body as { query?: { pages?: Record<string, unknown> } })?.query?.pages
  if (!pages) return null
  const page = Object.values(pages)[0] as {
    imageinfo?: { thumburl?: string; url?: string }[]
  } | undefined
  const info = page?.imageinfo?.[0]
  return info?.thumburl ?? info?.url ?? null
}

/** What the file is called in the art folder: the same shape every other mark uses. */
export const stadiumFileName = (school: string, ext = 'jpg') =>
  `stadium_${school.replace(/[^A-Za-z0-9]+/g, '')}.${ext}`
