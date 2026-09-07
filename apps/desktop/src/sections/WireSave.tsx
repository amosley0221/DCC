import { useEffect, useMemo, useState } from 'react'
import { useKit, usePoll, useSave } from '../saveStore'
import { useStore } from '../store'
import { Btn, Kicker, Meta, PlayerFace, SchoolArt, Tab } from '../ui'
import type { StoredStory } from '../../electron/sidecar'
import { TEAM_ID_NAMES } from '../../electron/teamIds'
import { dateLabel, kickoffLabel, weatherName } from '../../electron/gameEnums'
import type { RosterPlayer, SeasonGame } from '../../electron/saveAnalysis'
import { buildLeague, orderByRanks, rankings, visibleGames, winPct } from '../../electron/league'
import { currentWeek, weekLabel } from '../../electron/season'
import { leaders, seasonTotals, type StatLeaderKey } from '../../electron/teamStats'
import { buildWire, type WireItem } from '../../electron/wire'
import {
  gameWeight, matchupFacts, matchupHeadline, matchupLines, matchupStandfirst,
} from '../../electron/matchup'
import type { MatchupFacts } from '../../electron/matchup'

const UNASSIGNED = 255

/** The six ratings a prospect card leads with, per position group. */
const CARD_RATINGS: Record<string, string[]> = {
  QB: ['Throwing Power', 'Short Throw Accuracy', 'Deep Throw Accuracy', 'Throw on the Run', 'Awareness', 'Speed'],
  HB: ['Speed', 'Acceleration', 'Agility', 'Break Tackle', 'Carrying', 'BC Vision'],
  FB: ['Run Blocking', 'Impact Blocking', 'Carrying', 'Strength', 'Awareness', 'Speed'],
  WR: ['Speed', 'Catching', 'Short Route Running', 'Deep Route Running', 'Release', 'Agility'],
  TE: ['Catching', 'Short Route Running', 'Run Blocking', 'Strength', 'Speed', 'Catch in Traffic'],
  LT: ['Pass Blocking', 'Run Blocking', 'Strength', 'Awareness', 'Pass Block Power', 'Impact Blocking'],
  LE: ['Power Moves', 'Finesse Moves', 'Block Shedding', 'Strength', 'Pursuit', 'Tackling'],
  DT: ['Power Moves', 'Block Shedding', 'Strength', 'Tackling', 'Pursuit', 'Awareness'],
  MLB: ['Tackling', 'Block Shedding', 'Pursuit', 'Zone Coverage', 'Hit Power', 'Speed'],
  CB: ['Speed', 'Man Coverage', 'Zone Coverage', 'Press', 'Acceleration', 'Awareness'],
  FS: ['Speed', 'Zone Coverage', 'Tackling', 'Pursuit', 'Awareness', 'Hit Power'],
  K: ['Kicking Power', 'Kicking Accuracy', 'Awareness', 'Stamina', 'Toughness', 'Speed'],
}
const GENERIC = ['Speed', 'Acceleration', 'Agility', 'Strength', 'Awareness', 'Toughness']
function cardRatings(pos: string): string[] {
  if (CARD_RATINGS[pos]) return CARD_RATINGS[pos]
  if (['LG', 'C', 'RG', 'RT'].includes(pos)) return CARD_RATINGS.LT
  if (pos === 'RE') return CARD_RATINGS.LE
  if (['LOLB', 'ROLB'].includes(pos)) return CARD_RATINGS.MLB
  if (pos === 'SS') return CARD_RATINGS.FS
  if (pos === 'P') return CARD_RATINGS.K
  return GENERIC
}

/**
 * A player's face where the front page used to draw their initials. The art is
 * already indexed for the roster screens; there was no reason Home was the one
 * place that did not use it.
 */
function Face({ p, size }: {
  p: { first: string; last: string; assetId?: string | null; team?: number }
  size: number
}) {
  const { save } = useSave()
  const { state } = useStore()
  const kit = useKit(state.teamNames)
  return (
    <PlayerFace
      className="gs-row-avatar" round size={size}
      first={p.first} last={p.last}
      file={p.assetId ? save.facePaths[p.assetId] : undefined}
      {...kit(p.team)}
    />
  )
}


const ratingTone = (v: number) => (v >= 85 ? 'is-high' : v >= 75 ? 'is-mid' : 'is-low')

const SLIDES = ['GAME', 'COUNTRY', 'HEISMAN', 'CLASS'] as const
type Slide = (typeof SLIDES)[number]

/** How long the feature holds on one story before turning over. */
const TURN_MS = 11000

/** The positions a Heisman is given to, and how much the award favours each. */
const HEISMAN_WEIGHT: Record<string, number> = { QB: 1, HB: 0.86, WR: 0.8, TE: 0.68 }

/**
 * Home.
 *
 * Your program and your board on the left, the feature in the middle, the
 * week's results on the right. Opening a score or a player swaps the middle
 * column rather than navigating away, so the rails stay put and you keep your
 * place — which is the whole reason the layout is three columns.
 *
 * The feature turns over: your game, the country's biggest results, the Heisman
 * watch, the class. It stops the moment you pick one, because a page that moves
 * while you are reading it is a page you cannot read.
 *
 * Everything here is read out of the save. The one thing written rather than
 * read is the lead story, generated on demand from a fact sheet of these same
 * numbers, so it can describe the game but cannot invent one.
 */
/** The leaderboards the front page offers, in the order they read. */
const STAT_BOARDS: [StatLeaderKey, string][] = [
  ['totalOffense', 'OFFENSE'],
  ['rushYards', 'RUSH'],
  ['passYards', 'PASS'],
  ['yardsAllowed', 'DEFENSE'],
]

export default function WireSave({ onOpenLeague }: { onOpenLeague?: () => void } = {}) {
  const { save } = useSave()
  const { state, dispatch } = useStore()
  const roster = save.roster
  const nameOf = (id: number) => state.teamNames[id] ?? TEAM_ID_NAMES[id] ?? null
  const me = state.teamId === null ? null : nameOf(state.teamId)

  const [open, setOpen] = useState<{ kind: 'game'; row: number } | { kind: 'player'; index: number } | null>(null)
  const [slide, setSlide] = useState<Slide>('GAME')
  const [holding, setHolding] = useState(false)
  const [rail, setRail] = useState<'CONF' | 'TOP25'>('CONF')

  const games = roster?.games ?? []
  /** The league table, the same one the League screen stands on. */
  const teams = useMemo(() => (roster?.coaches ?? [])
    .map((c) => ({ name: nameOf(c.teamId) ?? '', conference: c.conference, division: c.division }))
    .filter((t) => t.name), [roster, state.teamNames])
  // Built from what you have reached. The game sims the country before your own
  // Saturday, so a save on week 11 already holds week 11's scores — a record or
  // a ranking taken from those would spoil a week you have not played.
  const holdFrom = useMemo(() => currentWeek(games, me), [games, me])
  const table = useMemo(
    () => buildLeague(visibleGames(games, me, holdFrom), teams),
    [games, teams, me, holdFrom],
  )
  /**
   * The country's team statistics, over the games you are allowed to see.
   *
   * Read out of the save's own TeamStats store. The rows are filtered to the
   * same visible set the league table stands on, so a leaderboard cannot show
   * you a yard gained in a week you have not played yet.
   */
  const statTotals = useMemo(() => {
    const shown = new Set(visibleGames(games, me, holdFrom).map((g) => g.row))
    const lines = (roster?.teamStats ?? []).filter((s) => shown.has(s.gameIndex))
    const school = new Map(lines.map((s) => [s.teamIndex, s.school]))
    return { totals: seasonTotals(lines), school }
  }, [roster, games, me, holdFrom])

  /** Which leaderboard the rail is showing. */
  const [board, setBoard] = useState<StatLeaderKey>('totalOffense')
  const statLeaders = useMemo(
    () => leaders(statTotals.totals, board, 5).map((l) => ({
      ...l, school: statTotals.school.get(l.teamIndex) ?? null,
    })).filter((l) => l.school),
    [statTotals, board],
  )

  const season = save.roster?.season ?? null
  const poll = usePoll()
  const order = useMemo(
    () => (poll.ranks ? orderByRanks(table, poll.ranks) : rankings(table)),
    [table, poll.ranks],
  )
  const rankOf = useMemo(() => {
    const m = new Map<string, number>()
    order.forEach((r, i) => m.set(r.name, i + 1))
    return m
  }, [order])

  const record = me ? table.get(me) : undefined
  const conference = record?.conference ?? null

  /** The week you have reached, and everyone else's results from it. */
  /**
   * The week the *country* has reached, not the week you last played.
   *
   * Those are the same thing until championship weekend, when nine conferences
   * settle their titles and yours has not kicked off yet. The page said week 13
   * while its own title bar said 15, because it was reporting the last Saturday
   * this one team had a result from. A page about the sport takes the latest
   * week anybody has a result in, held back the same way everything else is.
   */
  const week = useMemo(() => {
    const played = visibleGames(games, me, holdFrom).filter((g) => g.played && !g.postseason)
    if (!played.length) return null
    return Math.max(...played.map((g) => g.week))
  }, [games, me, holdFrom])

  const weekGames = useMemo(
    () => visibleGames(games, me, holdFrom).filter((g) => g.played && !g.postseason && g.week === week),
    [games, me, holdFrom, week],
  )

  /** Everybody still without a loss, best-ranked first. */
  const unbeaten = useMemo(
    () => [...table.values()]
      .filter((r) => r.wins + r.losses > 0 && r.losses === 0)
      .sort((a, b) => (rankOf.get(a.name) ?? 999) - (rankOf.get(b.name) ?? 999)),
    [table, rankOf],
  )

  /**
   * The best of next year's class, wherever they are going.
   *
   * The rail used to be your eight. This is the country's, in the game's own
   * order, with the school leading each one beside them — which is the version
   * of that list a front page would run.
   */
  const national = useMemo(() => {
    const byIndex = new Map((roster?.players ?? []).map((p) => [p.index, p]))
    return (roster?.recruitBoard ?? [])
      .filter((b) => b.nationalRank && b.nationalRank > 0)
      .sort((a, b) => (a.nationalRank ?? 9999) - (b.nationalRank ?? 9999))
      .slice(0, 10)
      .map((b) => ({
        p: byIndex.get(b.playerIndex),
        rank: b.nationalRank,
        to: b.stage === 'SoftCommitted' || b.stage === 'HardCommitted' || b.stage === 'Signed'
          ? b.topSchools[0]?.school ?? null
          : null,
      }))
      .filter((x): x is { p: RosterPlayer; rank: number; to: string | null } => !!x.p)
  }, [roster])

  const bestRank = (g: { home: string | null; away: string | null }) =>
    Math.min(rankOf.get(g.home ?? '') ?? 999, rankOf.get(g.away ?? '') ?? 999)

  /** The rail: your league, or the ranked games. Yours always leads. */
  const railGames = useMemo(() => {
    const mineFirst = (a: typeof weekGames[number], b: typeof weekGames[number]) =>
      (b.home === me || b.away === me ? 1 : 0) - (a.home === me || a.away === me ? 1 : 0)
    if (rail === 'CONF' && conference) {
      const inConf = (n: string | null) => !!n && table.get(n)?.conference === conference
      return weekGames.filter((g) => inConf(g.home) || inConf(g.away))
        .sort((a, b) => mineFirst(a, b) || bestRank(a) - bestRank(b))
    }
    return weekGames.filter((g) => bestRank(g) <= 25)
      .sort((a, b) => mineFirst(a, b) || bestRank(a) - bestRank(b))
  }, [weekGames, rail, conference, table, me, rankOf])

  /** The country's game of the week: the best team on the field, then the score. */
  const topGames = useMemo(
    () => [...weekGames].sort((a, b) =>
      bestRank(a) - bestRank(b) ||
      (b.homeScore + b.awayScore) - (a.homeScore + a.awayScore)).slice(0, 5),
    [weekGames, rankOf],
  )

  /**
   * The Heisman watch.
   *
   * No season statistics are decoded — the save's per-player game totals are not
   * placed yet — so this cannot be yards and touchdowns. It is the field by
   * rating, by the positions the award actually goes to, and by whether their
   * team is winning, and the panel says so rather than implying a stat line.
   */
  const heisman = useMemo(() => {
    // The save's own five, when it has them. `HeismanRankingStore` holds exactly
    // the shortlist the game shows, and the player column is found by being the
    // one that resolves to a real roster row in every single row of it.
    const byRow = new Map((roster?.players ?? []).map((p) => [p.index, p]))
    const real = (roster?.heisman ?? [])
      .filter((h) => h.index >= 0)
      .map((h) => byRow.get(h.index))
      .filter((p): p is RosterPlayer => !!p)
    if (real.length) {
      return real.map((p) => ({ p, school: nameOf(p.team), real: true }))
    }
    return (roster?.players ?? [])
      .filter((p) => p.team !== UNASSIGNED && HEISMAN_WEIGHT[p.position])
      .map((p) => {
        const school = nameOf(p.team)
        const row = school ? table.get(school) : undefined
        return {
          p, school, real: false,
          score: p.overall * HEISMAN_WEIGHT[p.position] + (row ? winPct(row) : 0) * 14,
        }
      })
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 5)
      .map(({ p, school, real }) => ({ p, school, real }))
  }, [roster, table, state.teamNames])

  /**
   * The wire: the country's week, not yours.
   *
   * Built from the same held-back view of the season the rest of the page uses,
   * so it can never print a result from a week you have not reached.
   */
  const wire = useMemo(() => buildWire({
    games: visibleGames(games, me, holdFrom).filter((g) => g.played || !g.postseason),
    week, table, ranks: rankOf, me,
    events: roster?.recruitEvents ?? [],
    recruits: (roster?.recruitBoard ?? []).map((r) => {
      const p = (roster?.players ?? []).find((x) => x.index === r.playerIndex)
      return {
        index: r.playerIndex,
        first: p?.first ?? '', last: p?.last ?? '',
        position: p?.position ?? '', stars: p?.stars ?? 0,
        nationalRank: r.nationalRank, stage: r.stage, topSchools: r.topSchools,
      }
    }),
  }), [games, me, holdFrom, week, table, rankOf, roster])

  /**
   * The game the front page leads with.
   *
   * The last result, unless the next one is bigger: a ranked opponent, or the
   * postseason. A conference championship on Saturday is the story — the win
   * from a fortnight ago is not — and that is what every front page in the
   * sport does with the same two facts.
   */
  /**
   * The game the country would lead with.
   *
   * Not yours. Every game of the week is weighed the way anybody would weigh
   * them — a conference on the line, two ranked sides, a fixture that is its own
   * occasion, an upset that has happened — and the biggest wins. See
   * gameWeight in electron/matchup.ts. Yours is still one turn of the feature,
   * and all of it in full is what The Program is for.
   */
  const factsOf = useMemo(() => {
    const seen = visibleGames(games, me, holdFrom)
    return (g: SeasonGame) => matchupFacts({
      game: g,
      games: seen,
      conferenceOf: (n) => (n ? table.get(n)?.conference ?? null : null),
      rankOf: (n) => (n ? rankOf.get(n) ?? null : null),
      recordOf: (n) => {
        const r = n ? table.get(n) : undefined
        return r ? { wins: r.wins, losses: r.losses } : null
      },
      heisman: (roster?.heisman ?? []).map((h) => ({
        first: h.first ?? '', last: h.last ?? '', position: h.position ?? '',
        team: h.team === null ? null : nameOf(h.team),
      })),
    })
  }, [games, me, holdFrom, table, rankOf, roster, state.teamNames])

  const feature = useMemo((): { g: SeasonGame; upcoming: boolean } | null => {
    if (week === null) return null
    const seen = visibleGames(games, me, holdFrom)
      .filter((g) => !g.postseason && (g.week === week || (!g.played && g.week >= week)))
    if (!seen.length) return null
    const scored = seen
      .map((g) => ({ g, w: gameWeight(g, factsOf(g)) + (g.played ? 0 : 40) }))
      .sort((a, b) => b.w - a.w)
    const best = scored[0].g
    return { g: best, upcoming: !best.played }
  }, [games, me, holdFrom, week, factsOf])

  /**
   * What the lead game is about — a conference on it, a rematch, who is
   * unbeaten, who is in the Heisman race. See electron/matchup.ts.
   */
  const facts = useMemo(
    () => (feature ? factsOf(feature.g) : null),
    [feature, factsOf],
  )



  // The feature turns over on its own until you pick a story, and never while
  // something is open in the middle column — that is the one thing you asked for.
  useEffect(() => {
    if (holding || open) return
    const t = window.setInterval(
      () => setSlide((s) => SLIDES[(SLIDES.indexOf(s) + 1) % SLIDES.length]),
      TURN_MS,
    )
    return () => window.clearInterval(t)
  }, [holding, open])

  if (!roster) {
    return (
      <div className="gs-soon">
        <h1 className="screen-title" style={{ marginBottom: 14 }}>{me ?? 'Your dynasty'}</h1>
        <p className="gs-soon-body">
          {save.restoring
            ? 'Reading your save. The whole front page comes out of that one pass — ' +
              'the schedule, the scores, the squad and the recruiting board.'
            : 'Open The Program and read the roster. The whole front page comes out of that one ' +
              'pass — the schedule, the scores, the squad and the recruiting board.'}
        </p>
      </div>
    )
  }

  const openGame = open?.kind === 'game' ? games.find((g) => g.row === open.row) ?? null : null
  const openPlayer = open?.kind === 'player'
    ? (roster.players ?? []).find((p) => p.index === open.index) ?? null
    : null

  const artOf = (
    name: string | null | undefined,
    kind: 'logoLight' | 'helmet' | 'helmetRight' | 'stadium' = 'logoLight',
  ) => {
    if (!name) return undefined
    // A stadium either exists or it does not. Falling back to a logo here would
    // put a giant mark behind the headline, which is the thing 0.64.0 removed.
    if (kind === 'stadium') return save.schoolArt[`${name}|stadium`]
    return save.schoolArt[`${name}|${kind}`] ?? save.schoolArt[`${name}|logoLight`] ??
      save.schoolArt[`${name}|icon`] ?? save.schoolArt[`${name}|logoGold`]
  }

  const pick = (s: Slide) => { setSlide(s); setHolding(true) }

  return (
    <div className="gs-shell">
      {/* ── your program ────────────────────────────────────────────── */}
      {/* ── the country ─────────────────────────────────────────────────
          Home is about the sport, not about you. Your own program — its record,
          its board, its next game, its best players — is a tab of its own now,
          because a front page that leads with one team out of a hundred and
          forty is a team page wearing a newspaper's clothes. */}
      <aside className="gs-rail">
        <div>
          <Kicker>{season ? `${season} season` : 'The season'}</Kicker>
          {/* Where the dynasty is, out of the save's own calendar. The rails
              below are still labelled by the week whose results they show,
              which is the last one played and not always this one. */}
          <h1 className="screen-title" style={{ marginTop: 10 }}>
            {weekLabel(roster?.calendar?.week ?? week) ?? 'The country'}
          </h1>
          <div style={{ marginTop: 8 }}>
            <Meta>
              {[`${order.length} programs`,
                unbeaten.length ? `${unbeaten.length} unbeaten` : null,
                me ? `you coach ${me}` : null].filter(Boolean).join(' · ')}
            </Meta>
          </div>
        </div>

        <div className="grid-2" style={{ gap: 12 }}>
          <div className="card card-pad">
            <Kicker>Still perfect</Kicker>
            <div className="gs-tile-val is-high" style={{ fontSize: 32 }}>{unbeaten.length}</div>
            <div style={{ marginTop: 6 }}>
              <Meta size={10}>{unbeaten[0]?.name.toUpperCase() ?? 'NOBODY'}</Meta>
            </div>
          </div>
          <div className="card card-pad">
            <Kicker>Played</Kicker>
            <div className="gs-tile-val is-mid" style={{ fontSize: 32 }}>{weekGames.length}</div>
            <div style={{ marginTop: 6 }}><Meta size={10}>GAMES THIS WEEK</Meta></div>
          </div>
        </div>

        {/* What the country is doing on the field, per game, over the weeks you
            have reached. Yards allowed sorts the other way, because the best
            defence gives up the fewest. */}
        <div className="card card-pad">
          <div className="card-head">
            <Kicker>Nationally</Kicker>
            <Meta size={10}>PER GAME</Meta>
          </div>
          <div className="row" style={{ gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
            {STAT_BOARDS.map(([key, label]) => (
              <Tab key={key} on={board === key} onClick={() => setBoard(key)}>{label}</Tab>
            ))}
          </div>
          {statLeaders.map((l, i) => (
            <div key={l.teamIndex} className="gs-row" style={{ cursor: 'default' }}>
              <span className="gs-tag gs-tag-mute">{i + 1}</span>
              <SchoolArt size={22} file={artOf(l.school!, 'helmet')} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="gs-row-title">{l.school}</span>
              </span>
              <span className="gs-tile-val is-mid" style={{ fontSize: 18 }}>
                {Math.round(l.value)}
              </span>
            </div>
          ))}
          {!statLeaders.length ? <Meta size={10}>NO GAMES PLAYED YET</Meta> : null}
        </div>

        {/* The best players in the country's next class, wherever they are
            going — not the eight on one school's board. */}
        <div className="card card-pad" style={{ flex: 1, minHeight: 0 }}>
          <div className="card-head">
            <Kicker>The class</Kicker>
            <Meta size={10}>BEST IN THE COUNTRY</Meta>
          </div>
          {national.map(({ p, rank, to }) => (
            <button
              key={p.index}
              className="gs-row"
              aria-selected={open?.kind === 'player' && open.index === p.index}
              onClick={() => setOpen(open?.kind === 'player' && open.index === p.index
                ? null : { kind: 'player', index: p.index })}
            >
              <Face p={p} size={36} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="gs-row-title">{p.first} {p.last}</span>
                <span className="gs-row-sub" style={{ display: 'block' }}>
                  <span className="gs-stars">{'★'.repeat(p.stars)}</span>{' '}
                  {p.position} · {p.homeState ?? p.hometown}
                </span>
              </span>
              {to ? <SchoolArt size={22} file={artOf(to, 'helmet')} /> : null}
              <span className="gs-tag gs-tag-mute">{rank ? `#${rank}` : '—'}</span>
            </button>
          ))}
          {!national.length ? <Meta size={10}>NO CLASS READ</Meta> : null}
        </div>
      </aside>

      {/* ── the middle column: the feature, or whatever you opened ─────── */}
      <div className="gs-main-col">
        {openGame ? (
          <BoxScore g={openGame} onClose={() => setOpen(null)} />
        ) : openPlayer ? (
          <ProspectCard
            p={openPlayer}
            teamName={nameOf(openPlayer.team)}
            revealed={openPlayer.team !== UNASSIGNED || state.revealAllRecruits ||
              state.revealedRecruits.includes(openPlayer.playerId)}
            onReveal={() => dispatch({ type: 'revealRecruit', playerId: openPlayer.playerId })}
            onClose={() => setOpen(null)}
          />
        ) : (
          <>
            <div className="gs-main-head">
              <Kicker>{week ? `Around the country · week ${week}` : 'Around the country'}</Kicker>
              <div className="row" style={{ gap: 7 }}>
                {SLIDES.map((sl) => (
                  <button key={sl} aria-label={sl} title={sl.toLowerCase()}
                    className={`gs-feature-dot${slide === sl ? ' is-on' : ''}`}
                    onClick={() => pick(sl)} />
                ))}
              </div>
            </div>

            {slide === 'GAME' && feature ? (
              <Feature
                g={feature.g}
                upcoming={feature.upcoming}
                team={me}
                bg={artOf(feature.g.home)}
                tint={save.schoolColors[feature.g.home ?? ''] ?? null}
                apiKey={state.anthropicKey}
                log={(text, kind) => dispatch({ type: 'log', line: { text, kind: kind ?? 'good' } })}
                onBoxScore={() => setOpen({ kind: 'game', row: feature.g.row })}
                facts={facts}
                season={save.roster?.season ?? null}
                artOf={artOf}
                rankOf={(n) => (n ? rankOf.get(n) : undefined)}
                recordOf={(n) => {
                  const r = n ? table.get(n) : undefined
                  return r ? { wins: r.wins, losses: r.losses } : undefined
                }}
              />
            ) : slide === 'COUNTRY' || (slide === 'GAME' && !feature) ? (
              <FeatureList
                kicker={week ? `Around the country · week ${week}` : 'Around the country'}
                headline={topGames.length
                  ? `${topGames[0].away} ${topGames[0].awayScore}, ${topGames[0].home} ${topGames[0].homeScore}`
                  : 'Nothing played yet'}
                standfirst="The week's biggest games, best team on the field first. Open one for the box score."
                bg={artOf(topGames[0]?.home)}
                tint={save.schoolColors[topGames[0]?.home ?? ''] ?? null}
              >
                {topGames.map((g) => {
                  const homeWon = g.homeScore > g.awayScore
                  return (
                    <button key={g.row} className="gs-feature-row"
                      onClick={() => setOpen({ kind: 'game', row: g.row })}>
                      <span className="row" style={{ gap: 6, alignItems: 'center', flex: 1, minWidth: 0 }}>
                        <SchoolArt size={28} file={artOf(g.away, 'helmet')} />
                        <span className="gs-feature-name" style={{ color: homeWon ? 'var(--ink3)' : 'var(--ink)' }}>
                          {rankOf.get(g.away ?? '') && rankOf.get(g.away ?? '')! <= 25
                            ? <span style={{ color: 'var(--ink3)' }}>{rankOf.get(g.away ?? '')} </span> : null}
                          {g.away}
                        </span>
                      </span>
                      <span className="gs-feature-num" style={{ color: homeWon ? 'var(--ink3)' : 'var(--ink)' }}>{g.awayScore}</span>
                      <span style={{ color: 'var(--ink3)', fontSize: 11 }}>at</span>
                      <span className="row" style={{ gap: 6, alignItems: 'center', flex: 1, minWidth: 0 }}>
                        <SchoolArt size={28} file={artOf(g.home, 'helmetRight') ?? artOf(g.home, 'helmet')} />
                        <span className="gs-feature-name" style={{ color: homeWon ? 'var(--ink)' : 'var(--ink3)' }}>
                          {rankOf.get(g.home ?? '') && rankOf.get(g.home ?? '')! <= 25
                            ? <span style={{ color: 'var(--ink3)' }}>{rankOf.get(g.home ?? '')} </span> : null}
                          {g.home}
                        </span>
                      </span>
                      <span className="gs-feature-num" style={{ color: homeWon ? 'var(--ink)' : 'var(--ink3)' }}>{g.homeScore}</span>
                    </button>
                  )
                })}
              </FeatureList>
            ) : slide === 'HEISMAN' ? (
              <FeatureList
                kicker="Heisman watch"
                headline={heisman.length ? `${heisman[0].p.first} ${heisman[0].p.last}` : 'Nobody yet'}
                standfirst={heisman[0]?.real
                  ? 'The save keeps its own five-name shortlist and this is it, in its own order. ' +
                    'What the file does not give up yet is the case for each of them: the season ' +
                    'statistics are not decoded.'
                  : 'No shortlist was found in this save and no season statistics are decoded, so this ' +
                    'is the field by rating, by the positions the award goes to, and by whether their ' +
                    'team is winning.'}
                bg={save.awardArt['trophy:heisman'] ?? save.awardArt['trophy:heismanmemorialtrophy']
                  ?? artOf(heisman[0]?.school)}
                tint={save.schoolColors[heisman[0]?.school ?? ''] ?? null}
              >
                {heisman.map(({ p, school }) => (
                  <button key={p.index} className="gs-feature-row"
                    onClick={() => setOpen({ kind: 'player', index: p.index })}>
                    <Face p={p} size={36} />
                    <span className="gs-feature-name">
                      {p.first} {p.last}
                      <span style={{ color: 'var(--ink3)' }}>{'  '}{p.position} · {school ?? '—'}</span>
                    </span>
                    <SchoolArt size={24} file={artOf(school, 'helmet')} />
                    <span className="gs-feature-num" style={{ color: 'var(--accent)' }}>{p.overall}</span>
                  </button>
                ))}
              </FeatureList>
            ) : (
              <FeatureList
                kicker="The class"
                headline={national.length
                  ? `${national[0].p.first} ${national[0].p.last}`
                  : 'No class read'}
                standfirst={'The best players in next year\'s class, in the game\'s own order, and where ' +
                  'each of them is leaning. Not one school\'s board — the country\'s.'}
                bg={artOf(national[0]?.to ?? me)}
                tint={save.schoolColors[national[0]?.to ?? me ?? ''] ?? null}
              >
                {national.slice(0, 5).map(({ p, rank, to }) => (
                  <button key={p.index} className="gs-feature-row"
                    onClick={() => setOpen({ kind: 'player', index: p.index })}>
                    <Face p={p} size={36} />
                    <span className="gs-feature-name">
                      {p.first} {p.last}
                      <span style={{ color: 'var(--ink3)' }}>{'  '}{p.position} · {p.homeState ?? p.hometown}</span>
                    </span>
                    {to ? <SchoolArt size={24} file={artOf(to, 'helmet')} /> : null}
                    <span className="gs-feature-num" style={{ color: 'var(--ink3)' }}>#{rank}</span>
                  </button>
                ))}
              </FeatureList>
            )}

            <div className="gs-below">
              <section>
                <div className="card-head" style={{ marginBottom: 4 }}>
                  <Kicker>The wire</Kicker>
                  <Meta size={9}>{week ? `WEEK ${week}` : 'PRESEASON'}</Meta>
                </div>
                {wire.length ? wire.map((it) => (
                  <WireRow
                    key={it.key} it={it} artOf={artOf}
                    onOpen={() => {
                      if (it.row !== undefined) setOpen({ kind: 'game', row: it.row })
                      else if (it.playerIndex !== undefined) setOpen({ kind: 'player', index: it.playerIndex })
                    }}
                  />
                )) : (
                  <Meta size={10}>NOTHING PLAYED YET</Meta>
                )}
              </section>

              <section>
                <div className="card-head" style={{ marginBottom: 4 }}>
                  <Kicker>Top 25</Kicker>
                  {onOpenLeague ? (
                    <button onClick={onOpenLeague} style={{ all: 'unset', cursor: 'pointer' }}>
                      <Meta size={9} color="var(--accent-ui)">FULL TABLE →</Meta>
                    </button>
                  ) : null}
                </div>
                {order.slice(0, 25).map((r, i) => (
                  <div key={r.name} className={`gs-poll-row${r.name === me ? ' is-me' : ''}`}>
                    <span className="gs-poll-rank">{i + 1}</span>
                    <SchoolArt size={22} file={artOf(r.name, 'helmet')} />
                    <span className="gs-poll-name">{r.name}</span>
                    <span className="gs-poll-rec">{r.wins}<i className="gs-dash" />{r.losses}</span>
                  </div>
                ))}
                {!order.length ? <Meta size={10}>NO TABLE READ</Meta> : null}
              </section>
            </div>
          </>
        )}
      </div>

      {/* ── the week, and what is next ────────────────────────────────── */}
      {/* ── Saturday, everywhere ─────────────────────────────────────── */}
      <aside className="gs-rail-right">
        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          <Tab on={rail === 'TOP25'} onClick={() => setRail('TOP25')}>TOP 25</Tab>
          <Tab on={rail === 'CONF'} onClick={() => setRail('CONF')}>
            {(conference ?? 'YOURS').toUpperCase()}
          </Tab>
        </div>
        {railGames.slice(0, 14).map((g) => {
          const homeWon = g.homeScore > g.awayScore
          const row = (name: string | null, score: number, lost: boolean) => (
            <div className={`gs-score-row${lost ? ' is-lost' : ''}`}>
              <SchoolArt size={26} file={artOf(name, 'helmet')} />
              <span className="gs-score-team" style={{ color: name === me ? 'var(--accent)' : undefined }}>
                {rankOf.get(name ?? '') && rankOf.get(name ?? '')! <= 25
                  ? <span style={{ color: 'var(--ink3)' }}>{rankOf.get(name ?? '')} </span> : null}
                {name}
              </span>
              <span className="gs-score-num">{score}</span>
            </div>
          )
          return (
            <button
              key={g.row}
              className="gs-score"
              aria-selected={open?.kind === 'game' && open.row === g.row}
              onClick={() => setOpen(open?.kind === 'game' && open.row === g.row ? null : { kind: 'game', row: g.row })}
            >
              {row(g.away, g.awayScore, homeWon)}
              {row(g.home, g.homeScore, !homeWon)}
            </button>
          )
        })}
        {!railGames.length ? (
          <Meta size={10}>{rail === 'CONF' ? 'NOTHING IN YOUR LEAGUE THAT WEEK' : 'NO RANKED GAME THAT WEEK'}</Meta>
        ) : null}
      </aside>
    </div>
  )
}

/**
 * The ground behind a feature: the school's mark, blown up and out of focus,
 * over the colour DCC read out of that same mark.
 *
 * There is no stadium in the save and no trophy in the art DCC has been pointed
 * at, so this is the honest version of a photograph — the right colour and the
 * right shape, with nothing invented in it.
 */
function FeatureGround({ bg, tint, field, photo }: {
  bg?: string; tint?: string | null
  /** Draw the ground as a field rather than as a plain colour. */
  field?: boolean
  /**
   * A photograph of the ground the game was played at, when there is one.
   *
   * This is the only picture in DCC that is not the game's own art or the
   * user's save, so it is the only one that has to earn its place: it is the
   * real stadium of the real home team, blurred back and darkened so the
   * scoreline still reads over it. Where there is none, the drawn field stands
   * on its own — nothing generic is substituted.
   */
  photo?: string
}) {
  return (
    <>
      {photo ? (
        <div className="gs-figure-photo" style={{
          backgroundImage: `url("dccart://art/${photo.split(/[\\/]/).map(encodeURIComponent).join('/')}")`,
        }} />
      ) : null}
      {bg && !photo ? (
        <div className="gs-figure-bg" style={{
          backgroundImage: `url("dccart://art/${bg.split(/[\\/]/).map(encodeURIComponent).join('/')}")`,
        }} />
      ) : null}
      <div className="gs-figure-wash" style={{
        background: tint
          ? photo
            ? `linear-gradient(155deg, ${tint}aa, rgb(0 0 0 / 0.55) 82%)`
            : `linear-gradient(155deg, ${tint}cc, var(--surface) 78%)`
          : photo
            ? 'linear-gradient(160deg, rgb(0 0 0 / 0.34), rgb(0 0 0 / 0.62))'
            : 'linear-gradient(160deg, var(--surfaceStrong), var(--surface))',
        opacity: bg && !photo ? 0.82 : 1,
      }} />
      {field && !photo ? <div className="gs-figure-field" aria-hidden /> : null}
    </>
  )
}

/** A feature that is a list rather than a scoreline: the country, the watch, the class. */
function FeatureList({ kicker, headline, standfirst, bg, tint, children }: {
  kicker: string; headline: string; standfirst: string
  bg?: string; tint?: string | null; children: React.ReactNode
}) {
  return (
    <div className="fade-in">
      <div className="gs-figure is-list">
        <FeatureGround bg={bg} tint={tint} />
        <div className="gs-figure-body">
          <Kicker>{kicker}</Kicker>
          <div className="gs-feature-list">{children}</div>
        </div>
      </div>
      <div style={{ paddingTop: 20 }}>
        <h2 className="hero-headline" style={{ maxWidth: 560 }}>{headline}</h2>
        <p className="body-serif" style={{ margin: '12px 0 0', maxWidth: 520 }}>{standfirst}</p>
      </div>
    </div>
  )
}

/**
 * One item on the wire.
 *
 * A helmet, a kicker, the line, and the sentence under it. Games open their box
 * score and prospects open their card, so the wire is a way into the page
 * rather than a list you read and leave.
 */
function WireRow({ it, artOf, onOpen }: {
  it: WireItem
  artOf: (n: string | null | undefined, k?: 'logoLight' | 'helmet' | 'helmetRight' | 'stadium') => string | undefined
  onOpen: () => void
}) {
  const openable = it.row !== undefined || it.playerIndex !== undefined
  return (
    <button
      className="gs-wire-row"
      onClick={openable ? onOpen : undefined}
      style={{ cursor: openable ? 'pointer' : 'default' }}
    >
      <span className="gs-wire-art">
        <SchoolArt size={34} file={artOf(it.team, 'helmet')} />
        {it.other ? <SchoolArt size={26} file={artOf(it.other, 'helmetRight') ?? artOf(it.other, 'helmet')} /> : null}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <Meta size={9} color="var(--accent-ui)">{it.kicker.toUpperCase()}</Meta>
        <span className="gs-wire-head">{it.headline}</span>
        <span className="gs-wire-line">{it.line}</span>
      </span>
    </button>
  )
}

/**
 * One side of the feature matchup: helmet, rank and name, record, score.
 *
 * Stacked rather than strung along a line — a headline is a picture of a game,
 * and a row of small type is not one. The loser dims, so the result reads
 * before any of the words do.
 */
function MatchupSide({ name, art, rank, record, score, won }: {
  name: string | null
  art: string | undefined
  rank: number | undefined
  record: { wins: number; losses: number } | undefined
  /** Null before kickoff — a preview has records where a result has scores. */
  score: number | null
  won: boolean
}) {
  return (
    <div className="col gs-matchup-side">
      <SchoolArt className="gs-matchup-helmet" file={art} />
      <div className="row gs-matchup-name">
        {rank && rank <= 25 ? <span className="gs-matchup-rank">#{rank}</span> : null}
        <span className={`gs-matchup-team${won ? '' : ' is-lost'}`}>
          {(name ?? 'TBD').toUpperCase()}
        </span>
      </div>
      {record ? <span className="gs-matchup-rec">{record.wins}-{record.losses}</span> : null}
      {score === null ? null
        : <span className={`gs-matchup-score${won ? '' : ' is-lost'}`}>{score}</span>}
    </div>
  )
}

/**
 * The feature: the last result, told as a story.
 *
 * The well carries the scoreline at broadcast size rather than a photograph —
 * the save has no images, and a fabricated one would be the only invented thing
 * on the page.
 */
function Feature({ g, upcoming, facts, team, apiKey, log, onBoxScore, bg, tint, season, artOf, rankOf, recordOf }: {
  g: SeasonGame
  /** The game has not been played: this is a preview, not a result. */
  upcoming: boolean
  /** What the game is about, when the season says anything about it. */
  facts: MatchupFacts | null
  team: string | null; apiKey: string
  log: (text: string, kind?: 'good' | 'bad') => void
  onBoxScore: () => void
  bg?: string; tint?: string | null
  season: number | null
  artOf: (name: string | null | undefined, kind?: 'logoLight' | 'helmet' | 'helmetRight' | 'stadium') => string | undefined
  rankOf: (name: string | null | undefined) => number | undefined
  recordOf: (name: string | null | undefined) => { wins: number; losses: number } | undefined
}) {
  // Kept on disk, not in this component's state. The home feature had the same
  // bug the schedule did: the story lived here, so leaving the screen threw
  // away something the user had paid API credit for.
  const [stories, setStories] = useState<Record<string, StoredStory>>({})
  useEffect(() => { void window.dcc.stories().then((r) => setStories(r.stories)) }, [])
  const storyKey = `${season ?? 0}:${g.row}`
  const story = stories[storyKey] ?? null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Home leads with the country's biggest game, which is usually not one of
  // yours, so nothing here may assume the reader is in it. `mine` is what
  // decides whether the page speaks in the second person or reports a result.
  const mine = g.home === team || g.away === team
  const home = g.home === team
  const us = home ? g.homeScore : g.awayScore
  const them = home ? g.awayScore : g.homeScore
  const other = (home ? g.away : g.home) ?? 'their opponent'
  const won = us > them
  const winner = g.homeScore >= g.awayScore ? g.home : g.away
  const loser = g.homeScore >= g.awayScore ? g.away : g.home

  const write = async () => {
    setBusy(true); setError(null)
    const res = await window.dcc.writePress({
      game: g, kind: upcoming ? 'preview' : 'recap', userTeam: team, season,
      // The stakes, so the story is about the game rather than the forecast.
      context: facts ? matchupLines(g, facts) : [],
    })
    setBusy(false)
    if (res.ok) {
      setStories(res.stories)
      log(`wrote a ${upcoming ? 'preview' : 'recap'} for ${g.away} at ${g.home}`)
    }
    else { setError(res.message); log(res.message, 'bad') }
  }

  // Opening the game is one gesture: the story is written if there is not one
  // yet, and the game itself comes up under it either way. Nothing on the page
  // explains that a story could be written — the box is the button.
  const [box, setBox] = useState(false)
  const openGame = () => {
    if (!story && apiKey && !busy) void write()
    // Nothing to open on a game that has not happened: the preview is the page.
    if (!upcoming) setBox(true)
  }

  return (
    <div className="fade-in">
      <div
        className="gs-figure"
        role="button"
        tabIndex={0}
        style={{ cursor: 'pointer' }}
        title="Open the game — the story is written and the box score opens under it"
        onClick={openGame}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openGame() } }}
      >
        <FeatureGround bg={bg} tint={tint} field photo={artOf(g.home, 'stadium')} />
        <div className="gs-figure-kicker" style={{ zIndex: 1 }}>
          <Kicker>
            {facts?.title ? `The ${facts.title}`
              : upcoming ? 'Next up'
              : mine ? (won ? 'Won' : 'Lost')
              : 'Around the country'} · week {g.week}
          </Kicker>
        </div>
        {/*
          A matchup, not a bare scoreline. Each side stands under its own
          helmet with its rank, its record and its score, the way a broadcast
          titles a game — the helmets carry it and the numbers follow.

          The helmet names are for the SIDE a helmet is placed on, not the way
          it looks: the game's lt art belongs on the left and so faces right.
          Reading them as directions is what pointed them outward, twice.
        */}
        <div className="row gs-matchup">
          <MatchupSide
            name={g.away} art={artOf(g.away, 'helmet')}
            rank={rankOf(g.away)} record={recordOf(g.away)}
            score={upcoming ? null : g.awayScore} won={upcoming || g.awayScore >= g.homeScore}
          />
          <div className="col gs-matchup-mid">
            <span className="gs-matchup-at">AT</span>
            <span className="gs-matchup-state">{g.played ? 'FINAL' : 'UPCOMING'}</span>
          </div>
          <MatchupSide
            name={g.home} art={artOf(g.home, 'helmetRight') ?? artOf(g.home, 'helmet')}
            rank={rankOf(g.home)} record={recordOf(g.home)}
            score={upcoming ? null : g.homeScore} won={upcoming || g.homeScore > g.awayScore}
          />
        </div>
        <div className="gs-figure-caption" style={{ zIndex: 1 }}>
          {[facts?.neutral ? `${g.away} vs ${g.home}`
            : !mine ? `${g.away} at ${g.home}`
            : home ? `vs ${other}` : `at ${other}`,
            facts?.neutral ? 'neutral site' : null,
            dateLabel(g.month, g.day),
            // Before kickoff the crowd is not a number yet, and the time is.
            upcoming ? kickoffLabel(g.kickoff) : null,
            !upcoming && g.attendance ? `${g.attendance.toLocaleString()} in attendance` : null,
            weatherName(g.weather) ? `${g.temperatureF}°F ${weatherName(g.weather)?.toLowerCase()}` : null]
            .filter(Boolean).join('  ·  ')}
        </div>
      </div>

      <div style={{ paddingTop: 20 }}>
        <h2 className="hero-headline" style={{ maxWidth: 560 }}>
          {story ? story.headline
            : upcoming && facts ? matchupHeadline(g, facts, mine ? team : null)
            : upcoming ? `${team ?? 'You'} ${home ? 'host' : 'travel to'} ${other}`
            : mine ? `${team ?? 'You'} ${us}, ${other} ${them}`
            : `${winner} ${Math.max(g.homeScore, g.awayScore)}, ` +
              `${loser} ${Math.min(g.homeScore, g.awayScore)}`}
        </h2>
        {!story && upcoming && facts && matchupStandfirst(g, facts) ? (
          <p className="body-serif" style={{ margin: '12px 0 0', maxWidth: 520 }}>
            {matchupStandfirst(g, facts)}
          </p>
        ) : null}
        {story ? (
          <>
            <p className="body-serif" style={{ margin: '12px 0 0', maxWidth: 520 }}>{story.standfirst}</p>
            {story.body.split(/\n+/).map((para: string, i: number) => (
              <p key={i} className="body-serif" style={{ margin: '10px 0 0', maxWidth: 520 }}>{para}</p>
            ))}
          </>
        ) : (
          null
        )}

        <div className="row" style={{ gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <Btn variant="primary" onClick={write} disabled={busy || !apiKey}>
            {busy ? 'Writing…' : story ? 'Write another' : upcoming ? 'Preview it' : 'Read'}
          </Btn>
          {!upcoming ? (
            <>
              <Btn onClick={() => setBox((b) => !b)}>{box ? 'Hide the game' : 'Box score'}</Btn>
              <Btn onClick={onBoxScore}>Open it fully</Btn>
            </>
          ) : null}
          {!apiKey ? <Meta size={10}>ADD AN API KEY IN SETTINGS</Meta> : null}
          {error ? <Meta size={10} color="var(--accent-ui)">{error.toUpperCase()}</Meta> : null}
        </div>

        {/* The game under the writing, not instead of it. */}
        {box ? <div style={{ marginTop: 22 }}><BoxLine g={g} /></div> : null}
      </div>
    </div>
  )
}

/**
 * The game itself: the line by quarter, the scoring compared, the conditions.
 *
 * Its own component because it is now wanted in two places — the full box
 * score you open from the rail, and inline under the story on the front page,
 * which is what "show the box score along with what was written" asks for.
 * Team totals are not decoded, so the quarters are the only per-team series
 * there is; the bars compare those rather than implying yardage the save has
 * not given up.
 */
function BoxLine({ g }: { g: SeasonGame }) {
  const quarters = ['1', '2', '3', '4']
  const homeWon = g.homeScore > g.awayScore
  const rows: [string, number[], number, boolean][] = [
    [g.away ?? 'Away', g.awayQ, g.awayScore, !homeWon],
    [g.home ?? 'Home', g.homeQ, g.homeScore, homeWon],
  ]
  return (
    <>
      <table className="tbl" style={{ marginTop: 20 }}>
        <thead>
          <tr>
            <th />
            {quarters.map((q) => <th key={q} style={{ textAlign: 'right' }}>{q}</th>)}
            {g.overtime ? <th style={{ textAlign: 'right' }}>OT</th> : null}
            <th style={{ textAlign: 'right' }}>T</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, qs, total, won], i) => (
            <tr key={name + i}>
              <td className="name" style={{ color: won ? 'var(--ink)' : 'var(--ink3)' }}>{name}</td>
              {quarters.map((q, qi) => (
                <td key={q} className="num" style={{ color: won ? 'var(--ink)' : 'var(--ink3)' }}>{qs[qi] ?? 0}</td>
              ))}
              {g.overtime ? (
                <td className="num" style={{ color: won ? 'var(--ink)' : 'var(--ink3)' }}>
                  {name === g.home ? g.homeOT : g.awayOT}
                </td>
              ) : null}
              <td className="num" style={{ color: won ? 'var(--accent-ui)' : 'var(--ink3)' }}>{total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Team totals are not decoded, so this compares what is: the scoring by
          quarter, which is the only per-team series the save gives up. */}
      <div className="row" style={{ gap: 16, marginTop: 20, flexWrap: 'wrap' }}>
        <span className="gs-bar-key"><i className="gs-bar-swatch is-away" />{g.away}</span>
        <span className="gs-bar-key"><i className="gs-bar-swatch is-home" />{g.home}</span>
      </div>
      <div className="gs-bars" style={{ marginTop: 10 }}>
        {quarters.map((q, i) => {
          const away = g.awayQ[i] ?? 0
          const home = g.homeQ[i] ?? 0
          const top = Math.max(1, ...g.homeQ, ...g.awayQ)
          return (
            <div className="gs-bar-row" key={q}>
              <span className="gs-bar-name">Quarter {q}</span>
              <span className="gs-bar-track">
                <span className="gs-bar gs-bar-mine" style={{ width: `${(away / top) * 100}%` }} />
                <span className="gs-bar gs-bar-theirs" style={{ width: `${(home / top) * 100}%` }} />
              </span>
              <span className="gs-bar-vals">
                <span className="gs-bar-mine-val">{away}</span>
                <span className="gs-bar-theirs-val">{home}</span>
              </span>
            </div>
          )
        })}
      </div>

      <div className="gs-tiles gs-tiles-5">
        {[
          ['Kickoff', kickoffLabel(g.kickoff) ?? 'TBD'],
          ['Attendance', g.attendance ? g.attendance.toLocaleString() : '—'],
          ['Temperature', `${g.temperatureF}°`],
          ['Weather', weatherName(g.weather) ?? '—'],
          ['Wind', g.windMph ? `${g.windMph} mph` : 'Calm'],
        ].map(([label, val]) => (
          <div className="gs-tile gs-rise" key={label}>
            <div className="gs-tile-label">{label}</div>
            <div className="gs-tile-val is-mid" style={{ fontSize: 19 }}>{val}</div>
          </div>
        ))}
      </div>
    </>
  )
}
/** A game opened from the Saturday rail. */
function BoxScore({ g, onClose }: { g: SeasonGame; onClose: () => void }) {
  const homeWon = g.homeScore > g.awayScore

  return (
    <div className="fade-in">
      <div className="row" style={{ gap: 14, alignItems: 'baseline' }}>
        <Kicker>Box score · week {g.week}</Kicker>
        <button className="gs-close" onClick={onClose}>Close ✕</button>
      </div>

      <div className="gs-figure" style={{ marginTop: 14 }}>
        <div className="gs-figure-score">
          <span className={homeWon ? 'is-lost' : ''}>{g.awayScore}</span>
          <i className="gs-dash" />
          <span className={homeWon ? '' : 'is-lost'}>{g.homeScore}</span>
        </div>
        <div className="gs-figure-caption">
          {`${g.away} at ${g.home}  ·  ${dateLabel(g.month, g.day)}`}
          {g.overtime ? '  ·  Overtime' : ''}
        </div>
      </div>

      <BoxLine g={g} />
    </div>
  )
}

/** A recruit opened from the board. */
function ProspectCard({ p, revealed, onReveal, onClose, teamName }: {
  p: RosterPlayer; revealed: boolean; onReveal: () => void; onClose: () => void
  teamName?: string | null
}) {
  const { save } = useSave()
  const picks = cardRatings(p.position)
  const top = picks.map((k) => [k, p.ratings[k] ?? 0] as const)
  // A rostered player is not a prospect, and the card should not call him one.
  const rostered = p.team !== UNASSIGNED
  const logo = teamName
    ? save.schoolArt[`${teamName}|logoLight`] ?? save.schoolArt[`${teamName}|icon`]
    : undefined

  return (
    <div className="fade-in">
      <div className="row" style={{ gap: 14, alignItems: 'baseline' }}>
        <Kicker>{rostered ? 'Player card' : 'Prospect card'}</Kicker>
        <button className="gs-close" onClick={onClose}>Close ✕</button>
      </div>

      <div className="row" style={{ gap: 16, marginTop: 14, alignItems: 'center' }}>
        <Face p={p} size={64} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="headline">{p.first} {p.last}</h2>
          <div className="row" style={{ marginTop: 4, gap: 7, alignItems: 'center' }}>
            <SchoolArt size={24} file={logo} />
            {p.stars ? <span className="gs-stars">{'★'.repeat(p.stars)}</span> : null}
            <Meta size={10}>
              {[p.position, rostered ? p.classYear : null, p.archetype, p.hometown]
                .filter(Boolean).join(' · ')}
            </Meta>
          </div>
        </div>
        {revealed ? (
          <div style={{ textAlign: 'right' }}>
            <div className="gs-tile-val is-high" style={{ fontSize: 44 }}>{p.overall}</div>
            <Meta size={10}>OVERALL</Meta>
          </div>
        ) : null}
      </div>

      <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {[
          `${Math.floor(p.heightIn / 12)}'${p.heightIn % 12}" · ${p.weightLb}`,
          p.devTrait ? `${p.devTrait} dev` : null,
          p.nilK ? `NIL $${p.nilK}K` : null,
          p.pipeline ? `Pipeline · ${p.pipeline}` : null,
        ].filter(Boolean).map((t) => (
          <span key={t as string} className="gs-tag gs-tag-mute">{t}</span>
        ))}
      </div>

      {revealed ? (
        <div className="gs-tiles gs-tiles-3">
          {top.map(([label, v]) => (
            <div className="gs-tile gs-rise" key={label}>
              <div className="gs-tile-label">{label}</div>
              <div className={`gs-tile-val ${ratingTone(v)}`}>{v}</div>
              <div className="track" style={{ marginTop: 8 }}>
                <div className="track-fill" style={{ width: `${v}%`, background: 'var(--accent-ui)' }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 22 }}>
          <p className="body-serif" style={{ margin: '0 0 14px', maxWidth: 480 }}>
            His overall and all 53 ratings are in the save. Scouting only decides whether you see
            them — nothing about him changes either way.
          </p>
          <Btn variant="primary" onClick={onReveal}>Scout {p.first} {p.last}</Btn>
        </div>
      )}

      {revealed ? (
        <div className="row" style={{ gap: 10, marginTop: 18 }}>
          <Btn onClick={onReveal}>Hide again</Btn>
        </div>
      ) : null}
    </div>
  )
}
