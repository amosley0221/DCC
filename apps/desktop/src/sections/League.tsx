import { useMemo, useState } from 'react'
import { useSave } from '../saveStore'
import { useStore } from '../store'
import { Card, Chip, Empty, Kicker, Meta, SchoolArt, SectionHeader, Tab } from '../ui'
import { TEAM_ID_NAMES } from '../../electron/teamIds'
import {
  buildLeague, conferenceArtKeys, conferences, FIRST_ROUND, margin, played,
  projectPlayoff, QUARTERFINALS, rankings, visibleGames, winPct,
} from '../../electron/league'
import type { LeagueRow, PlayoffField } from '../../electron/league'
import { currentWeek } from '../../electron/season'

const TABS = ['STANDINGS', 'RANKINGS', 'SCORES', 'POSTSEASON', 'STATS', 'SCHEDULES'] as const

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

  /**
   * The twelve-team field. A projection until the save has played one — there is
   * no bracket in a November file, and no conference title game has happened
   * yet, so its "champions" are the programs leading their conferences.
   */
  const field = useMemo(() => projectPlayoff(table), [table])
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
      <SchoolArt size={24} file={art(name)} />
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
        mark={<SchoolArt size={30} file={art(me)} />}
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
                      <SchoolArt size={26} file={art(name)} />
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
            art={art}
            award={(k) => save.awardArt[k]}
            me={me}
            onPick={(n) => { setPick(n); setTab('SCHEDULES') }}
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
                                <SchoolArt size={24} file={art(home ? g.away : g.home)} />
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
                      <SchoolArt size={24} file={art(r.name)} />
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
function Postseason({ field, bowls, art, award, me, onPick }: {
  field: PlayoffField
  bowls: SeasonGameish[]
  art: (name: string | null) => string | undefined
  /** Art that is not a school: "playoff:round1", "bowl:rosebowl", "trophy:heisman". */
  award: (key: string) => string | undefined
  me: string | null
  onPick: (name: string) => void
}) {
  const bySeed = new Map(field.teams.map((t) => [t.seed, t]))
  const seed = (n: number) => bySeed.get(n) ?? null

  const Slot = ({ n, note }: { n: number | null; note?: string }) => {
    const t = n === null ? null : seed(n)
    return (
      <div className="cfp-slot">
        <span className="cfp-seed">{n ?? ''}</span>
        {t ? <SchoolArt size={22} file={art(t.row.name)} /> : <span style={{ width: 22 }} />}
        <button
          onClick={t ? () => onPick(t.row.name) : undefined}
          style={{
            all: 'unset', cursor: t ? 'pointer' : 'default', flex: 1, minWidth: 0,
            color: t && t.row.name === me ? 'var(--accent)' : t ? 'var(--ink)' : 'var(--ink3)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >{t ? t.row.name : note ?? 'TBD'}</button>
        {t ? (
          <span className="num" style={{ fontSize: 12, color: 'var(--ink3)' }}>
            {t.row.wins}-{t.row.losses}
          </span>
        ) : null}
        {t?.champion ? <Meta size={9} color="var(--accent)">CH</Meta> : null}
      </div>
    )
  }

  return (
    <>
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

      <div className="cfp">
        <div className="cfp-col">
          <RoundHead file={award('playoff:round1')} label="First round" />
          {FIRST_ROUND.map(([a, b]) => (
            <Card className="cfp-game" key={a}>
              <Slot n={a} /><Slot n={b} />
            </Card>
          ))}
        </div>
        <div className="cfp-col">
          <RoundHead file={award('playoff:qtrfinal')} label="Quarterfinals" />
          {QUARTERFINALS.map(({ seed: s, from }) => (
            <Card className="cfp-game" key={s}>
              <Slot n={s} />
              <div className="cfp-slot">
                <span className="cfp-seed" />
                <span style={{ width: 22 }} />
                <span style={{ flex: 1, color: 'var(--ink3)' }}>
                  Winner of {from[0]} v {from[1]}
                </span>
              </div>
            </Card>
          ))}
        </div>
        <div className="cfp-col">
          <RoundHead file={award('playoff:semigame')} label="Semifinals" />
          <Card className="cfp-game">
            <div className="cfp-slot"><span className="cfp-seed" /><span style={{ width: 22 }} />
              <span style={{ flex: 1, color: 'var(--ink3)' }}>Winner of the 1 bracket</span></div>
            <div className="cfp-slot"><span className="cfp-seed" /><span style={{ width: 22 }} />
              <span style={{ flex: 1, color: 'var(--ink3)' }}>Winner of the 4 bracket</span></div>
          </Card>
          <Card className="cfp-game">
            <div className="cfp-slot"><span className="cfp-seed" /><span style={{ width: 22 }} />
              <span style={{ flex: 1, color: 'var(--ink3)' }}>Winner of the 3 bracket</span></div>
            <div className="cfp-slot"><span className="cfp-seed" /><span style={{ width: 22 }} />
              <span style={{ flex: 1, color: 'var(--ink3)' }}>Winner of the 2 bracket</span></div>
          </Card>
          <Card className="cfp-game" style={{ borderColor: 'var(--accent)' }}>
            <div className="cfp-slot">
              <span className="cfp-seed" />
              <SchoolArt size={22} file={award('playoff:nationalchampionship')} />
              <span style={{ flex: 1, color: 'var(--accent)' }}>National championship</span>
            </div>
          </Card>
        </div>
      </div>

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
                <SchoolArt size={22} file={art(team)} />
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
              return (
                <div key={g.row} className="row"
                  style={{ gap: 10, alignItems: 'center', borderTop: '1px solid var(--line)', padding: '8px 0' }}>
                  <SchoolArt size={22} file={award('bowl:default')} />
                  <Meta size={9}>WK {g.week}</Meta>
                  <span className="row" style={{ gap: 7, alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <SchoolArt size={24} file={art(g.away)} />
                    <span style={{ color: g.played && homeWon ? 'var(--ink3)' : 'var(--ink)' }}>{g.away}</span>
                  </span>
                  <span className="num" style={{ color: g.played && homeWon ? 'var(--ink3)' : 'var(--ink)' }}>
                    {g.played ? g.awayScore : ''}
                  </span>
                  <Meta size={9}>AT</Meta>
                  <span className="row" style={{ gap: 7, alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <SchoolArt size={24} file={art(g.home)} />
                    <span style={{ color: g.played && !homeWon ? 'var(--ink3)' : 'var(--ink)' }}>{g.home}</span>
                  </span>
                  <span className="num" style={{ color: g.played && !homeWon ? 'var(--ink3)' : 'var(--ink)' }}>
                    {g.played ? g.homeScore : ''}
                  </span>
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
