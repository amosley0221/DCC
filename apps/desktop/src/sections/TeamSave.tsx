import { useMemo, useState } from 'react'
import { useSave } from '../saveStore'
import { useStore } from '../store'
import { Btn, Card, Chip, Empty, Input, Kicker, Meta, SchoolArt, SectionHeader, Tab, Track } from '../ui'
import type { RosterPlayer } from '../../electron/saveAnalysis'

const TABS = ['ROSTER', 'DEPTH', 'TEAMS', 'SCHEDULE', 'TRADE'] as const
type TabName = (typeof TABS)[number]

const GROUPS: [string, string[]][] = [
  ['OFFENCE', ['QB', 'HB', 'FB', 'WR', 'TE']],
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
export default function TeamSave() {
  const { save, patch } = useSave()
  const { state, dispatch } = useStore()
  const { path, roster, rosterBusy } = save
  const myTeam = state.teamId
  const names = state.teamNames
  const [naming, setNaming] = useState<number | null>(null)
  const [schoolQuery, setSchoolQuery] = useState('')
  const [tab, setTab] = useState<TabName>('ROSTER')
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)

  const load = async () => {
    if (!path) return
    patch({ rosterBusy: true })
    const res = await window.dcc.roster(path)
    patch({ rosterBusy: false })
    if (res.ok) {
      patch({ roster: { count: res.count, ratingNames: res.ratingNames, unverifiedPairs: res.unverifiedPairs, schools: res.schools, players: res.players } })
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
        title="Team"
        mark={<SchoolArt size={22} file={
          mine ? (save.schoolArt[`${names[mine.id] ?? ''}|logoLight`] ??
                  save.schoolArt[`${names[mine.id] ?? ''}|icon`]) : undefined} />}
        sub={<Meta>{!roster ? 'ROSTER NOT READ YET'
          : mine ? `${(names[mine.id] ?? `TEAM ${mine.id}`).toUpperCase()} — ${mine.list.length} PLAYERS`
          : `${teams.length} PROGRAMMES — PICK YOURS`}</Meta>}
        right={<div className="subtabs">{TABS.map((t) => <Tab key={t} on={tab === t} onClick={() => setTab(t)}>{t}</Tab>)}</div>}
      />

      <div className="col" style={{ gap: 12, maxWidth: 900 }}>
        {roster && naming !== null ? (
          <Card className="card-pad" style={{ borderColor: 'var(--accent)' }}>
            <Kicker>Which school is team {naming}?</Kicker>
            <p className="body-serif" style={{ marginTop: 7 }}>
              These are the {roster.schools.length} schools your save carries. The save does not
              link them to rosters anywhere DCC can read, so pick yours once and it sticks.
            </p>
            <Input placeholder="search schools" value={schoolQuery} onChange={(e) => setSchoolQuery(e.target.value)} />
            <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {roster.schools
                .filter((sc) => !schoolQuery.trim() || sc.name.toLowerCase().includes(schoolQuery.trim().toLowerCase()))
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
                      {sc.name}
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
              but it does not record school names against them anywhere DCC can read yet. Find
              yours by its players and it will be remembered.
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
              The save sorts every player into one of these, 85 to a roster, but never records
              which school each one is. Name any of them and it sticks — they are listed by their
              best players so you can tell them apart.
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
                      <strong style={{ color: names[t.id] ? 'var(--ink)' : 'var(--ink3)' }}>
                        {names[t.id] ?? `Team ${t.id} — name it`}
                      </strong>
                    </button>
                    {t.id === myTeam ? <Meta size={9} color="var(--accent)">YOURS</Meta> : null}
                    <span style={{ color: 'var(--ink3)', fontSize: 11 }}>
                      {t.list.slice(0, 3).map((p) => p.first + ' ' + p.last).join(' · ')}
                    </span>
                  </div>
                ))}
            </div>
            <Meta size={9}>{Object.keys(names).length} of {teams.length} named</Meta>
          </Card>
        ) : tab === 'DEPTH' && mine ? (
          <Card className="card-pad">
            <Kicker>Depth chart</Kicker>
            <p className="body-serif" style={{ marginTop: 7 }}>
              Ordered by overall within each position, which is how the game seeds a depth chart
              before anyone reorders it. DCC cannot yet read your actual ordering.
            </p>
            {GROUPS.map(([label, list]) => (
              <div key={label} style={{ marginTop: 12 }}>
                <Meta size={9}>{label}</Meta>
                {list.map((posName) => {
                  const at = mine.list.filter((p) => p.position === posName)
                  if (!at.length) return null
                  return (
                    <div key={posName} className="row" style={{ gap: 10, alignItems: 'baseline', marginTop: 4 }}>
                      <Meta size={9}>{posName}</Meta>
                      <span style={{ color: 'var(--ink2)', fontSize: 12 }}>
                        {at.map((p) => `${p.first} ${p.last} ${p.overall}`).join('  ·  ')}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </Card>
        ) : tab !== 'ROSTER' ? (
          <Card className="card-pad">
            <Kicker>Not decoded yet</Kicker>
            <p className="body-serif" style={{ marginTop: 7, marginBottom: 0 }}>
              {tab === 'SCHEDULE'
                ? 'Fixtures, results and rankings are not decoded. The player ratings gave themselves up to controlled edits; the equivalent for games has not been located yet.'
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
            <Btn variant="primary" onClick={load} disabled={rosterBusy}>
              {rosterBusy ? 'Reading…' : 'Read the roster'}
            </Btn>
          </Card>
        ) : (
          <>
            <Card className="card-pad">
              <Input placeholder="search every player by name" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="col" style={{ gap: 6, marginTop: 10 }}>
                {GROUPS.map(([label, list]) => (
                  <div key={label} className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Meta size={9}>{label}</Meta>
                    {list.map((p) => (
                      <Chip key={p} on={pos === p} onClick={() => setPos(pos === p ? null : p)}>
                        {p} {counts.get(p) ?? 0}
                      </Chip>
                    ))}
                  </div>
                ))}
              </div>
            </Card>

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
                  onToggle={() => setOpen(open === p.index ? null : p.index)}
                />
              ))}
              {shown.length === 60 ? (
                <Meta size={9}>showing 60 — narrow it with a search or a position</Meta>
              ) : null}
            </Card>
          </>
        )}
      </div>
    </>
  )
}

function PlayerRow({ p, names, open, onToggle }: {
  p: RosterPlayer; names: string[]; open: boolean; onToggle: () => void
}) {
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 8 }}>
      <button onClick={onToggle} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
        <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
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
