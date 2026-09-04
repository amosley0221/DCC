import { useMemo, useState } from 'react'
import { useSave } from '../saveStore'
import { Btn, Card, Chip, Empty, Input, Kicker, Meta, SectionHeader, Tab } from '../ui'
import { useStore } from '../store'
import type { RosterPlayer } from '../../electron/saveAnalysis'

/**
 * The recruiting pool, read from the save.
 *
 * Every player the save does not put on a roster sits in one pool: the 138
 * schools hold exactly 85 each, and everyone left over is a recruit or in the
 * portal. Names, positions, hometowns and all 53 ratings are already readable
 * for them — the same players other dynasty trackers show, matched by name,
 * position and hometown against a live dynasty.
 *
 * What the save has not given up yet is the recruiting layer on top: star
 * rating, class, archetype, interest and commitment. Those are not guessed at
 * here. A column that is not known is absent rather than filled in.
 */
const UNASSIGNED = 255
const GROUPS: [string, string[]][] = [
  ['ALL', []],
  ['OFFENCE', ['QB', 'HB', 'FB', 'WR', 'TE']],
  ['LINE', ['LT', 'LG', 'C', 'RG', 'RT']],
  ['FRONT', ['LE', 'RE', 'DT']],
  ['LINEBACK', ['LOLB', 'MLB', 'ROLB']],
  ['SECONDARY', ['CB', 'FS', 'SS']],
  ['SPECIAL', ['K', 'P']],
]

const ovrColour = (o: number) =>
  o >= 90 ? 'var(--accent)' : o >= 80 ? 'var(--good)' : o >= 70 ? 'var(--ink)' : 'var(--ink3)'

export default function RecruitSave() {
  const { save, patch } = useSave()
  const { dispatch } = useStore()
  const [group, setGroup] = useState('ALL')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<number | null>(null)

  const pool = useMemo(
    () => (save.roster?.players ?? []).filter((p) => p.team === UNASSIGNED),
    [save.roster],
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const want = GROUPS.find(([g]) => g === group)?.[1] ?? []
    return pool
      .filter((p) => (want.length === 0 || want.includes(p.position)) &&
        (!q || `${p.first} ${p.last} ${p.hometown} ${p.position}`.toLowerCase().includes(q)))
      .sort((a, b) => b.overall - a.overall)
  }, [pool, group, query])

  const load = async () => {
    if (!save.path) return
    patch({ rosterBusy: true })
    const res = await window.dcc.roster(save.path)
    patch({ rosterBusy: false })
    if (res.ok) {
      patch({ roster: { count: res.count, ratingNames: res.ratingNames, unverifiedPairs: res.unverifiedPairs, schools: res.schools, players: res.players } })
      dispatch({ type: 'log', line: { text: `read ${res.count.toLocaleString()} players from the save`, kind: 'good' } })
    }
  }

  const header = (
    <SectionHeader
      title="Recruit"
      sub={<Meta>{save.roster ? `${pool.length.toLocaleString()} IN THE POOL` : 'ROSTER NOT READ YET'}</Meta>}
    />
  )

  if (!save.roster) {
    return (
      <>
        {header}
        <Card className="card-pad">
          <Kicker>Recruiting pool</Kicker>
          <p className="body-serif" style={{ marginTop: 7 }}>
            Your recruits are in the save. Read it and they appear here.
          </p>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <Btn onClick={load} disabled={save.rosterBusy}>
              {save.rosterBusy ? 'Reading…' : 'Read the save'}
            </Btn>
          </div>
        </Card>
      </>
    )
  }

  if (!pool.length) {
    return (
      <>
        {header}
        <Card className="card-pad">
          <Kicker>Recruiting pool</Kicker>
          <Empty>This save has no unrostered players.</Empty>
        </Card>
      </>
    )
  }

  return (
    <>
    {header}
    <Card className="card-pad">
      <Kicker>Recruiting pool — from your save</Kicker>
      <p className="body-serif" style={{ marginTop: 7 }}>
        {pool.length.toLocaleString()} players your save does not put on any of the 138 rosters:
        recruits and the portal. Star rating, class and commitment are not readable yet, so they
        are left out rather than invented — this is sorted on the save's own overall.
      </p>

      <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {GROUPS.map(([g]) => (
          <Tab key={g} on={group === g} onClick={() => setGroup(g)}>{g}</Tab>
        ))}
      </div>

      <div style={{ marginTop: 10 }}>
        <Input placeholder="search name, hometown or position"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div style={{ marginTop: 8 }}>
        <Meta>
          {shown.length.toLocaleString()} shown{shown.length !== pool.length ? ` of ${pool.length.toLocaleString()}` : ''}
        </Meta>
      </div>

      <div className="col" style={{ gap: 2, marginTop: 8 }}>
        {shown.slice(0, 300).map((p) => (
          <RecruitRow key={p.index} p={p} open={open === p.index}
            ratingNames={save.roster!.ratingNames}
            onClick={() => setOpen(open === p.index ? null : p.index)} />
        ))}
      </div>

      {shown.length > 300 && (
        <div style={{ marginTop: 8 }}>
          <Meta>Showing the top 300 — narrow the search to see further down.</Meta>
        </div>
      )}
    </Card>
    </>
  )
}

function RecruitRow(
  { p, open, onClick, ratingNames }:
  { p: RosterPlayer; open: boolean; onClick: () => void; ratingNames: string[] },
) {
  return (
    <div>
      <button className="row" onClick={onClick}
        style={{
          gap: 10, width: '100%', textAlign: 'left', padding: '5px 8px',
          background: open ? 'var(--rule)' : 'transparent',
          border: 0, borderRadius: 4, cursor: 'pointer', alignItems: 'baseline',
        }}>
        <span style={{ width: 34, color: 'var(--ink3)', fontSize: 12 }}>{p.position}</span>
        <span style={{ flex: 1 }}>{p.first} {p.last}</span>
        <span style={{ color: 'var(--ink3)', fontSize: 12 }}>{p.hometown}</span>
        <span style={{ width: 30, textAlign: 'right', color: ovrColour(p.overall), fontWeight: 600 }}>
          {p.overall}
        </span>
      </button>
      {open && (
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', padding: '6px 8px 10px 44px' }}>
          {ratingNames.map((n) => {
            const v = p.ratings[n]
            return v === undefined ? null : (
              <Chip key={n} on={false}>
                <span style={{ color: 'var(--ink3)' }}>{n}</span> {v}
              </Chip>
            )
          })}
        </div>
      )}
    </div>
  )
}
