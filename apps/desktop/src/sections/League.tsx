import { useMemo, useState } from 'react'
import { useSave } from '../saveStore'
import { useStore } from '../store'
import { Card, Chip, Empty, Input, Kicker, Meta, SchoolArt, SectionHeader, Tab } from '../ui'
import { TEAM_ID_NAMES } from '../../electron/teamIds'
import { buildLeague, conferences, margin, played, rankings, visibleGames, winPct } from '../../electron/league'
import type { LeagueRow } from '../../electron/league'
import { currentWeek } from '../../electron/season'

const TABS = ['STANDINGS', 'RANKINGS', 'SCORES', 'STATS', 'SCHEDULES'] as const
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
  const [query, setQuery] = useState('')
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
  const order = useMemo(() => rankings(table), [table])
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

  const weeks = useMemo(() => {
    const s = new Set<number>()
    for (const g of games) if (g.played) s.add(g.week)
    return [...s].sort((a, b) => a - b)
  }, [games])
  const shownWeek = week ?? (weeks.length ? weeks[weeks.length - 1] : null)

  const art = (name: string | null) => (name
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

  const q = query.trim().toLowerCase()
  const matches = (r: LeagueRow) =>
    !q || r.name.toLowerCase().includes(q) || (r.conference ?? '').toLowerCase().includes(q)

  const schoolCell = (name: string | null, onPick?: () => void) => (
    <span className="row" style={{ gap: 7, alignItems: 'center' }}>
      <SchoolArt size={16} file={art(name)} />
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
        mark={<SchoolArt size={22} file={art(me)} />}
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
            <Input placeholder="search a school or a conference" value={query}
              onChange={(e) => setQuery(e.target.value)} />
            {groups
              .filter(([conf, rows]) => !q || conf.toLowerCase().includes(q) || rows.some(matches))
              .map(([conf, rows]) => (
                <Card className="card-pad" key={conf}>
                  <div className="card-head">
                    <Kicker>{conf}</Kicker>
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
              <Meta size={10}>DCC'S OWN ORDER</Meta>
            </div>
            <p className="body-serif" style={{ marginTop: 7 }}>
              The save carries results, not a poll — there is no AP or coaches' number in the file
              that DCC has found. This is record first, with scoring margin as the tie-break and a
              cap on it, so a 70-0 win over nobody cannot outrank a win.
            </p>
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
                {order.filter(matches).slice(0, 40).map((r) => (
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
                      <SchoolArt size={18} file={art(name)} />
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
            <Input placeholder="search a school or a conference" value={query}
              onChange={(e) => setQuery(e.target.value)} />
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
                {order.filter(matches).slice(0, 60).map((r) => (
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
                                <SchoolArt size={16} file={art(home ? g.away : g.home)} />
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
              <Kicker>Every school</Kicker>
              <div style={{ marginTop: 9 }}>
                <Input placeholder="search" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <div className="col" style={{ gap: 0, marginTop: 10 }}>
                {order.filter(matches).slice(0, 60).map((r) => (
                  <button key={r.name} onClick={() => setPick(r.name)}
                    style={{ all: 'unset', cursor: 'pointer', borderTop: '1px solid var(--line)', padding: '5px 0' }}>
                    <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <SchoolArt size={16} file={art(r.name)} />
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
