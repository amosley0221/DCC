import { useMemo, useState } from 'react'
import { useSave } from '../saveStore'
import { useStore } from '../store'
import { Btn, Card, Chip, Empty, Input, Kicker, Meta, PlayerFace, SectionHeader, Track } from '../ui'
import { TEAM_ID_NAMES } from '../../electron/teamIds'
import type { RosterPlayer } from '../../electron/saveAnalysis'

const UNASSIGNED = 255

const ovrColour = (o: number) =>
  o >= 90 ? 'var(--accent)' : o >= 80 ? 'var(--good)' : o >= 70 ? 'var(--ink)' : 'var(--ink3)'

/**
 * Editing players on any roster, straight into the save.
 *
 * The game gives you no way to change another programme's players, which is the
 * point of this screen. It writes the same way the schedule editor does: a
 * timestamped backup first, then a rebuilt save that is refused unless it reads
 * back with exactly the numbers asked for and nothing else moved.
 *
 * Only overall and the 52 placed ratings are offered. A rating DCC cannot place
 * is not written, because a wrong bit lands in a neighbouring field.
 */
export default function TamperSave() {
  const { save, patch } = useSave()
  const { state, dispatch } = useStore()
  const { path, roster, rosterBusy } = save
  const [query, setQuery] = useState('')
  const [teamFilter, setTeamFilter] = useState<number | null>(null)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [edits, setEdits] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const nameOf = (id: number) => state.teamNames[id] ?? TEAM_ID_NAMES[id] ?? `Team ${id}`

  const load = async () => {
    if (!path) return
    patch({ rosterBusy: true })
    const res = await window.dcc.roster(path)
    patch({ rosterBusy: false })
    if (res.ok) {
      patch({ roster: { count: res.count, ratingNames: res.ratingNames, unverifiedPairs: res.unverifiedPairs, schools: res.schools, coaches: res.coaches, stores: res.stores, games: res.games, players: res.players } })
    }
  }

  /** Everyone on a roster other than the user's own team. */
  const pool = useMemo(() => {
    const mine = state.teamId
    return (roster?.players ?? []).filter((p) => p.team !== UNASSIGNED && p.team !== mine)
  }, [roster, state.teamId])

  const teams = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of pool) m.set(p.team, (m.get(p.team) ?? 0) + 1)
    return [...m.keys()].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
  }, [pool, state.teamNames])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pool
      .filter((p) => (teamFilter === null || p.team === teamFilter) &&
        (!q || (p.first + ' ' + p.last).toLowerCase().includes(q)))
      .sort((a, b) => b.overall - a.overall)
      .slice(0, 60)
  }, [pool, query, teamFilter])

  const open = openIndex === null ? null : pool.find((p) => p.index === openIndex) ?? null

  const write = async () => {
    if (!path || !open || !roster) return
    const ratings: Record<string, number> = {}
    let overall: number | undefined
    for (const [k, v] of Object.entries(edits)) {
      if (k === 'overall') overall = v; else ratings[k] = v
    }
    setBusy(true); setNote(null)
    const res = await window.dcc.writePlayers(path, [{ index: open.index, overall, ratings }], roster.count)
    setBusy(false)
    if (!res.ok) {
      setNote(res.message)
      dispatch({ type: 'log', line: { text: `tamper refused: ${res.message}`, kind: 'bad' } })
      return
    }
    setNote(`${res.message}. Backup at ${res.backup}`)
    dispatch({ type: 'log', line: { text: `${open.first} ${open.last} of ${nameOf(open.team)}: ${res.message}`, kind: 'good' } })
    setEdits({})
    await load()
  }

  return (
    <>
      <SectionHeader
        title="Tamper"
        sub={<Meta>{roster ? `${pool.length.toLocaleString()} PLAYERS ON OTHER ROSTERS` : 'ROSTER NOT READ YET'}</Meta>}
      />
      <div className="col" style={{ gap: 12, maxWidth: 900 }}>
        {!roster ? (
          <Card className="card-pad">
            <Kicker>Read the roster first</Kicker>
            <p className="body-serif" style={{ marginTop: 7 }}>
              Tampering edits players on other programmes' rosters, which the game itself gives
              you no way to do. It needs the save read first.
            </p>
            <Btn variant="primary" onClick={load} disabled={rosterBusy}>
              {rosterBusy ? 'Reading…' : 'Read the roster'}
            </Btn>
          </Card>
        ) : (
          <>
            <Card className="card-pad">
              <Kicker>Find a player</Kicker>
              <p className="body-serif" style={{ marginTop: 7 }}>
                Every change is written to your dynasty file after a timestamped backup, and is
                refused unless the save reads back with exactly the numbers you asked for and
                nothing else moved.
              </p>
              <Input placeholder="search by name" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <Chip on={teamFilter === null} onClick={() => setTeamFilter(null)}>EVERY SCHOOL</Chip>
                {teams.slice(0, 30).map((id) => (
                  <Chip key={id} on={teamFilter === id} onClick={() => setTeamFilter(id)}>{nameOf(id)}</Chip>
                ))}
              </div>
            </Card>

            <Card className="card-pad">
              {shown.length === 0 ? <Empty>nobody matches</Empty> : null}
              {shown.map((p) => (
                <div key={p.index} style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 8 }}>
                  <button
                    onClick={() => { setOpenIndex(openIndex === p.index ? null : p.index); setEdits({}); setNote(null) }}
                    style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}
                  >
                    <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                      <PlayerFace file={save.facePaths[p.assetId]} first={p.first} last={p.last} size={28} />
                      <span className="num" style={{ fontSize: 17, color: ovrColour(p.overall), width: 30 }}>{p.overall}</span>
                      <Meta size={9}>{p.position}</Meta>
                      <strong style={{ color: 'var(--ink)' }}>{p.first} {p.last}</strong>
                      <Meta size={9}>{nameOf(p.team)}</Meta>
                    </div>
                  </button>
                  {openIndex === p.index ? (
                    <Editor
                      p={p}
                      names={roster.ratingNames}
                      edits={edits}
                      setEdits={setEdits}
                      busy={busy}
                      note={note}
                      onWrite={write}
                    />
                  ) : null}
                </div>
              ))}
              {shown.length === 60 ? <Meta size={9}>showing 60 — narrow it with a search or a school</Meta> : null}
            </Card>
          </>
        )}
      </div>
    </>
  )
}

function Editor({ p, names, edits, setEdits, busy, note, onWrite }: {
  p: RosterPlayer
  names: string[]
  edits: Record<string, number>
  setEdits: (v: Record<string, number>) => void
  busy: boolean
  note: string | null
  onWrite: () => void
}) {
  const set = (k: string, raw: string) => {
    const v = Number(raw)
    const next = { ...edits }
    if (raw === '' || !Number.isFinite(v)) delete next[k]
    else next[k] = Math.max(0, Math.min(99, Math.round(v)))
    setEdits(next)
  }
  const field = (label: string, current: number) => (
    <div key={label} className="row" style={{ gap: 8, alignItems: 'center' }}>
      <Meta size={9}>{label}</Meta>
      <span style={{ flex: 1 }}><Track value={edits[label] ?? current} fill={ovrColour(edits[label] ?? current)} /></span>
      <Input
        style={{ width: 52 }}
        value={edits[label] === undefined ? String(current) : String(edits[label])}
        onChange={(e) => set(label, e.target.value)}
      />
    </div>
  )
  const count = Object.keys(edits).length
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ maxWidth: 320 }}>{field('overall', p.overall)}</div>
      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2px 18px' }}>
        {names.map((n) => field(n, p.ratings[n]))}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
        <Btn variant="primary" size="sm" onClick={onWrite} disabled={busy || count === 0}>
          {busy ? 'Writing…' : count === 0 ? 'Change a number to write' : `Write ${count} change${count === 1 ? '' : 's'} to the save`}
        </Btn>
        {count ? <Btn size="sm" onClick={() => setEdits({})}>Reset</Btn> : null}
      </div>
      {note ? <div className="effect" style={{ marginTop: 8 }}>{note.toUpperCase()}</div> : null}
    </div>
  )
}
