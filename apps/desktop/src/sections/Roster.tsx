import { useMemo, useState } from 'react'
import { useSave } from '../saveStore'
import { useStore } from '../store'
import { Btn, Card, Chip, Empty, Input, Kicker, Meta, SectionHeader, Track } from '../ui'
import type { RosterPlayer } from '../../electron/saveAnalysis'

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

/**
 * The dynasty's actual players, read out of the save.
 *
 * Everything here comes from the file — nothing is generated, and nothing that
 * has not been decoded is shown. Team is the notable absence: the save's own
 * team field has not been pinned down, so players are not grouped by school.
 */
export default function Roster() {
  const { save, patch } = useSave()
  const { dispatch } = useStore()
  const { path, report, roster, rosterBusy } = save
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)

  const load = async () => {
    if (!path) return
    patch({ rosterBusy: true })
    const res = await window.dcc.roster(path)
    patch({ rosterBusy: false })
    if (res.ok) {
      patch({ roster: { count: res.count, ratingNames: res.ratingNames, unverifiedPairs: res.unverifiedPairs, players: res.players } })
      dispatch({ type: 'log', line: { text: `read ${res.count.toLocaleString()} players from the save`, kind: 'good' } })
    }
  }

  const shown = useMemo(() => {
    if (!roster) return []
    const q = query.trim().toLowerCase()
    return roster.players
      .filter((p) => (!pos || p.position === pos) && (!q || (p.first + ' ' + p.last).toLowerCase().includes(q)))
      .sort((a, b) => b.overall - a.overall)
      .slice(0, 60)
  }, [roster, query, pos])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of roster?.players ?? []) m.set(p.position, (m.get(p.position) ?? 0) + 1)
    return m
  }, [roster])

  if (!report) {
    return (
      <>
        <SectionHeader title="Roster" sub={<Meta>NO SAVE LOADED</Meta>} />
        <Card className="card-pad">
          <Empty>open your dynasty save in the Save section first</Empty>
        </Card>
      </>
    )
  }

  return (
    <>
      <SectionHeader
        title="Roster"
        sub={<Meta>{roster ? `${roster.count.toLocaleString()} PLAYERS — READ FROM YOUR SAVE` : 'NOT READ YET'}</Meta>}
        right={roster ? undefined : <Btn variant="primary" onClick={load} disabled={rosterBusy}>{rosterBusy ? 'Reading…' : 'Read the roster'}</Btn>}
      />

      <div className="col" style={{ gap: 12, maxWidth: 860 }}>
        {!roster ? (
          <Card className="card-pad">
            <Empty>{rosterBusy ? 'reading the save…' : 'the roster has not been read yet'}</Empty>
          </Card>
        ) : (
          <>
            <Card className="card-pad">
              <Input placeholder="search by name" value={query} onChange={(e) => setQuery(e.target.value)} />
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
              <Kicker>{pos ? `${pos} — best first` : 'Best in the dynasty'}</Kicker>
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
                <Meta size={9}>showing the top 60 — narrow it with a search or a position</Meta>
              ) : null}
            </Card>

            <Card className="card-pad">
              <Kicker>What is not here</Kicker>
              <p className="body-serif" style={{ marginTop: 7, marginBottom: 0 }}>
                Players are not grouped by school: the save's own team field has not been pinned
                down, and the id in a player's asset name is where they were generated rather than
                where they play now. Class year is not decoded either. Both are still being worked
                on, and nothing here is guessed to fill the gap.
              </p>
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
      <button
        onClick={onToggle}
        style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}
      >
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
