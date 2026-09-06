import { useEffect, useMemo, useState } from 'react'
import { useKit, usePoll, useSave } from '../saveStore'
import { useStore } from '../store'
import { Btn, Kicker, Meta, PlayerFace, SchoolArt, Tab } from '../ui'
import type { StoredStory } from '../../electron/sidecar'
import { TEAM_ID_NAMES } from '../../electron/teamIds'
import { dateLabel, kickoffLabel, weatherName } from '../../electron/gameEnums'
import type { RosterPlayer, SeasonGame } from '../../electron/saveAnalysis'
import { buildLeague, orderByRanks, rankings, visibleGames, winPct } from '../../electron/league'
import { currentWeek } from '../../electron/season'
import { buildWire, type WireItem } from '../../electron/wire'

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
  const mine = useMemo(
    () => games.filter((g) => g.home === me || g.away === me).sort((a, b) => a.week - b.week),
    [games, me],
  )
  const last = [...mine].reverse().find((g) => g.played) ?? null
  const next = mine.find((g) => !g.played) ?? null

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
  const nationalRank = me ? rankOf.get(me) ?? null : null

  /** The week you have reached, and everyone else's results from it. */
  const week = useMemo(() => {
    const played = games.filter((g) => g.played && !g.postseason)
    if (!played.length) return null
    return last ? last.week : Math.max(...played.map((g) => g.week))
  }, [games, last])

  const weekGames = useMemo(
    () => games.filter((g) => g.played && !g.postseason && g.week === week),
    [games, week],
  )

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

  const scouted = (p: RosterPlayer) => state.revealAllRecruits || state.revealedRecruits.includes(p.playerId)

  const board = useMemo(
    () => (roster?.players ?? [])
      .filter((p) => p.team === UNASSIGNED && p.recruitFlag && /^Generic_/.test(p.assetId ?? ''))
      .sort((a, b) => b.stars - a.stars || b.overall - a.overall || a.last.localeCompare(b.last))
      .slice(0, 8),
    [roster],
  )

  const squad = useMemo(
    () => (roster?.players ?? []).filter((p) => p.team === state.teamId).sort((a, b) => b.overall - a.overall),
    [roster, state.teamId],
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
    kind: 'logoLight' | 'helmet' | 'helmetRight' = 'logoLight',
  ) =>
    (name
      ? save.schoolArt[`${name}|${kind}`] ?? save.schoolArt[`${name}|logoLight`] ??
        save.schoolArt[`${name}|icon`] ?? save.schoolArt[`${name}|logoGold`]
      : undefined)

  const pick = (s: Slide) => { setSlide(s); setHolding(true) }

  return (
    <div className="gs-shell">
      {/* ── your program ────────────────────────────────────────────── */}
      <aside className="gs-rail">
        <div>
          <Kicker>Your program</Kicker>
          <h1 className="screen-title" style={{ marginTop: 10 }}>{me ?? 'Pick your team'}</h1>
          <div style={{ marginTop: 8 }}>
            <Meta>
              {[record ? `${record.wins}-${record.losses}` : null, conference,
                nationalRank ? `No. ${nationalRank} by record` : null]
                .filter(Boolean).join(' · ')}
            </Meta>
          </div>
        </div>

        <div className="grid-2" style={{ gap: 12 }}>
          {/* The conference tile opens the League screen: it is a standing, and
              a standing is a table you should be able to walk into. */}
          <button onClick={onOpenLeague}
            style={{ all: 'unset', cursor: onOpenLeague ? 'pointer' : 'default', display: 'block' }}>
            <div className="card card-pad" style={{ height: '100%' }}>
              <div className="card-head">
                <Kicker>Conference</Kicker>
                {onOpenLeague ? <Meta size={9} color="var(--accent-ui)">TABLE →</Meta> : null}
              </div>
              <div className="gs-tile-val is-high" style={{ fontSize: 32 }}>
                {record ? <>{record.confWins}<i className="gs-dash" />{record.confLosses}</> : '—'}
              </div>
              <div style={{ marginTop: 6 }}><Meta size={10}>{conference ?? 'Not read'}</Meta></div>
            </div>
          </button>
          <div className="card card-pad">
            <Kicker>Scoring</Kicker>
            <div className="gs-tile-val is-mid" style={{ fontSize: 32 }}>{record ? record.pointsFor : '—'}</div>
            <div style={{ marginTop: 6 }}>
              <Meta size={10}>{record ? `${record.pointsAgainst} allowed` : 'Not read'}</Meta>
            </div>
          </div>
        </div>

        <div className="card card-pad" style={{ flex: 1, minHeight: 0 }}>
          <div className="card-head">
            <Kicker>The board</Kicker>
            <Meta size={10}>{board.length} of the class</Meta>
          </div>
          {board.map((p) => (
            <button
              key={p.index}
              className="gs-row"
              aria-selected={open?.kind === 'player' && open.index === p.index}
              onClick={() => setOpen(open?.kind === 'player' && open.index === p.index ? null : { kind: 'player', index: p.index })}
            >
              <Face p={p} size={36} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="gs-row-title">{p.first} {p.last}</span>
                <span className="gs-row-sub" style={{ display: 'block' }}>
                  <span className="gs-stars">{'★'.repeat(p.stars)}</span>{' '}
                  {p.position} · {p.homeState ?? p.hometown}
                </span>
              </span>
              <span className={`gs-tag ${scouted(p) ? 'gs-tag-accent' : 'gs-tag-mute'}`}>
                {scouted(p) ? p.overall : 'Scout'}
              </span>
            </button>
          ))}
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

            {slide === 'GAME' && last ? (
              <Feature
                g={last}
                team={me}
                bg={artOf(last.home)}
                tint={save.schoolColors[last.home ?? ''] ?? null}
                apiKey={state.anthropicKey}
                log={(text, kind) => dispatch({ type: 'log', line: { text, kind: kind ?? 'good' } })}
                onBoxScore={() => setOpen({ kind: 'game', row: last.row })}
                season={save.roster?.season ?? null}
                artOf={artOf}
                rankOf={(n) => (n ? rankOf.get(n) : undefined)}
                recordOf={(n) => {
                  const r = n ? table.get(n) : undefined
                  return r ? { wins: r.wins, losses: r.losses } : undefined
                }}
              />
            ) : slide === 'COUNTRY' || (slide === 'GAME' && !last) ? (
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
                headline={board.length ? `${board[0].first} ${board[0].last}` : 'Nobody on the board'}
                standfirst={'Your board, best first. Who has committed is not decoded out of the save yet, ' +
                  'so this is the class as it stands rather than a signing list.'}
                bg={artOf(me)}
                tint={save.schoolColors[me ?? ''] ?? null}
              >
                {board.slice(0, 5).map((p) => (
                  <button key={p.index} className="gs-feature-row"
                    onClick={() => setOpen({ kind: 'player', index: p.index })}>
                    <Face p={p} size={36} />
                    <span className="gs-feature-name">
                      {p.first} {p.last}
                      <span style={{ color: 'var(--ink3)' }}>{'  '}{p.position} · {p.homeState ?? p.hometown}</span>
                    </span>
                    <span className="gs-stars">{'★'.repeat(p.stars)}</span>
                    <span className="gs-feature-num" style={{ color: scouted(p) ? 'var(--accent)' : 'var(--ink3)' }}>
                      {scouted(p) ? p.overall : '—'}
                    </span>
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
      <aside className="gs-rail-right">
        {/* The tab names the league rather than saying "mine", and there is no
            kicker repeating it beside them. */}
        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          <Tab on={rail === 'CONF'} onClick={() => setRail('CONF')}>
            {(conference ?? 'Saturday').toUpperCase()}
          </Tab>
          <Tab on={rail === 'TOP25'} onClick={() => setRail('TOP25')}>TOP 25</Tab>
        </div>
        {railGames.slice(0, 9).map((g) => {
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

        {next ? (
          <>
            <div style={{ marginTop: 6 }}><Kicker>Next up</Kicker></div>
            <div className="card card-pad">
              <div className="row" style={{ gap: 9, alignItems: 'center' }}>
                <SchoolArt size={34} file={artOf(next.home === me ? next.away : next.home, 'helmet')} />
                <div className="gs-row-title" style={{ fontSize: 22, fontFamily: 'var(--serif)', fontWeight: 600 }}>
                  {(next.home === me ? next.away : next.home) ?? 'TBD'}
                </div>
              </div>
              <div style={{ marginTop: 6 }}>
                <Meta size={10}>
                  {next.home === me ? 'HOME' : 'AWAY'} · WEEK {next.week} · {dateLabel(next.month, next.day)}
                </Meta>
              </div>
              <div className="row" style={{ gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                {[kickoffLabel(next.kickoff), weatherName(next.weather) ? `${next.temperatureF}°F ${weatherName(next.weather)}` : null]
                  .filter(Boolean).map((t) => <Meta key={t as string} size={10}>{t}</Meta>)}
              </div>
            </div>
          </>
        ) : null}

        {squad.length ? (
          <>
            <div style={{ marginTop: 6 }}><Kicker>Top of the roster</Kicker></div>
            <div className="card card-pad">
              {/* These open the player, and they carry his face. Both were
                  missing: the one list on the page that did neither. */}
              {squad.slice(0, 5).map((p) => (
                <button key={p.index} className="gs-row"
                  aria-selected={open?.kind === 'player' && open.index === p.index}
                  onClick={() => setOpen(open?.kind === 'player' && open.index === p.index
                    ? null : { kind: 'player', index: p.index })}>
                  <Face p={p} size={36} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="gs-row-title">{p.first} {p.last}</span>
                    <span className="gs-row-sub" style={{ display: 'block' }}>
                      {[p.position, p.classYear].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="gs-tile-val is-high" style={{ fontSize: 18, margin: 0, minWidth: 28, textAlign: 'right' }}>
                    {p.overall}
                  </span>
                </button>
              ))}
            </div>
          </>
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
function FeatureGround({ bg, tint, field }: {
  bg?: string; tint?: string | null
  /** Draw the ground as a field rather than as a plain colour. */
  field?: boolean
}) {
  return (
    <>
      {bg ? (
        <div className="gs-figure-bg" style={{
          backgroundImage: `url("dccart://art/${bg.split(/[\\/]/).map(encodeURIComponent).join('/')}")`,
        }} />
      ) : null}
      <div className="gs-figure-wash" style={{
        background: tint
          ? `linear-gradient(155deg, ${tint}cc, var(--surface) 78%)`
          : 'linear-gradient(160deg, var(--surfaceStrong), var(--surface))',
        opacity: bg ? 0.82 : 1,
      }} />
      {field ? <div className="gs-figure-field" aria-hidden /> : null}
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
  artOf: (n: string | null | undefined, k?: 'logoLight' | 'helmet' | 'helmetRight') => string | undefined
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
  score: number
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
      <span className={`gs-matchup-score${won ? '' : ' is-lost'}`}>{score}</span>
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
function Feature({ g, team, apiKey, log, onBoxScore, bg, tint, season, artOf, rankOf, recordOf }: {
  g: SeasonGame; team: string | null; apiKey: string
  log: (text: string, kind?: 'good' | 'bad') => void
  onBoxScore: () => void
  bg?: string; tint?: string | null
  season: number | null
  artOf: (name: string | null | undefined, kind?: 'logoLight' | 'helmet' | 'helmetRight') => string | undefined
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

  const home = g.home === team
  const us = home ? g.homeScore : g.awayScore
  const them = home ? g.awayScore : g.homeScore
  const other = (home ? g.away : g.home) ?? 'their opponent'
  const won = us > them

  const write = async () => {
    setBusy(true); setError(null)
    const res = await window.dcc.writePress({ game: g, kind: 'recap', userTeam: team, season })
    setBusy(false)
    if (res.ok) { setStories(res.stories); log(`wrote a recap for ${g.away} at ${g.home}`) }
    else { setError(res.message); log(res.message, 'bad') }
  }

  // Opening the game is one gesture: the story is written if there is not one
  // yet, and the game itself comes up under it either way. Nothing on the page
  // explains that a story could be written — the box is the button.
  const [box, setBox] = useState(false)
  const openGame = () => {
    if (!story && apiKey && !busy) void write()
    setBox(true)
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
        <FeatureGround bg={bg} tint={tint} field />
        <div className="gs-figure-kicker" style={{ zIndex: 1 }}><Kicker>{won ? 'Won' : 'Lost'} · week {g.week}</Kicker></div>
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
            score={g.awayScore} won={g.awayScore >= g.homeScore}
          />
          <div className="col gs-matchup-mid">
            <span className="gs-matchup-at">AT</span>
            <span className="gs-matchup-state">{g.played ? 'FINAL' : 'UPCOMING'}</span>
          </div>
          <MatchupSide
            name={g.home} art={artOf(g.home, 'helmetRight') ?? artOf(g.home, 'helmet')}
            rank={rankOf(g.home)} record={recordOf(g.home)}
            score={g.homeScore} won={g.homeScore > g.awayScore}
          />
        </div>
        <div className="gs-figure-caption" style={{ zIndex: 1 }}>
          {[home ? `vs ${other}` : `at ${other}`, dateLabel(g.month, g.day),
            g.attendance ? `${g.attendance.toLocaleString()} in attendance` : null,
            weatherName(g.weather) ? `${g.temperatureF}°F ${weatherName(g.weather)?.toLowerCase()}` : null]
            .filter(Boolean).join('  ·  ')}
        </div>
      </div>

      <div style={{ paddingTop: 20 }}>
        <h2 className="hero-headline" style={{ maxWidth: 560 }}>
          {story ? story.headline : `${team ?? 'You'} ${us}, ${other} ${them}`}
        </h2>
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
            {busy ? 'Writing…' : story ? 'Write another' : 'Read'}
          </Btn>
          <Btn onClick={() => setBox((b) => !b)}>{box ? 'Hide the game' : 'Box score'}</Btn>
          <Btn onClick={onBoxScore}>Open it fully</Btn>
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
