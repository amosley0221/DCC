import { useMemo, useState } from 'react'
import { useSave } from '../saveStore'
import { useStore } from '../store'
import { Btn, Card, Chip, Empty, Input, Kicker, Meta, PlayerFace, SchoolArt, SectionHeader, Tab, Track } from '../ui'
import type { RosterPlayer } from '../../electron/saveAnalysis'
import { TEAM_ID_NAMES } from '../../electron/teamIds'
import Schedule from './Schedule'
import DepthChart from './DepthChart'

const TABS = ['ROSTER', 'DEPTH', 'TEAMS', 'SCHEDULE', 'TRADE'] as const
type TabName = (typeof TABS)[number]

const GROUPS: [string, string[]][] = [
  ['OFFENSE', ['QB', 'HB', 'FB', 'WR', 'TE']],
  ['LINE', ['LT', 'LG', 'C', 'RG', 'RT']],
  ['FRONT', ['LE', 'RE', 'DT']],
  ['LINEBACK', ['LOLB', 'MLB', 'ROLB']],
  ['SECONDARY', ['CB', 'FS', 'SS']],
  ['SPECIAL', ['K', 'P']],
]

const ovrColour = (o: number) =>
  o >= 90 ? 'var(--accent)' : o >= 80 ? 'var(--good)' : o >= 70 ? 'var(--ink)' : 'var(--ink3)'

const UNASSIGNED = 255

/**
 * Team, driven by the save rather than the sample dynasty.
 *
 * The design puts the roster inside Team behind a team picker, so that is where
 * it lives. The picker is the piece that is missing: without the player→team
 * link every list here is league-wide, and the screen says so plainly rather
 * than implying these are your players.
 */
export default function TeamSave({ view }: { view?: 'schedule' } = {}) {
  const { save, patch } = useSave()
  const { state, dispatch } = useStore()
  const { path, roster, rosterBusy } = save
  const myTeam = state.teamId
  const names = state.teamNames
  const [naming, setNaming] = useState<number | null>(null)
  /** The save's own name for a team, unless the user has set one. */
  const nameOf = (id: number) => names[id] ?? TEAM_ID_NAMES[id] ?? null
  // Conference and coach come from the save keyed by the same team id the
  // players carry, so an unnamed roster is still identifiable.
  const coachOf = useMemo(() => {
    const m = new Map<number, { coach: string | null; conference: string | null; division: string | null }>()
    for (const c of roster?.coaches ?? []) m.set(c.teamId, c)
    return m
  }, [roster])
  const [schoolQuery, setSchoolQuery] = useState('')
  const [tab, setTab] = useState<TabName>(view === 'schedule' ? 'SCHEDULE' : 'ROSTER')
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)

  const load = async () => {
    if (!path) return
    patch({ rosterBusy: true })
    const res = await window.dcc.roster(path)
    patch({ rosterBusy: false })
    if (res.ok) {
      patch({ roster: { count: res.count, ratingNames: res.ratingNames, unverifiedPairs: res.unverifiedPairs, schools: res.schools, coaches: res.coaches, stores: res.stores, games: res.games, players: res.players } })
      dispatch({ type: 'log', line: { text: `read ${res.count.toLocaleString()} players from the save`, kind: 'good' } })
    }
  }


  /** Rosters, strongest first. Team 255 is the recruit and portal pool. */
  const teams = useMemo(() => {
    const m = new Map<number, RosterPlayer[]>()
    for (const p of roster?.players ?? []) {
      if (p.team === UNASSIGNED) continue
      const l = m.get(p.team); if (l) l.push(p); else m.set(p.team, [p])
    }
    return [...m.entries()]
      .map(([id, list]) => ({
        id,
        list: list.sort((a, b) => b.overall - a.overall),
        top: Math.round(list.slice(0, 25).reduce((s2, p) => s2 + p.overall, 0) / Math.min(25, list.length)),
      }))
      .sort((a, b) => b.top - a.top)
  }, [roster])

  const mine = useMemo(() => teams.find((t) => t.id === myTeam) ?? null, [teams, myTeam])

  // The press needs names to write about and a record to set the scene, both
  // keyed by school name because that is what a game row carries.
  const pressPlayers = useMemo(() => {
    const m = new Map<string, { first: string; last: string; position: string; overall: number }[]>()
    for (const t of teams) {
      const name = nameOf(t.id); if (!name) continue
      m.set(name, t.list.slice(0, 6).map((p) => ({ first: p.first, last: p.last, position: p.position, overall: p.overall })))
    }
    return m
  }, [teams, names])

  const pressRecords = useMemo(() => {
    const m = new Map<string, { wins: number; losses: number }>()
    for (const g of roster?.games ?? []) {
      if (!g.played || g.postseason || !g.home || !g.away) continue
      const homeWon = g.homeScore > g.awayScore
      for (const [n, won] of [[g.home, homeWon], [g.away, !homeWon]] as [string, boolean][]) {
        const r = m.get(n) ?? { wins: 0, losses: 0 }
        if (won) r.wins++; else r.losses++
        m.set(n, r)
      }
    }
    return m
  }, [roster])

  const pool = useMemo(() => (mine ? mine.list : roster?.players ?? []), [mine, roster])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pool
      .filter((p) => (!pos || p.position === pos) && (!q || (p.first + ' ' + p.last).toLowerCase().includes(q)))
      .sort((a, b) => b.overall - a.overall)
      .slice(0, mine ? 100 : 60)
  }, [pool, query, pos, mine])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of pool) m.set(p.position, (m.get(p.position) ?? 0) + 1)
    return m
  }, [pool])

  return (
    <>
      <SectionHeader
        title={view === 'schedule' ? 'Scores' : 'Team'}
        mark={<SchoolArt size={22} file={
          mine ? (save.schoolArt[`${nameOf(mine.id) ?? ''}|logoLight`] ??
                  save.schoolArt[`${nameOf(mine.id) ?? ''}|icon`]) : undefined} />}
        sub={<Meta>{view === 'schedule'
          ? [mine ? coachOf.get(mine.id)?.conference : null, mine ? coachOf.get(mine.id)?.division : null]
              .filter(Boolean).join(' · ').toUpperCase() || 'SEASON RESULTS'
          : !roster ? (rosterBusy || save.restoring ? 'READING YOUR SAVE…' : 'ROSTER NOT READ YET')
          : mine ? `${(nameOf(mine.id) ?? `TEAM ${mine.id}`).toUpperCase()} — ${mine.list.length} PLAYERS`
          : `${teams.length} PROGRAMMES — PICK YOURS`}</Meta>}
        right={view === 'schedule' ? undefined
          : <div className="subtabs">{TABS.map((t) => <Tab key={t} on={tab === t} onClick={() => setTab(t)}>{t}</Tab>)}</div>}
      />

      <div className="col" style={{ gap: 12, maxWidth: roster && (tab === 'ROSTER' || tab === 'SCHEDULE') ? undefined : 900 }}>
        {roster && naming !== null ? (
          <Card className="card-pad" style={{ borderColor: 'var(--accent)' }}>
            <Kicker>
              Which school is team {naming}?
              {coachOf.get(naming)?.conference
                ? ` — ${coachOf.get(naming)!.conference}${coachOf.get(naming)!.division ? ' ' + coachOf.get(naming)!.division : ''}, coached by ${coachOf.get(naming)!.coach ?? 'someone'}`
                : ''}
            </Kicker>
            <p className="body-serif" style={{ marginTop: 7 }}>
              These are the {roster.schools.length} schools your save carries. The save does not
              link them to rosters anywhere DCC can read, so pick yours once and it sticks. The
              conference and coach above come from the save and should narrow it down.
            </p>
            <Input placeholder="search schools" value={schoolQuery} onChange={(e) => setSchoolQuery(e.target.value)} />
            <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {roster.schools
                .filter((sc) => !schoolQuery.trim() ||
                  [sc.name, sc.fullName, sc.abbr, sc.nickname, sc.shortNickname, sc.altAbbr]
                    .some((n) => n && n.toLowerCase().includes(schoolQuery.trim().toLowerCase())))
                .slice(0, 24)
                .map((sc) => (
                  <Chip key={sc.slug} on={false}
                    onClick={() => {
                      dispatch({ type: 'teamName', id: naming, name: sc.name })
                      if (myTeam === null) dispatch({ type: 'teamId', id: naming })
                      setNaming(null); setSchoolQuery('')
                    }}>
                    <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                      <SchoolArt size={16} file={
                        save.schoolArt[`${sc.name}|logoLight`] ??
                        save.schoolArt[`${sc.name}|icon`] ??
                        save.schoolArt[`${sc.name}|logoGold`]} />
                      {sc.fullName && sc.fullName !== sc.name ? sc.fullName : sc.name}
                      {sc.nickname ? <span style={{ color: 'var(--ink3)' }}> {sc.nickname}</span> : null}
                    </span>
                  </Chip>
                ))}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <Btn onClick={() => { if (myTeam === null) dispatch({ type: 'teamId', id: naming }); setNaming(null) }}>
                Skip — just call it team {naming}
              </Btn>
            </div>
          </Card>
        ) : roster && !mine ? (
          <Card className="card-pad" style={{ borderColor: 'var(--accent)' }}>
            <Kicker>Which one is yours?</Kicker>
            <p className="body-serif" style={{ marginTop: 7 }}>
              The save groups players into {teams.length} rosters of 85 — the scholarship limit —
              but it does not record school names against them anywhere DCC can read yet. Each
              one's conference and head coach do come from the save, which with its best players
              should be enough to tell them apart. Find yours and it will be remembered.
            </p>
            <Input
              placeholder="type a player on your team"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="col" style={{ gap: 4, marginTop: 10 }}>
              {teams
                .filter((t) => !query.trim() || t.list.some((p) =>
                  (p.first + ' ' + p.last).toLowerCase().includes(query.trim().toLowerCase())))
                .slice(0, 8)
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setNaming(t.id); setQuery('') }}
                    style={{ all: 'unset', cursor: 'pointer', padding: '6px 0', borderTop: '1px solid var(--line)' }}
                  >
                    <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
                      <Meta size={9}>TEAM {t.id}</Meta>
                      <span className="num" style={{ color: 'var(--ink)' }}>{t.top}</span>
                      <span style={{ color: 'var(--ink2)', fontSize: 12 }}>
                        {t.list.slice(0, 4).map((p) => p.first + ' ' + p.last).join(' · ')}
                      </span>
                    </div>
                  </button>
                ))}
            </div>
          </Card>
        ) : null}

        {tab === 'TEAMS' && roster ? (
          <Card className="card-pad">
            <Kicker>All {teams.length} programmes</Kicker>
            <p className="body-serif" style={{ marginTop: 7 }}>
              Every school is named, along with its conference and head coach. The save does not
              write a school against a roster, but each recruit's top-ten list names schools by
              the same team id the players carry, so the two can be joined. Rename any of them if
              a dynasty has moved things around.
            </p>
            <Input placeholder="search by player or school name" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="col" style={{ gap: 0, marginTop: 10 }}>
              {teams
                .filter((t) => {
                  const q = query.trim().toLowerCase()
                  if (!q) return true
                  return (names[t.id] ?? '').toLowerCase().includes(q) ||
                    t.list.some((p) => (p.first + ' ' + p.last).toLowerCase().includes(q))
                })
                .slice(0, 40)
                .map((t) => (
                  <div key={t.id} className="row"
                    style={{ gap: 10, alignItems: 'baseline', borderTop: '1px solid var(--line)', padding: '6px 0' }}>
                    <span className="num" style={{ color: 'var(--ink)', width: 26 }}>{t.top}</span>
                    <button onClick={() => setNaming(t.id)} style={{ all: 'unset', cursor: 'pointer', minWidth: 150 }}>
                      <strong style={{ color: nameOf(t.id) ? 'var(--ink)' : 'var(--ink3)' }}>
                        {nameOf(t.id) ?? `Team ${t.id} — name it`}
                      </strong>
                    </button>
                    {t.id === myTeam ? <Meta size={9} color="var(--accent)">YOURS</Meta> : null}
                    <span style={{ color: 'var(--ink3)', fontSize: 11, width: 130 }}>
                      {[coachOf.get(t.id)?.conference, coachOf.get(t.id)?.division].filter(Boolean).join(' ')}
                    </span>
                    <span style={{ color: 'var(--ink3)', fontSize: 11, width: 110 }}>
                      {coachOf.get(t.id)?.coach ?? ''}
                    </span>
                    <span style={{ color: 'var(--ink3)', fontSize: 11, flex: 1 }}>
                      {t.list.slice(0, 3).map((p) => p.first + ' ' + p.last).join(' · ')}
                    </span>
                  </div>
                ))}
            </div>
            <Meta size={9}>{Object.keys(names).length} of {teams.length} named</Meta>
          </Card>
        ) : tab === 'DEPTH' && mine ? (
          <DepthChart team={mine.id} players={roster?.players ?? []} />
        ) : tab === 'SCHEDULE' && roster ? (
          <Schedule
            games={roster.games ?? []}
            team={mine ? nameOf(mine.id) : null}
            art={save.schoolArt}
            savePath={path}
            onEdited={load}
            log={(text, kind) => dispatch({ type: 'log', line: { text, kind: kind ?? 'good' } })}
            players={pressPlayers}
            records={pressRecords}
            apiKey={state.anthropicKey}
          />
        ) : tab !== 'ROSTER' ? (
          <Card className="card-pad">
            <Kicker>{tab === 'SCHEDULE' ? 'Schedule' : 'Not decoded yet'}</Kicker>
            <p className="body-serif" style={{ marginTop: 7, marginBottom: 0 }}>
              {tab === 'SCHEDULE'
                ? 'Read the roster first; the schedule comes out of the save in the same pass.'
                : 'A trade needs writing back to the save, which is deliberately not attempted yet — reading is solved, and a wrong byte in a 31 MB save is a lost dynasty.'}
            </p>
          </Card>
        ) : !roster ? (
          <Card className="card-pad">
            <Kicker>Roster</Kicker>
            <p className="body-serif" style={{ marginTop: 7 }}>
              Names, hometowns, positions, overalls, redshirt status and all 53 ratings, read
              straight out of your save.
            </p>
            {/* It reads itself on launch now, so the button is the fallback
                rather than the way in: a save that moved, or a read that
                failed. */}
            <Btn variant="primary" onClick={load} disabled={rosterBusy || save.restoring}>
              {rosterBusy || save.restoring ? 'Reading…' : 'Read the roster'}
            </Btn>
          </Card>
        ) : (
          <div className="rail">
            <Card className="card-pad">
              <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
                <Kicker>{mine ? (names[mine.id] ?? `Team ${mine.id}`) : 'Every school'}{pos ? ` — ${pos}` : ''}, best first</Kicker>
                {mine ? (
                  <button onClick={() => dispatch({ type: 'teamId', id: null })}
                    style={{ all: 'unset', cursor: 'pointer' }}>
                    <Meta size={9} color="var(--accent)">CHANGE TEAM</Meta>
                  </button>
                ) : null}
              </div>
              {shown.length === 0 ? <Empty>nobody matches</Empty> : null}
              {shown.map((p) => (
                <PlayerRow
                  key={p.index}
                  p={p}
                  names={roster.ratingNames}
                  open={open === p.index}
                  face={save.facePaths[p.assetId]}
                  onToggle={() => setOpen(open === p.index ? null : p.index)}
                />
              ))}
              {shown.length === 60 ? (
                <Meta size={9}>showing 60 — narrow it with a search or a position</Meta>
              ) : null}
            </Card>

            <div className="col" style={{ gap: 12 }}>
              <Card className="card-pad">
                <Kicker>Find a player</Kicker>
                <div style={{ marginTop: 9 }}>
                  <Input placeholder="search every player by name" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <div className="col" style={{ gap: 8, marginTop: 12 }}>
                  {GROUPS.map(([label, list]) => (
                    <div key={label}>
                      <Meta size={9}>{label}</Meta>
                      <div className="row" style={{ gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
                        {list.map((p) => (
                          <Chip key={p} on={pos === p} onClick={() => setPos(pos === p ? null : p)}>
                            {p} {counts.get(p) ?? 0}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function PlayerRow({ p, names, open, onToggle, face }: {
  p: RosterPlayer; names: string[]; open: boolean; onToggle: () => void; face?: string
}) {
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 8 }}>
      <button onClick={onToggle} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <PlayerFace file={face} first={p.first} last={p.last} size={28} />
          <span className="num" style={{ fontSize: 17, color: ovrColour(p.overall), width: 30 }}>{p.overall}</span>
          <Meta size={9}>{p.position}</Meta>
          <strong style={{ color: 'var(--ink)' }}>{p.first} {p.last}</strong>
          <Meta size={9}>{p.hometown}</Meta>
          {p.redshirt ? <Meta size={9} color="var(--warn)">REDSHIRT</Meta> : null}
        </div>
      </button>
      {open ? (
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2px 18px' }}>
          {names.map((n) => (
            <div key={n} className="row" style={{ gap: 8, alignItems: 'center' }}>
              <Meta size={9}>{n}</Meta>
              <span style={{ flex: 1 }}><Track value={p.ratings[n]} fill={ovrColour(p.ratings[n])} /></span>
              <span className="num" style={{ fontSize: 11, color: 'var(--ink2)', width: 20, textAlign: 'right' }}>{p.ratings[n]}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
