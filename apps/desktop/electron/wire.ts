/**
 * The wire: what happened around the country this week, written from the save.
 *
 * The home screen used to be about one team — yours — and a rotating feature.
 * This is the rest of the country: the week's upsets, the games that came down
 * to a possession, the statements, who is still unbeaten, and where the best
 * prospects in the class have landed. Every line is derived from the save's own
 * numbers; nothing here is invented and nothing is a placeholder.
 *
 * It is pure so both surfaces can use the one implementation — the desktop
 * imports it straight into the renderer, and `snapshot.ts` writes its output
 * into the Android snapshot so the phone renders the same items rather than
 * re-deriving them in Kotlin and drifting.
 *
 * What is deliberately NOT here, because the save has not given it up:
 *
 *  - Injury news. The only "Injury" in a player record is a *rating* (bit 746),
 *    the trait that governs how easily a player gets hurt. There is no injury
 *    status, no weeks-out and no injury table, so an injury wire would be
 *    fiction. See docs/SAVE-FORMAT.md.
 *  - Leaders in touchdowns, sacks or interceptions. Season statistics are not
 *    decoded — the record-book stores hold all-time marks, not this season's
 *    per-player totals. Until they are, any leaderboard would be ratings
 *    wearing a stat line's clothes.
 * "Recent" commitments used to be on that list. They are not any more: DCC now
 * remembers what the board looked like the last time it read a save, so a
 * prospect who has picked somebody since, or left, or gone somewhere else, is
 * reported as the thing that changed and dated to the week it changed in. See
 * recruitLedger.ts. Where nothing has moved yet — a first read, or a week with
 * no news — the wire falls back to where the class stands, which is still true.
 */

import type { LeagueGame, LeagueRow } from './league'
import type { RecruitEvent } from './recruitLedger'

/** One item on the wire. */
export interface WireItem {
  /** Stable across re-reads of the same save, so a list can key on it. */
  key: string
  kind: 'upset' | 'thriller' | 'statement' | 'unbeaten' | 'commit' | 'battle' | 'poll'
    | 'decommit' | 'flip'
  /** "UPSET · WEEK 11" — small caps above the line. */
  kicker: string
  headline: string
  /** One sentence of context, in the app's voice rather than a broadcaster's. */
  line: string
  /** The school whose mark heads the item, when it has one. */
  team: string | null
  /** The other school, for a game — so a helmet pair can be drawn. */
  other?: string | null
  /** `SeasonGameStore` row, so the desktop can open the box score. */
  row?: number
  /** A roster row, so the desktop can open the player. */
  playerIndex?: number
}

/** What the wire needs to know about a prospect. Any wider type satisfies it. */
export interface WireRecruit {
  index: number
  first: string
  last: string
  position: string
  stars: number
  nationalRank: number | null
  stage: string | null
  topSchools: { school: string; interest: number }[]
}

interface Game extends LeagueGame {
  row: number
  homeScore: number
  awayScore: number
  overtime?: boolean
}

const ordinal = (n: number) => {
  const t = n % 100
  if (t >= 11 && t <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/** "Oklahoma and Penn State", "A, B and C" — a sentence, not a comma list. */
const list = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

const withRank = (name: string | null, rank: number | undefined) =>
  rank && rank <= 25 ? `No. ${rank} ${name}` : (name ?? 'TBD')

/**
 * The week's news, best story first.
 *
 * `ranks` is the poll — the save's own when it has one, otherwise the table's
 * order — and it is what makes an upset an upset. Without it the games are just
 * scores, so a save with no ranking simply produces fewer items rather than
 * pretending to a story it cannot tell.
 */
export function buildWire(opts: {
  games: Game[]
  week: number | null
  table: Map<string, LeagueRow>
  ranks: Map<string, number>
  recruits: WireRecruit[]
  /**
   * What has actually changed on the board since the last read, newest first.
   * These are the real recruiting news; `recruits` is the standing of the class
   * behind them, for the weeks when nothing has moved.
   */
  events?: RecruitEvent[]
  /** Your own program, which never leads the wire — the wire is the country. */
  me?: string | null
  limit?: number
}): WireItem[] {
  const { games, week, table, ranks, recruits, events = [], me = null } = opts
  const rank = (n: string | null) => (n ? ranks.get(n) : undefined)
  const out: WireItem[] = []

  const played = week === null
    ? []
    : games.filter((g) => g.played && !g.postseason && g.week === week && g.home && g.away)

  // A hundred and twenty games are played a week and a dozen of them are
  // decided by three. Every kind is gathered, then ranked among its own and
  // capped, so one busy Saturday of close finishes cannot crowd the upsets and
  // the class off the page — which is exactly what the first version did.
  const bucket: Record<string, { item: WireItem; sort: number }[]> = {
    upset: [], thriller: [], statement: [],
  }
  const CAP: Record<string, number> = { upset: 3, thriller: 3, statement: 2 }

  for (const g of played) {
    const homeWon = g.homeScore > g.awayScore
    const winner = homeWon ? g.home : g.away
    const loser = homeWon ? g.away : g.home
    const wRank = rank(winner)
    const lRank = rank(loser)
    const margin = Math.abs(g.homeScore - g.awayScore)
    const score = `${withRank(winner, wRank)} ${Math.max(g.homeScore, g.awayScore)}, ` +
      `${withRank(loser, lRank)} ${Math.min(g.homeScore, g.awayScore)}`
    const wRow = winner ? table.get(winner) : undefined

    // An upset needs a ranked side to lose to someone below them. A team ranked
    // 24th beating the 22nd is not news; losing to the unranked is.
    if (lRank && lRank <= 25 && (!wRank || wRank - lRank >= 8)) {
      bucket.upset.push({ sort: lRank, item: {
        key: `upset:${g.row}`, kind: 'upset', row: g.row,
        kicker: `Upset · week ${g.week}`,
        headline: score,
        line: wRank
          ? `${winner} came in ${ordinal(wRank)} and took down the ${ordinal(lRank)} team in the country.`
          : `${loser} were ${ordinal(lRank)} in the country and lost to a team outside the poll` +
            (wRow ? ` sitting at ${wRow.wins}-${wRow.losses}.` : '.'),
        team: winner, other: loser,
      } })
      continue
    }

    // A possession or less, with a ranked side in it — otherwise every 17-14
    // game in the country crowds out the ones that mattered. "Ranked" means the
    // top 25 and not merely somewhere in the order: every team in the country
    // has a place in that list, so anything looser lets all 143 through.
    const best = Math.min(wRank ?? 999, lRank ?? 999)
    if (margin <= 3 && best <= 25) {
      bucket.thriller.push({ sort: best * 10 + margin, item: {
        key: `close:${g.row}`, kind: 'thriller', row: g.row,
        kicker: `One possession · week ${g.week}`,
        headline: score,
        line: `${margin === 0 ? 'Level' : `${margin} point${margin === 1 ? '' : 's'}`} in it` +
          `${g.overtime ? ', and it went to overtime' : ''} — ${winner} got out of it.`,
        team: winner, other: loser,
      } })
      continue
    }

    // The other kind of story: a top-ten team leaving no doubt.
    if (wRank && wRank <= 10 && margin >= 28) {
      bucket.statement.push({ sort: wRank, item: {
        key: `statement:${g.row}`, kind: 'statement', row: g.row,
        kicker: `Statement · week ${g.week}`,
        headline: score,
        line: `${winner} won it by ${margin}` +
          (wRow ? `, and are ${wRow.wins}-${wRow.losses}.` : '.'),
        team: winner, other: loser,
      } })
    }
  }

  for (const kind of Object.keys(bucket)) {
    for (const { item } of bucket[kind].sort((a, b) => a.sort - b.sort).slice(0, CAP[kind])) {
      out.push(item)
    }
  }

  // The unbeaten, which is the one standings line that is genuinely news every
  // week: it only ever gets shorter.
  const unbeaten = [...table.values()]
    .filter((r) => r.wins + r.losses > 0 && r.losses === 0)
    .sort((a, b) => (rank(a.name) ?? 999) - (rank(b.name) ?? 999) || b.wins - a.wins)
  if (unbeaten.length) {
    const names = list(unbeaten.slice(0, 4).map((r) => r.name))
    out.push({
      key: `unbeaten:${week ?? 0}:${unbeaten.length}`, kind: 'unbeaten',
      kicker: week ? `Still perfect · week ${week}` : 'Still perfect',
      headline: unbeaten.length === 1
        ? `${unbeaten[0].name} stand alone`
        : unbeaten.length <= 3
          ? `${list(unbeaten.map((r) => r.name))} are still perfect`
          : `${unbeaten.length} unbeaten`,
      line: unbeaten.length === 1
        ? `${unbeaten[0].name} are ${unbeaten[0].wins}-0 and the last team in the country without a loss.`
        : unbeaten.length > 4
          ? `${names}, and ${unbeaten.length - 4} more, have not lost yet.`
          : `${names} have not lost yet.`,
      team: unbeaten[0].name,
    })
  }

  // The board, as news: who picked somebody since the last read, who left, who
  // went somewhere else. Dated to the week it happened in rather than to the
  // week you are reading it.
  let moved = 0
  for (const e of events) {
    if (moved >= 4) break
    const who = `${e.first} ${e.last}`
    const rank = e.nationalRank && e.nationalRank > 0
      ? `the ${ordinal(e.nationalRank)} prospect in the country`
      : `a ${'★'.repeat(e.stars)} ${e.position}`
    const when = week !== null && e.week < week ? ` · week ${e.week}` : ''
    if (e.kind === 'decommit') {
      out.push({
        key: e.key, kind: 'decommit', playerIndex: e.playerIndex,
        kicker: `Decommitted${when}`,
        headline: `${who} reopens his recruitment`,
        line: `${'★'.repeat(e.stars)} ${e.position}, ${rank}. He is off ${e.from ?? 'his school'}'s board` +
          `${e.from === me ? ' — yours' : ''} and taking calls again.`,
        team: e.from, other: null,
      })
    } else if (e.kind === 'flip') {
      out.push({
        key: e.key, kind: 'flip', playerIndex: e.playerIndex,
        kicker: `Flipped${when}`,
        headline: `${who} flips from ${e.from} to ${e.to}`,
        line: `${'★'.repeat(e.stars)} ${e.position}, ${rank}.` +
          (e.to === me ? ' Yours now.' : e.from === me ? ' He was yours.' : ''),
        team: e.to, other: e.from,
      })
    } else {
      out.push({
        key: e.key, kind: 'commit', playerIndex: e.playerIndex,
        kicker: `${e.kind === 'signed' ? 'Signed' : 'Committed'}${when}`,
        headline: `${e.to} land ${who}`,
        line: `${'★'.repeat(e.stars)} ${e.position}, ${rank}.` + (e.to === me ? ' Yours.' : ''),
        team: e.to, other: null,
      })
    }
    moved++
  }

  // Where the class stands, for the weeks nothing has moved in. Never alongside
  // the news above: a standing dressed as a headline beside a real commitment
  // is the thing that makes both of them untrustworthy.
  const ranked = moved > 0 ? [] : recruits
    .filter((r) => r.nationalRank && r.nationalRank > 0)
    .sort((a, b) => (a.nationalRank ?? 9999) - (b.nationalRank ?? 9999))
  for (const r of ranked.slice(0, 60)) {
    const lead = r.topSchools[0]
    const committed = r.stage === 'SoftCommitted' || r.stage === 'HardCommitted' || r.stage === 'Signed'
    if (committed && lead) {
      if (out.filter((i) => i.kind === 'commit').length >= 4) continue
      out.push({
        key: `commit:${r.index}`, kind: 'commit', playerIndex: r.index,
        kicker: r.stage === 'Signed' ? 'Signed' : 'Committed',
        headline: `${lead.school} land ${r.first} ${r.last}`,
        line: `${'★'.repeat(r.stars)} ${r.position}, the ${ordinal(r.nationalRank ?? 0)} ` +
          `prospect in the country` +
          (r.stage === 'SoftCommitted' ? ' — soft, and other schools are still calling.' : '.') +
          (lead.school === me ? ' Yours.' : ''),
        team: lead.school,
      })
      continue
    }
    // A fight worth naming: two schools close together at the top of the list.
    const [a, b] = r.topSchools
    if (!committed && a && b && a.interest - b.interest <= 40) {
      if (out.filter((i) => i.kind === 'battle').length >= 2) continue
      out.push({
        key: `battle:${r.index}`, kind: 'battle', playerIndex: r.index,
        kicker: 'Still open',
        headline: `${r.first} ${r.last} down to ${a.school} and ${b.school}`,
        line: `${'★'.repeat(r.stars)} ${r.position}, ${ordinal(r.nationalRank ?? 0)} in the country. ` +
          `${a.school} lead by ${a.interest - b.interest}.`,
        team: a.school, other: b.school,
      })
    }
  }

  // Yours is a story, but it is never the top one — that is the whole point of
  // the wire. Anything of yours drops below the country's.
  const mine = (i: WireItem) => (i.team === me || i.other === me ? 1 : 0)
  const weight: Record<WireItem['kind'], number> = {
    upset: 0, flip: 1, decommit: 2, thriller: 3, commit: 4,
    statement: 5, battle: 6, unbeaten: 7, poll: 8,
  }
  out.sort((x, y) => mine(x) - mine(y) || weight[x.kind] - weight[y.kind])
  return out.slice(0, opts.limit ?? 12)
}
