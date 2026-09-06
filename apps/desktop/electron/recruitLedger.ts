/**
 * What changed on the recruiting board since the last time DCC read a save.
 *
 * A commitment is news by *changing*. One save is one moment: it says where a
 * prospect stands, never when they got there, so no single read can tell you
 * anybody committed this week. The only way to know is to remember — the same
 * bargain the transfer ledger makes, and for the same reason.
 *
 * So every roster read files what it saw, stamped with the season and week the
 * save was sitting on, and the next read compares. A prospect who was being
 * chased and is now committed is a commitment; one who was committed and is
 * not any more is a decommitment; one who is committed somewhere else is a
 * flip. Nothing is inferred beyond that.
 *
 * Two rules keep it honest:
 *
 *  - The first sighting of a prospect is never news. DCC did not watch them
 *    commit; it arrived to find them committed, and saying "committed this
 *    week" would be a guess about when.
 *  - A save from *earlier* than what is already recorded is ignored outright.
 *    Opening last month's file must not manufacture a week of decommitments
 *    out of a board that has simply not happened yet.
 *
 * Pure, so the same code runs in the checks and in the app.
 */

/** What a read saw of one prospect. */
export interface RecruitSighting {
  /** Roster row — how the rest of the app refers to them. */
  playerIndex: number
  first: string
  last: string
  position: string
  stars: number
  nationalRank: number | null
  /** The save's own stage: Top10 … Battle, SoftCommitted, HardCommitted, Signed. */
  stage: string
  /** The school at the front of their list — where they are committed, when they are. */
  school: string | null
}

/** Where a prospect stood the last time DCC looked. */
export interface RecruitState {
  stage: string
  school: string | null
  season: number
  week: number
}

export interface RecruitEvent {
  /** Stable, so re-reading the same save files nothing twice. */
  key: string
  season: number
  week: number
  playerIndex: number
  first: string
  last: string
  position: string
  stars: number
  nationalRank: number | null
  kind: 'commit' | 'decommit' | 'flip' | 'signed'
  /** Where they were committed before, when they were. */
  from: string | null
  /** Where they are committed now, when they are. */
  to: string | null
}

export interface RecruitLedger {
  version: number
  /** `${season}:${playerIndex}` to where they stood. A class is a season's own. */
  seen: Record<string, RecruitState>
  /** Newest last. */
  events: RecruitEvent[]
}

export const RECRUIT_LEDGER_VERSION = 1

/** The stages that mean a prospect has picked somebody. */
const COMMITTED = new Set(['SoftCommitted', 'HardCommitted', 'Signed'])

export const emptyRecruitLedger = (): RecruitLedger =>
  ({ version: RECRUIT_LEDGER_VERSION, seen: {}, events: [] })

/** Beyond this the file is trimmed oldest-first; a season is nowhere near it. */
const MAX_EVENTS = 4000

/**
 * File a read, and return the ledger with whatever it proved.
 *
 * Never mutates what it is given: the caller writes the result, so a failed
 * write leaves the ledger exactly as it was rather than half-updated.
 */
export function fileRecruiting(
  ledger: RecruitLedger,
  sightings: RecruitSighting[],
  season: number,
  week: number,
): { ledger: RecruitLedger; added: RecruitEvent[] } {
  const seen = { ...ledger.seen }
  const known = new Set(ledger.events.map((e) => e.key))
  const added: RecruitEvent[] = []

  for (const s of sightings) {
    const id = `${season}:${s.playerIndex}`
    const prev = seen[id]

    // An older save than the one already recorded says nothing about now.
    if (prev && (season < prev.season || (season === prev.season && week < prev.week))) continue

    const committed = COMMITTED.has(s.stage)
    const school = committed ? s.school : null
    const next: RecruitState = { stage: s.stage, school, season, week }

    if (!prev) { seen[id] = next; continue }

    const was = COMMITTED.has(prev.stage)
    const kind: RecruitEvent['kind'] | null =
      !was && committed ? 'commit'
      : was && !committed ? 'decommit'
      : was && committed && prev.school !== school ? 'flip'
      : was && committed && prev.stage !== 'Signed' && s.stage === 'Signed' ? 'signed'
      : null

    seen[id] = next
    if (!kind) continue

    const key = `${season}:${week}:${s.playerIndex}:${kind}`
    if (known.has(key)) continue
    known.add(key)
    added.push({
      key, season, week, playerIndex: s.playerIndex,
      first: s.first, last: s.last, position: s.position, stars: s.stars,
      nationalRank: s.nationalRank, kind,
      from: prev.school, to: school,
    })
  }

  const events = [...ledger.events, ...added]
  return {
    ledger: {
      version: RECRUIT_LEDGER_VERSION,
      seen,
      events: events.length > MAX_EVENTS ? events.slice(events.length - MAX_EVENTS) : events,
    },
    added,
  }
}

/**
 * The board's news for a week, best prospect first.
 *
 * `back` looks at the weeks before it too, because a save opened on week 12
 * still wants last week's commitments on the page when nothing has moved yet —
 * an empty wire is worse than a slightly older one, and each item carries its
 * own week so nothing is passed off as newer than it is.
 */
export function recruitingNews(
  ledger: RecruitLedger,
  season: number,
  week: number,
  back = 2,
): RecruitEvent[] {
  return ledger.events
    .filter((e) => e.season === season && e.week <= week && e.week > week - back - 1)
    .sort((a, b) =>
      b.week - a.week ||
      (a.nationalRank ?? 9999) - (b.nationalRank ?? 9999) ||
      b.stars - a.stars)
}
