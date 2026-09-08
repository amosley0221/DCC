import { useMemo, useState } from 'react'
import { usePoll, useSave } from '../saveStore'
import { useStore } from '../store'
import { Card, Chip, Empty, Kicker, Meta, SchoolArt, SectionHeader, Tab } from '../ui'
import { TEAM_ID_NAMES } from '../../electron/teamIds'
import {
  buildLeague, conferenceArtKeys, conferences, FIRST_ROUND, margin, orderByRanks,
  played, projectPlayoff, QUARTERFINALS, rankings, SEMIFINALS, visibleGames, winPct,
} from '../../electron/league'
import type { LeagueRow, PlayoffField } from '../../electron/league'
import type { CoachOffer, StaffMove } from '../../electron/saveAnalysis'
import { currentWeek } from '../../electron/season'
import { bowlBound, predict, predictBracket, predictionLine } from '../../electron/predict'

const TABS = ['STANDINGS', 'RANKINGS', 'SCORES', 'POSTSEASON', 'COACHES', 'STATS', 'SCHEDULES'] as const

/** The conference picker's "no conference" option. Not a conference name. */
const ALL = '\u0000all'
type TabName = (typeof TABS)[number]

const pct = (r: LeagueRow) => (played(r) ? winPct(r).toFixed(3).replace(/^0/, '') : '—')
const per = (n: number, g: number) => (g ? (n / g).toFixed(1) : '—')
const signed = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1))

/**
 * The league: everything in the save that is not about your program.
 *
 * Standings, a ranking, the week's scores, team scoring and every other
 * school's schedule, all worked out in `league.ts` from the season's own game
 * rows — the save records results and never a table.
 *
 * The ranking says whose it is. There is no poll in the file, so this is DCC's
 * ordering by record and scoring margin; calling it anything else would pass
 * arithmetic off as the game's own opinion.
 */
export default function League({ onOpenProgram }: { onOpenProgram?: () => void } = {}) {
  const { save } = useSave()
  const { state } = useStore()
  const roster = save.roster
  const [tab, setTab] = useState<TabName>('STANDINGS')
  const [conf, setConf] = useState<string | null>(null)
  const [week, setWeek] = useState<number | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const [spoilers, setSpoilers] = useState(false)

  const nameOf = (id: number) => state.teamNames[id] ?? TEAM_ID_NAMES[id] ?? null
  const me = state.teamId === null ? null : nameOf(state.teamId)
  /**
   * Every game, minus the weeks you have not reached.
   *
   * The game sims the rest of the country before your own Saturday, so a save
   * on week 11 already knows week 11's scores. A standings table built from
   * those would hand you results you have not played, which is why the whole
   * screen stands on the held set rather than filtering at the last moment.
   */
  const all = roster?.games ?? []
  const holdFrom = useMemo(() => currentWeek(all, me), [all, me])
  const games = useMemo(
    () => (spoilers ? all : visibleGames(all, me, holdFrom)),
    [all, me, holdFrom, spoilers],
  )

  const teams = useMemo(() => (roster?.coaches ?? [])
    .map((c) => ({ name: nameOf(c.teamId) ?? '', conference: c.conference, division: c.division }))
    .filter((t) => t.name), [roster, state.teamNames])

  const table = useMemo(() => buildLeague(games, teams), [games, teams])
  // The save's own ranking when one has been picked out of it, DCC's otherwise.
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
  const groups = useMemo(() => conferences(table), [table])

  /** Roster strength: the mean of a program's best 25, which is how a team is judged. */
  const strength = useMemo(() => {
    const by = new Map<string, number[]>()
    for (const p of roster?.players ?? []) {
      const n = nameOf(p.team)
      if (!n) continue
      const l = by.get(n); if (l) l.push(p.overall); else by.set(n, [p.overall])
    }
    const m = new Map<string, number>()
    for (const [n, list] of by) {
      const top = list.sort((a, b) => b - a).slice(0, 25)
      m.set(n, Math.round(top.reduce((s, v) => s + v, 0) / Math.max(1, top.length)))
    }
    return m
  }, [roster, state.teamNames])

  /**
   * The twelve-team field. A projection until the save has played one — there is
   * no bracket in a November file, and no conference title game has happened
   * yet, so its "champions" are the programs leading their conferences.
   *
   * Teams the save has already scheduled into a bowl are struck out of it: once
   * bowl season is set, a team playing one is not in the playoff whatever its
   * record says. That usually leaves too few teams to fill twelve places, and
   * the field says so rather than padding itself out — see `credible`.
   */
  const field = useMemo(() => projectPlayoff(table, bowlBound(all)), [table, all])

  /**
   * The poll as a lookup, for the screens that ask about one team at a time.
   *
   * Empty until the user has found a poll column in their save, which is the
   * normal state — every screen that reads this works without it.
   */
  const pollPlaces = useMemo(
    () => new Map<string, number | null>(Object.entries(poll.ranks ?? {})),
    [poll.ranks],
  )
  const bowls = useMemo(
    () => all.filter((g) => g.postseason).sort((a, b) => a.week - b.week || a.row - b.row),
    [all],
  )

  const weeks = useMemo(() => {
    const s = new Set<number>()
    for (const g of games) if (g.played) s.add(g.week)
    return [...s].sort((a, b) => a - b)
  }, [games])
  const shownWeek = week ?? (weeks.length ? weeks[weeks.length - 1] : null)

  /**
   * A school's logo, for the places a school is a name in a list: standings,
   * conference tables, the poll. A helmet shrunk to twenty pixels is a smudge,
   * and none of these are games.
   */
  const art = (name: string | null) => (name
    ? save.schoolArt[`${name}|logoLight`] ?? save.schoolArt[`${name}|helmet`] ?? save.schoolArt[`${name}|icon`]
    : undefined)

  /** A helmet, for the two sides of an actual game. */
  const helmet = (name: string | null) => (name
    ? save.schoolArt[`${name}|helmet`] ?? save.schoolArt[`${name}|logoLight`] ?? save.schoolArt[`${name}|icon`]
    : undefined)

  if (!roster) {
    return (
      <>
        <SectionHeader title="The league" sub={<Meta>ROSTER NOT READ YET</Meta>} />
        <Card className="card-pad">
          <Kicker>Nothing to stand up yet</Kicker>
          <p className="body-serif" style={{ marginTop: 7, marginBottom: 0 }}>
            Standings, rankings and every other school's schedule are worked out from the games in
            your save. Open The Program and read the roster — the schedule comes out in the same pass.
          </p>
        </Card>
      </>
    )
  }

  /**
   * Which conference the screen is looking at.
   *
   * Yours until you change it, because that is the table you open this for.
   * ALL is there for the days you want the whole country, but a search box was
   * the wrong control: there are eleven conferences and you already know which
   * one you want.
   */
  const myConference = me ? table.get(me)?.conference ?? null : null
  const shownConf = conf ?? myConference ?? groups[0]?.[0] ?? ALL
  const inConf = (r: LeagueRow) => shownConf === ALL || r.conference === shownConf

  const confPicker = (
    <select className="gs-select" value={shownConf} onChange={(e) => setConf(e.target.value)}>
      {groups.map(([name]) => <option key={name} value={name}>{name}</option>)}
      <option value={ALL}>All {table.size} programs</option>
    </select>
  )

  /** A conference's own championship mark, when the art folder carries one. */
  const confMark = (conference: string | null) => {
    for (const k of conferenceArtKeys(conference)) {
      const f = save.awardArt[k]
      if (f) return f
    }
    return undefined
  }

  const schoolCell = (name: string | null, onPick?: () => void) => (
    <span className="row" style={{ gap: 7, alignItems: 'center' }}>
      <SchoolArt size={30} file={art(name)} />
      <button onClick={onPick} style={{
        all: 'unset', cursor: onPick ? 'pointer' : 'default',
        color: name === me ? 'var(--accent)' : 'var(--ink)',
      }}>{name ?? 'TBD'}</button>
    </span>
  )

  return (
    <>
      <SectionHeader
        title="The league"
        mark={<SchoolArt size={38} file={art(me)} />}
        sub={<Meta>{[`${table.size} PROGRAMS`, `${groups.length} CONFERENCES`,
          shownWeek ? `THROUGH WEEK ${shownWeek}` : null].filter(Boolean).join(' · ')}</Meta>}
        right={<div className="subtabs">
          {TABS.map((t) => <Tab key={t} on={tab === t} onClick={() => setTab(t)}>{t}</Tab>)}
        </div>}
      />

      <div className="col" style={{ gap: 12 }}>
        {holdFrom !== null ? (
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <Chip on={spoilers} onClick={() => setSpoilers(!spoilers)}>
              {spoilers ? 'showing results you have not reached' : `results held from week ${holdFrom}`}
            </Chip>
            <Meta size={9}>THE GAME SIMS THE COUNTRY BEFORE YOUR SATURDAY</Meta>
          </div>
        ) : null}

        {tab === 'STANDINGS' ? (
          <>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <Meta size={10}>CONFERENCE</Meta>
              {confPicker}
            </div>
            {groups
              .filter(([name]) => shownConf === ALL || name === shownConf)
              .map(([conf, rows]) => (
                <Card className="card-pad" key={conf}>
                  <div className="card-head">
                    <span className="row" style={{ gap: 9, alignItems: 'center' }}>
                      <SchoolArt size={26} file={confMark(conf)} />
                      <Kicker>{conf}</Kicker>
                    </span>
                    <Meta size={10}>{rows.length} TEAMS</Meta>
                  </div>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th style={{ width: 28 }} />
                        <th>School</th>
                        <th style={{ textAlign: 'right' }}>Conf</th>
                        <th style={{ textAlign: 'right' }}>Overall</th>
                        <th style={{ textAlign: 'right' }}>PF</th>
                        <th style={{ textAlign: 'right' }}>PA</th>
                        <th style={{ textAlign: 'right' }}>Marg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.name} style={{ background: r.name === me ? 'var(--rule)' : undefined }}>
                          <td className="num" style={{ color: 'var(--ink3)' }}>
                            {(rankOf.get(r.name) ?? 99) <= 25 ? rankOf.get(r.name) : ''}
                          </td>
                          <td className="name">{schoolCell(r.name, () => { setPick(r.name); setTab('SCHEDULES') })}</td>
                          <td className="num">{r.confWins}-{r.confLosses}</td>
                          <td className="num">{r.wins}-{r.losses}</td>
                          <td className="num" style={{ color: 'var(--ink3)' }}>{r.pointsFor}</td>
                          <td className="num" style={{ color: 'var(--ink3)' }}>{r.pointsAgainst}</td>
                          <td className="num" style={{ color: margin(r) >= 0 ? 'var(--good)' : 'var(--ink3)' }}>
                            {played(r) ? signed(margin(r)) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              ))}
          </>
        ) : null}

        {tab === 'RANKINGS' ? (
          <Card className="card-pad">
            <div className="card-head">
              <Kicker>The country, best first</Kicker>
              <Meta size={10}>
                {poll.ranks
                  ? poll.columns[poll.choice]?.name ?? "THE SAVE'S OWN"
                  : "DCC'S OWN ORDER"}
              </Meta>
            </div>
            {poll.columns.length ? (
              <>
                <p className="body-serif" style={{ marginTop: 7 }}>
                  These are your save's own rankings, read out of the field each one lives in.
                  The game keeps three and they disagree with each other, which is why it lets you
                  switch between them — so this does too.
                </p>
                <div className="row" style={{ gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
                  {poll.columns.map((c, i) => (
                    <Chip key={i} on={poll.choice === i} onClick={() => poll.setChoice(i)}>
                      {c.name ?? `${c.kind === 'top25' ? 'TOP 25' : 'FULL'} · ${i + 1}`}
                    </Chip>
                  ))}
                  <Chip on={poll.choice === -1} onClick={() => poll.setChoice(-1)}>DCC'S ORDER</Chip>
                </div>
              </>
            ) : (
              <p className="body-serif" style={{ marginTop: 7 }}>
                Nothing in this save reads as a ranking, so this is DCC's: record first, with
                scoring margin as the tie-break and a cap on it, so a 70-0 win over nobody cannot
                outrank a win.
              </p>
            )}
            <table className="tbl" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th style={{ width: 28 }}>#</th>
                  <th>School</th>
                  <th>Conference</th>
                  <th style={{ textAlign: 'right' }}>Record</th>
                  <th style={{ textAlign: 'right' }}>Pct</th>
                  <th style={{ textAlign: 'right' }}>Marg</th>
                  <th style={{ textAlign: 'right' }}>Roster</th>
                </tr>
              </thead>
              <tbody>
                {order.slice(0, 40).map((r) => (
                  <tr key={r.name} style={{ background: r.name === me ? 'var(--rule)' : undefined }}>
                    <td className="num" style={{ color: (rankOf.get(r.name) ?? 99) <= 25 ? 'var(--accent)' : 'var(--ink3)' }}>
                      {rankOf.get(r.name)}
                    </td>
                    <td className="name">{schoolCell(r.name, () => { setPick(r.name); setTab('SCHEDULES') })}</td>
                    <td style={{ color: 'var(--ink3)', fontSize: 11 }}>{r.conference ?? ''}</td>
                    <td className="num">{r.wins}-{r.losses}</td>
                    <td className="num" style={{ color: 'var(--ink3)' }}>{pct(r)}</td>
                    <td className="num" style={{ color: margin(r) >= 0 ? 'var(--good)' : 'var(--ink3)' }}>
                      {played(r) ? signed(margin(r)) : '—'}
                    </td>
                    <td className="num" style={{ color: 'var(--ink3)' }}>{strength.get(r.name) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : null}

        {tab === 'SCORES' ? (
          <Card className="card-pad">
            <div className="card-head">
              <Kicker>Scores{shownWeek ? ` — week ${shownWeek}` : ''}</Kicker>
              <Meta size={10}>{weeks.length} WEEKS PLAYED</Meta>
            </div>
            <div className="row" style={{ gap: 5, flexWrap: 'wrap', marginTop: 9 }}>
              {weeks.map((w) => (
                <Chip key={w} on={shownWeek === w} onClick={() => setWeek(w)}>{w}</Chip>
              ))}
            </div>
            <div className="grid-2" style={{ gap: 10, marginTop: 12 }}>
              {games
                .filter((g) => g.played && g.week === shownWeek)
                .sort((a, b) => (b.homeScore + b.awayScore) - (a.homeScore + a.awayScore))
                .map((g) => {
                  const homeWon = g.homeScore > g.awayScore
                  const side = ([name, score, won]: [string | null, number, boolean], i: number) => (
                    <div key={i} className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <SchoolArt size={32} file={art(name)} />
                      <span style={{
                        flex: 1, minWidth: 0, fontSize: 12,
                        color: name === me ? 'var(--accent)' : won ? 'var(--ink)' : 'var(--ink3)',
                      }}>
                        {(rankOf.get(name ?? '') ?? 99) <= 25
                          ? <span style={{ color: 'var(--ink3)' }}>{rankOf.get(name ?? '')} </span> : null}
                        {name}
                      </span>
                      <span className="num" style={{ color: won ? 'var(--ink)' : 'var(--ink3)' }}>{score}</span>
                    </div>
                  )
                  return (
                    <div key={g.row} style={{ borderTop: '1px solid var(--line)', padding: '7px 0' }}>
                      {side([g.away, g.awayScore, !homeWon], 0)}
                      {side([g.home, g.homeScore, homeWon], 1)}
                    </div>
                  )
                })}
            </div>
            {!games.some((g) => g.played && g.week === shownWeek) ? <Empty>nothing played that week</Empty> : null}
          </Card>
        ) : null}

        {tab === 'POSTSEASON' ? (
          <Postseason
            field={field}
            bowls={bowls}
            table={table}
            ranks={pollPlaces}
            art={art}
            helmet={helmet}
            award={(k) => save.awardArt[k]}
            me={me}
            onPick={(n) => { setPick(n); setTab('SCHEDULES') }}
          />
        ) : null}

        {tab === 'COACHES' ? (
          <Carousel
            moves={roster.staffMoves} offers={roster.coachOffers}
            art={art} me={me} onPick={(n) => { setPick(n); setTab('SCHEDULES') }}
          />
        ) : null}

        {tab === 'STATS' ? (
          <Card className="card-pad">
            <div className="card-head">
              <Kicker>Team scoring</Kicker>
              <Meta size={10}>PER GAME</Meta>
            </div>
            <p className="body-serif" style={{ marginTop: 7 }}>
              Points scored and allowed are what the save writes for a game. Yardage, turnovers and
              the rest of a stat sheet are not in the season rows DCC reads, so they are not printed
              here as blanks. Roster is the mean of a program's best 25.
            </p>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <Meta size={10}>CONFERENCE</Meta>
              {confPicker}
            </div>
            <table className="tbl" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>School</th>
                  <th style={{ textAlign: 'right' }}>G</th>
                  <th style={{ textAlign: 'right' }}>Rec</th>
                  <th style={{ textAlign: 'right' }}>Scored</th>
                  <th style={{ textAlign: 'right' }}>Allowed</th>
                  <th style={{ textAlign: 'right' }}>Marg</th>
                  <th style={{ textAlign: 'right' }}>Roster</th>
                </tr>
              </thead>
              <tbody>
                {order.filter(inConf).slice(0, 60).map((r) => (
                  <tr key={r.name} style={{ background: r.name === me ? 'var(--rule)' : undefined }}>
                    <td className="name">{schoolCell(r.name, () => { setPick(r.name); setTab('SCHEDULES') })}</td>
                    <td className="num" style={{ color: 'var(--ink3)' }}>{played(r)}</td>
                    <td className="num">{r.wins}-{r.losses}</td>
                    <td className="num">{per(r.pointsFor, played(r))}</td>
                    <td className="num">{per(r.pointsAgainst, played(r))}</td>
                    <td className="num" style={{ color: margin(r) >= 0 ? 'var(--good)' : 'var(--ink3)' }}>
                      {played(r) ? signed(margin(r)) : '—'}
                    </td>
                    <td className="num" style={{ color: 'var(--ink3)' }}>{strength.get(r.name) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : null}

        {tab === 'SCHEDULES' ? (
          <div className="rail">
            <Card className="card-pad">
              <div className="card-head">
                <Kicker>{pick ?? 'Pick a school'}</Kicker>
                {pick && table.get(pick) ? (
                  <Meta size={10}>
                    {`${table.get(pick)!.wins}-${table.get(pick)!.losses} · ` +
                     `${table.get(pick)!.confWins}-${table.get(pick)!.confLosses} ${table.get(pick)!.conference ?? ''}`}
                  </Meta>
                ) : null}
              </div>
              {!pick ? (
                <p className="body-serif" style={{ marginTop: 7, marginBottom: 0 }}>
                  Every school's season, week by week — who they play, where, and how it went.
                  Choose one on the right, or click a name anywhere in the standings.
                </p>
              ) : (
                <table className="tbl" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}>Wk</th>
                      <th>Opponent</th>
                      <th style={{ textAlign: 'right' }}>Result</th>
                      <th style={{ textAlign: 'right' }}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games
                      .filter((g) => g.home === pick || g.away === pick)
                      .sort((a, b) => a.week - b.week)
                      .map((g) => {
                        const home = g.home === pick
                        const us = home ? g.homeScore : g.awayScore
                        const them = home ? g.awayScore : g.homeScore
                        const won = us > them
                        return (
                          <tr key={g.row}>
                            <td className="num" style={{ color: 'var(--ink3)' }}>{g.week}</td>
                            <td className="name">
                              <span className="row" style={{ gap: 7, alignItems: 'center' }}>
                                <Meta size={9}>{home ? 'VS' : 'AT'}</Meta>
                                <SchoolArt size={24} file={helmet(home ? g.away : g.home)} />
                                <button onClick={() => setPick(home ? g.away : g.home)}
                                  style={{ all: 'unset', cursor: 'pointer' }}>
                                  {(home ? g.away : g.home) ?? 'TBD'}
                                </button>
                                {g.postseason ? <Meta size={9} color="var(--accent)">BOWL</Meta> : null}
                              </span>
                            </td>
                            <td className="num" style={{
                              color: !g.played ? 'var(--ink3)' : won ? 'var(--good)' : 'var(--accent-ui)',
                            }}>{!g.played ? '—' : won ? 'W' : 'L'}</td>
                            <td className="num" style={{ color: 'var(--ink3)' }}>
                              {g.played ? `${us}-${them}` : ''}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              )}
              {pick && onOpenProgram && pick === me ? (
                <div style={{ marginTop: 10 }}>
                  <button className="gs-close" onClick={onOpenProgram}>Open The Program →</button>
                </div>
              ) : null}
            </Card>
            <Card className="card-pad">
              <div className="card-head">
                <Kicker>{shownConf === ALL ? 'Every school' : shownConf}</Kicker>
              </div>
              <div style={{ marginTop: 9 }}>{confPicker}</div>
              <div className="col" style={{ gap: 0, marginTop: 10 }}>
                {order.filter(inConf).slice(0, 60).map((r) => (
                  <button key={r.name} onClick={() => setPick(r.name)}
                    style={{ all: 'unset', cursor: 'pointer', borderTop: '1px solid var(--line)', padding: '5px 0' }}>
                    <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <SchoolArt size={30} file={art(r.name)} />
                      <span style={{
                        flex: 1, fontSize: 12,
                        color: r.name === pick || r.name === me ? 'var(--accent)' : 'var(--ink)',
                      }}>{r.name}</span>
                      <span className="num" style={{ fontSize: 11, color: 'var(--ink3)' }}>{r.wins}-{r.losses}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </>
  )
}

/* ----------------------------------------------------------- the postseason */

type SeasonGameish = {
  row: number; week: number; home: string | null; away: string | null
  homeScore: number; awayScore: number; played: boolean; postseason: boolean
}

/**
 * The playoff, and the rest of bowl season.
 *
 * Before December there is no bracket in the save, so this is DCC's projection:
 * the five highest-ranked conference leaders on their titles, the best seven of
 * everyone else, and all twelve seeded by the ranking. It is labelled a
 * projection everywhere it appears, because a conference title game has not
 * been played and nothing in the file says who will win one.
 *
 * Once the save has December games they are shown as they were played. What DCC
 * cannot do yet is name them: the save marks a row as postseason but the bowl's
 * own name is not decoded, so there is no Rose Bowl crest to draw. That is the
 * one thing standing between this and bowl logos.
 */
/** How the game words the reason a job came open. */
const REASON_LABEL: Record<StaffMove['reason'], string> = {
  None: '',
  Fired: 'Fired',
  Retired: 'Retired',
  Pro: 'Left for the NFL',
  NewJob: 'Hired away',
  ContractEnding: 'Contract ended',
}

/** The chairs, in the order a staff is listed. */
const ROLE_LABEL: Record<StaffMove['role'], string> = {
  HC: 'Head coach',
  OC: 'Offensive coordinator',
  DC: 'Defensive coordinator',
}

/**
 * The coaching carousel.
 *
 * Open jobs first, because a job nobody has taken is the live story and a move
 * already made is history. Head coaches lead each list: the save carries
 * coordinator moves too and there are twice as many of them, which would bury
 * the hires anybody actually talks about.
 *
 * Everything here is read, not guessed. See readStaffMoves in saveAnalysis.ts,
 * and docs/SAVE-FORMAT.md for how each field was pinned against the game's own
 * staff-moves screen.
 */
function Carousel({ moves, offers, art, me, onPick }: {
  moves: StaffMove[]
  /** Every approach an open job has made — the candidate lists, and yours. */
  offers: CoachOffer[]
  art: (name: string | null) => string | undefined
  me: string | null
  onPick: (name: string) => void
}) {
  const [role, setRole] = useState<StaffMove['role']>('HC')
  /**
   * The schools sounding out your own staff.
   *
   * An offer records where the coach works now, so this needs no idea who your
   * coach is — it is every approach aimed at somebody already working for you.
   */
  const wantYou = useMemo(
    () => (me ? offers.filter((o) => o.from === me && o.school) : []),
    [offers, me],
  )
  /** Who a given job has approached. */
  const candidates = useMemo(() => {
    const m = new Map<string, CoachOffer[]>()
    for (const o of offers) {
      if (!o.school) continue
      const list = m.get(o.school) ?? []
      list.push(o)
      m.set(o.school, list)
    }
    return m
  }, [offers])
  const shown = useMemo(() => moves.filter((m) => m.role === role), [moves, role])
  // A job with nobody in it, and one where the same name is on both sides —
  // a coach who re-signed — are not the same thing and do not belong together.
  const open = shown.filter((m) => !m.incoming)
  const hires = shown.filter((m) => m.incoming && m.incoming.slot !== m.outgoing?.slot)
  const held = shown.filter((m) => m.incoming && m.incoming.slot === m.outgoing?.slot)

  if (!moves.length) {
    return (
      <Card className="card-pad">
        <Kicker>Nothing has moved</Kicker>
        <p className="body-serif" style={{ marginTop: 7, marginBottom: 0 }}>
          The carousel has not run in this save. It goes during bowl season rather than after the
          championship, so a file from before then carries no openings — every chair is still filled
          and there is nothing to report.
        </p>
      </Card>
    )
  }

  const Row = ({ m }: { m: StaffMove }) => (
    <div className="row" style={{
      gap: 10, alignItems: 'center', borderTop: '1px solid var(--line)', padding: '9px 0',
    }}>
      <SchoolArt size={30} file={art(m.school)} />
      <button onClick={() => m.school && onPick(m.school)} style={{
        all: 'unset', cursor: m.school ? 'pointer' : 'default', width: 150, flex: '0 0 auto',
        color: m.school === me ? 'var(--accent)' : 'var(--ink)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{m.school ?? 'Unknown'}</button>
      <span style={{ flex: 1, minWidth: 0, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {m.outgoing ? m.outgoing.display : '—'}
      </span>
      <Meta size={9}>{m.incoming ? '→' : 'OPEN'}</Meta>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {m.incoming ? m.incoming.display : ''}
      </span>
      <Meta size={9}>{REASON_LABEL[m.reason].toUpperCase()}</Meta>
    </div>
  )

  return (
    <>
      <Card className="card-pad">
        <div className="card-head">
          <Kicker>The carousel</Kicker>
          <div className="row" style={{ gap: 6 }}>
            {(['HC', 'OC', 'DC'] as const).map((r) => (
              <Chip key={r} on={role === r} onClick={() => setRole(r)}>{r}</Chip>
            ))}
          </div>
        </div>
        <p className="body-serif" style={{ marginTop: 7, marginBottom: 0 }}>
          {ROLE_LABEL[role]} jobs that came open this offseason, read out of the save. The left
          name left the job; the right name took it.
        </p>
      </Card>

      {wantYou.length ? (
        <Card className="card-pad">
          <div className="card-head">
            <Kicker>Interested in your staff</Kicker>
            <Meta size={10}>{wantYou.length} {wantYou.length === 1 ? 'APPROACH' : 'APPROACHES'}</Meta>
          </div>
          <div className="col" style={{ gap: 0, marginTop: 4 }}>
            {wantYou.map((o) => (
              <div key={o.row} className="row" style={{
                gap: 10, alignItems: 'center', borderTop: '1px solid var(--line)', padding: '9px 0',
              }}>
                <SchoolArt size={30} file={art(o.school)} />
                <button onClick={() => o.school && onPick(o.school)} style={{
                  all: 'unset', cursor: 'pointer', width: 150, flex: '0 0 auto', color: 'var(--ink)',
                }}>{o.school}</button>
                <span style={{ flex: 1, minWidth: 0, color: 'var(--ink3)' }}>
                  have approached {o.coach?.display ?? 'one of your coaches'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {open.length ? (
        <Card className="card-pad">
          <div className="card-head">
            <Kicker>Still open</Kicker>
            <Meta size={10}>{open.length} {open.length === 1 ? 'JOB' : 'JOBS'}</Meta>
          </div>
          <div className="col" style={{ gap: 0, marginTop: 4 }}>
            {open.map((m) => {
              const talking = (m.school ? candidates.get(m.school) : undefined) ?? []
              return (
                <div key={m.row}>
                  <Row m={m} />
                  {talking.length ? (
                    <div className="row" style={{
                      gap: 6, flexWrap: 'wrap', padding: '0 0 9px 40px', alignItems: 'center',
                    }}>
                      <Meta size={9}>TALKING TO</Meta>
                      {talking.map((o) => (
                        <span key={o.row} className="row" style={{
                          gap: 6, alignItems: 'center', border: '1px solid var(--line)',
                          borderRadius: 99, padding: '3px 10px 3px 4px',
                        }}>
                          <SchoolArt size={20} file={art(o.from)} />
                          <span style={{
                            fontSize: 11,
                            color: o.from === me ? 'var(--accent)' : 'var(--ink2)',
                          }}>{o.coach?.display ?? '—'}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
          <p className="body-serif" style={{ marginTop: 8, marginBottom: 0, color: 'var(--ink3)' }}>
            The game ranks these candidates and DCC cannot yet read that ranking, so they are in
            the order the save keeps rather than the order the game would put them in.
          </p>
        </Card>
      ) : null}

      <Card className="card-pad">
        <div className="card-head">
          <Kicker>Hired</Kicker>
          <Meta size={10}>{hires.length} {hires.length === 1 ? 'MOVE' : 'MOVES'}</Meta>
        </div>
        {hires.length ? (
          <div className="col" style={{ gap: 0, marginTop: 4 }}>
            {hires.map((m) => <Row key={m.row} m={m} />)}
          </div>
        ) : <Empty>nobody has been hired yet</Empty>}
      </Card>

      {held.length ? (
        <Card className="card-pad">
          <div className="card-head">
            <Kicker>Stayed put</Kicker>
            <Meta size={10}>{held.length} RE-SIGNED</Meta>
          </div>
          <p className="body-serif" style={{ marginTop: 7, marginBottom: 0 }}>
            The job came open and the same man took it back — a contract renewed rather than a move.
          </p>
          <div className="col" style={{ gap: 0, marginTop: 8 }}>
            {held.map((m) => <Row key={m.row} m={m} />)}
          </div>
        </Card>
      ) : null}
    </>
  )
}

function Postseason({ field, bowls, table, ranks, art, helmet, award, me, onPick }: {
  field: PlayoffField
  bowls: SeasonGameish[]
  /** Every program's season, for the arithmetic behind a prediction. */
  table: Map<string, LeagueRow>
  /** The game's own poll, where the user has pointed DCC at one. */
  ranks: Map<string, number | null>
  /** The logo, for the seeded field — a list of schools rather than a game. */
  art: (name: string | null) => string | undefined
  /** The helmet, for the two sides of a bowl. */
  helmet: (name: string | null) => string | undefined
  /** Art that is not a school: "playoff:round1", "bowl:rosebowl", "trophy:heisman". */
  award: (key: string) => string | undefined
  me: string | null
  onPick: (name: string) => void
}) {
  const bySeed = new Map(field.teams.map((t) => [t.seed, t]))
  const seed = (n: number) => bySeed.get(n) ?? null

  /**
   * DCC playing the bracket out to a champion.
   *
   * Eleven predictions stacked on each other, so an upset in the first round
   * rewrites everything under it and the champion at the end is the least
   * reliable thing on the screen. Each slot says it is a call rather than a
   * result, which is the only way to show this honestly.
   */
  const proj = useMemo(() => predictBracket(field, ranks), [field, ranks])
  const winners = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const g of proj.games) {
      // Keyed by the pairing rather than by round, because a round holds four.
      m.set(g.key, g.prediction?.favourite ?? null)
    }
    return m
  }, [proj])
  const byName = useMemo(
    () => new Map(field.teams.map((t) => [t.row.name, t])),
    [field],
  )

  const Slot = ({ n, note, call }: { n: number | null; note?: string; call?: string | null }) => {
    // A predicted team is shown in its own seed's place, marked as a call.
    const picked = call ? byName.get(call) ?? null : null
    if (picked) {
      return (
        <div className="bkt-slot">
          <span className="bkt-seed">{picked.seed}</span>
          <SchoolArt size={28} file={art(picked.row.name)} />
          <button
            className="bkt-name"
            onClick={() => onPick(picked.row.name)}
            style={{
              all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0,
              color: picked.row.name === me ? 'var(--accent)' : 'var(--ink2)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >{picked.row.name}</button>
          <Meta size={9} color="var(--accent)">CALL</Meta>
        </div>
      )
    }
    const t = n === null ? null : seed(n)
    if (!t) {
      return (
        <div className="bkt-slot is-tbd">
          <span className="bkt-seed" />
          <span style={{ width: 22, flex: '0 0 auto' }} />
          <span className="bkt-name">{note ?? 'TBD'}</span>
        </div>
      )
    }
    return (
      <div className="bkt-slot">
        <span className="bkt-seed">{n}</span>
        <SchoolArt size={28} file={art(t.row.name)} />
        <button
          className="bkt-name"
          onClick={() => onPick(t.row.name)}
          style={{
            all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0,
            color: t.row.name === me ? 'var(--accent)' : 'var(--ink)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >{t.row.name}</button>
        {t.champion ? <Meta size={9} color="var(--accent)">CH</Meta> : null}
        <span className="bkt-rec">{t.row.wins}-{t.row.losses}</span>
      </div>
    )
  }

  /**
   * Who is left for the playoff once the bowls have taken everyone else.
   *
   * This is the whole of what the save actually says about the field in bowl
   * week: these teams have a winning record and no bowl to go to, so whatever
   * the bracket turns out to be, it is drawn from here. DCC does not know the
   * seeding — the bracket is not in the file — and does not guess at it.
   */
  const unplaced = field.teams.filter((t) => t.row.wins > t.row.losses)

  return (
    <>
      {!field.credible ? (
        <Card className="card-pad">
          <div className="card-head">
            <span className="row" style={{ gap: 9, alignItems: 'center' }}>
              <SchoolArt size={26} file={award('playoff:nationalchampionship')} />
              <Kicker>The playoff — not in the save</Kicker>
            </span>
            <Meta size={10}>{unplaced.length} STILL UNPLACED</Meta>
          </div>
          <p className="body-serif" style={{ marginTop: 7 }}>
            Bowl season is scheduled and the playoff is not part of it. Every team below has a
            winning record and no bowl to go to, so the bracket will come from this group — but
            the file does not carry the bracket itself, and DCC will not invent a seeding for it.
            Filling twelve places from what is left would mean putting 5-7 teams in the playoff,
            which would look authoritative and be wrong.
          </p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {unplaced.map((t) => (
              <button key={t.row.name} onClick={() => onPick(t.row.name)}
                style={{ all: 'unset', cursor: 'pointer' }}>
                <span className="row" style={{ gap: 7, alignItems: 'center', border: '1px solid var(--line)', borderRadius: 99, padding: '5px 12px 5px 6px' }}>
                  <SchoolArt size={28} file={art(t.row.name)} />
                  <span style={{ fontSize: 12, color: t.row.name === me ? 'var(--accent)' : 'var(--ink)' }}>{t.row.name}</span>
                  <Meta size={9}>{t.row.wins}-{t.row.losses}</Meta>
                </span>
              </button>
            ))}
            {unplaced.length === 0 ? <Empty>nobody left unplaced</Empty> : null}
          </div>
        </Card>
      ) : null}

      {field.credible ? (<>
      <Card className="card-pad">
        <div className="card-head">
          <span className="row" style={{ gap: 9, alignItems: 'center' }}>
            <SchoolArt size={26} file={award('playoff:nationalchampionship')} />
            <Kicker>The playoff — projected</Kicker>
          </span>
          <Meta size={10}>{field.teams.length} OF {12}</Meta>
        </div>
        <p className="body-serif" style={{ marginTop: 7 }}>
          The five highest-ranked conference leaders are in on their titles, the next seven places
          go to the best of everyone else, and all twelve are seeded by the ranking — the straight
          seeding the sport uses. Seeds one to four sit out the first round.
          <br />
          This is a projection and stays one until December. No conference title game has been
          played, so a leader is not yet a champion, and the save carries no bracket of its own.
        </p>
      </Card>

      <div className="bkt">
        <div className="bkt-col">
          <div className="bkt-head"><RoundHead file={award('playoff:round1')} label="First round" /></div>
          <div className="bkt-body">
            {/* Four games, each feeding the quarterfinal beside it, so no pair
                is joined here — the spine starts one column along. */}
            {FIRST_ROUND.map(([a, b]) => (
              <div className="bkt-pair" key={a}>
                <div className="bkt-cell">
                  <div className="bkt-game"><Slot n={a} /><Slot n={b} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bkt-col">
          <div className="bkt-head"><RoundHead file={award('playoff:qtrfinal')} label="Quarterfinals" /></div>
          <div className="bkt-body">
            {[[0, 1], [2, 3]].map(([i, j]) => (
              <div className="bkt-pair is-joined" key={i}>
                {[i, j].map((k) => {
                  const q = QUARTERFINALS[k]
                  return (
                    <div className="bkt-cell" key={q.seed}>
                      <div className="bkt-game">
                        <Slot n={q.seed} />
                        <Slot
                          n={null}
                          note={`Winner of ${q.from[0]} v ${q.from[1]}`}
                          call={winners.get(`first:${q.from[0]}v${q.from[1]}`)}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="bkt-col">
          <div className="bkt-head"><RoundHead file={award('playoff:semigame')} label="Semifinals" /></div>
          <div className="bkt-body">
            <div className="bkt-pair is-joined">
              {SEMIFINALS.map(([a, b]) => (
                <div className="bkt-cell" key={a}>
                  <div className="bkt-game">
                    <Slot n={null} note={`Winner of the ${a} bracket`}
                      call={winners.get(`quarter:${a}`)} />
                    <Slot n={null} note={`Winner of the ${b} bracket`}
                      call={winners.get(`quarter:${b}`)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bkt-col">
          <div className="bkt-head">
            <RoundHead file={award('playoff:nationalchampionship')} label="The title" />
          </div>
          <div className="bkt-body">
            <div className="bkt-pair">
              <div className="bkt-cell">
                <div className="bkt-game is-title">
                  <Slot n={null} note="Winner of the top half"
                    call={winners.get(`semi:${SEMIFINALS[0][0]}v${SEMIFINALS[0][1]}`)} />
                  <Slot n={null} note="Winner of the bottom half"
                    call={winners.get(`semi:${SEMIFINALS[1][0]}v${SEMIFINALS[1][1]}`)} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      </>) : null}

      <Card className="card-pad">
        <div className="card-head">
          <Kicker>Conference leaders</Kicker>
          <Meta size={10}>{field.leaders.size} CONFERENCES</Meta>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {[...field.leaders.entries()].map(([conf, team]) => (
            <button key={conf} onClick={() => onPick(team)}
              style={{ all: 'unset', cursor: 'pointer' }}>
              <span className="row" style={{ gap: 7, alignItems: 'center', border: '1px solid var(--line)', borderRadius: 99, padding: '5px 12px 5px 6px' }}>
                <SchoolArt size={28} file={art(team)} />
                <span style={{ fontSize: 12, color: team === me ? 'var(--accent)' : 'var(--ink)' }}>{team}</span>
                <Meta size={9}>{conf}</Meta>
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="card-pad">
        <div className="card-head">
          <Kicker>Bowl season</Kicker>
          <Meta size={10}>{bowls.length} GAMES IN THE SAVE</Meta>
        </div>
        <p className="body-serif" style={{ marginTop: 7, marginBottom: 0 }}>
          A game still to come carries DCC's own call beside it, worked out from the poll where you
          have found one and from record and scoring margin where you have not. The save holds no
          line and no simulation to ask, so this is an opinion and nothing more.
        </p>
        {bowls.length === 0 ? (
          <p className="body-serif" style={{ marginTop: 7, marginBottom: 0 }}>
            Nothing yet — the save's December rows fill in as you play the postseason, and they
            appear here as they do. DCC can see that a game is a bowl but not which bowl: the
            name is a field it has not decoded, so there is no crest to put beside one.
          </p>
        ) : (
          <div className="col" style={{ gap: 0, marginTop: 8 }}>
            {bowls.map((g) => {
              const homeWon = g.homeScore > g.awayScore
              // A bowl is played somewhere neither team lives, so nobody gets
              // the home edge. A game already played needs no prediction.
              const line = g.played ? null : predictionLine(predict(
                table.get(g.home ?? ''), table.get(g.away ?? ''), true,
                { home: ranks.get(g.home ?? '') ?? null, away: ranks.get(g.away ?? '') ?? null },
              ))
              return (
                <div key={g.row} className="row"
                  style={{ gap: 10, alignItems: 'center', borderTop: '1px solid var(--line)', padding: '8px 0' }}>
                  <SchoolArt size={22} file={award('bowl:default')} />
                  <Meta size={9}>WK {g.week}</Meta>
                  <span className="row" style={{ gap: 7, alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <SchoolArt size={24} file={helmet(g.away)} />
                    <span style={{ color: g.played && homeWon ? 'var(--ink3)' : 'var(--ink)' }}>{g.away}</span>
                  </span>
                  <span className="num" style={{ color: g.played && homeWon ? 'var(--ink3)' : 'var(--ink)' }}>
                    {g.played ? g.awayScore : ''}
                  </span>
                  <Meta size={9}>AT</Meta>
                  <span className="row" style={{ gap: 7, alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <SchoolArt size={24} file={helmet(g.home)} />
                    <span style={{ color: g.played && !homeWon ? 'var(--ink3)' : 'var(--ink)' }}>{g.home}</span>
                  </span>
                  <span className="num" style={{ color: g.played && !homeWon ? 'var(--ink3)' : 'var(--ink)' }}>
                    {g.played ? g.homeScore : ''}
                  </span>
                  {line ? (
                    <span title="DCC's estimate, not the game's">
                      <Meta size={9} color="var(--accent)">{line.toUpperCase()}</Meta>
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </>
  )
}

/** A round of the bracket, under its own CFP mark when the art folder has one. */
function RoundHead({ file, label }: { file?: string; label: string }) {
  return (
    <span className="row" style={{ gap: 8, alignItems: 'center' }}>
      <SchoolArt size={22} file={file} />
      <Kicker>{label}</Kicker>
    </span>
  )
}
