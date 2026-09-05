import { useEffect, useMemo, useState } from 'react'
import { useSave } from '../saveStore'
import { useStore } from '../store'
import { Btn, Card, Kicker, Meta, PlayerFace } from '../ui'
import { DEPTH_SLOT_RANK as SLOT_RANK } from '../../electron/positions'
import type { RosterPlayer } from '../../electron/saveAnalysis'

type Slot = { abbr: string; name: string; side: 'offense' | 'defense' | 'special' }

/**
 * The depth chart, read out of the save and reordered in place.
 *
 * A slot's order is the order the game plays them, so this shows exactly what
 * the save holds rather than sorting by overall — which is what the screen did
 * before the chart could be read, and which was wrong for every team that had
 * ever touched theirs.
 *
 * Changes are held here until they are committed. Nothing reaches the save
 * until the button is pressed, and what is written is a reorder of the players
 * already in the slot — never a different set.
 */
export default function DepthChart({ team, players }: { team: number; players: RosterPlayer[] }) {
  const { save } = useSave()
  const { dispatch } = useStore()
  const path = save.path
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [charts, setCharts] = useState<{ block: number; slots: number[][] }[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const [side, setSide] = useState<Slot['side']>('offense')
  /** slot -> the order the user has dragged it into, until committed. */
  const [edits, setEdits] = useState<Record<number, number[]>>({})
  const [drag, setDrag] = useState<{ slot: number; from: number } | null>(null)

  const byRow = useMemo(() => {
    const m = new Map<number, RosterPlayer>()
    for (const p of players) m.set(p.index, p)
    return m
  }, [players])

  const load = useMemo(() => async (p: string) => {
    setError(null)
    const res = await window.dcc.depth(p)
    if (!res.ok) { setError(res.message); return }
    setSlots(res.slots)
    setCharts(res.charts)
  }, [])

  useEffect(() => { if (path && !charts) void load(path) }, [path, charts, load])

  // The chart region orders teams the way the team table does, and the roster
  // orders them by the save's own team id. They are different numberings, so
  // the block is found by whose players are in it rather than by arithmetic.
  const block = useMemo(() => {
    if (!charts) return -1
    let best = -1, bestHits = 0
    for (const c of charts) {
      let hits = 0, seen = 0
      for (const rows of c.slots) for (const r of rows) {
        const p = byRow.get(r); if (!p) continue
        seen++; if (p.team === team) hits++
      }
      if (seen && hits / seen > 0.9 && hits > bestHits) { best = c.block; bestHits = hits }
    }
    return best
  }, [charts, byRow, team])

  if (!path) return <Card className="card-pad"><Meta>No save open.</Meta></Card>
  if (error) {
    return (
      <Card className="card-pad">
        <Kicker>Depth chart</Kicker>
        <p className="body-serif" style={{ marginTop: 7 }}>{error}</p>
      </Card>
    )
  }
  if (!slots || !charts) return <Card className="card-pad"><Meta>READING THE DEPTH CHART…</Meta></Card>
  if (block < 0) {
    return (
      <Card className="card-pad">
        <Kicker>Depth chart</Kicker>
        <p className="body-serif" style={{ marginTop: 7 }}>
          None of the charts in this save are made up of your team's players. Pick your team on the
          Teams tab first.
        </p>
      </Card>
    )
  }

  const chart = charts[block]
  const rowsOf = (i: number) => edits[i] ?? chart.slots[i]
  const dirty = Object.keys(edits).length

  const move = (slot: number, from: number, to: number) => {
    const rows = [...rowsOf(slot)]
    if (to < 0 || to >= rows.length || from === to) return
    const [x] = rows.splice(from, 1)
    rows.splice(to, 0, x)
    setEdits((e) => {
      const next = { ...e, [slot]: rows }
      // Dragging a slot back to where it started is not a change.
      if (rows.join() === chart.slots[slot].join()) delete next[slot]
      return next
    })
  }

  const commit = async () => {
    setBusy(true)
    const res = await window.dcc.writeDepth(path, Object.entries(edits).map(([slot, rows]) => ({
      block, slot: Number(slot), rows,
    })))
    setBusy(false)
    dispatch({ type: 'log', line: { text: res.message, kind: res.ok ? 'good' : 'bad' } })
    if (!res.ok) return
    setEdits({})
    setCharts(null)   // re-read, so what is shown is what the save now holds
  }

  // Ordered for reading, not for storage: the slot index `i` is what gets
  // written back, so it travels with the row rather than being its position.
  const shown = slots
    .map((s, i) => ({ ...s, i }))
    .filter((s) => s.side === side)
    .sort((a, b) => (SLOT_RANK.get(a.abbr) ?? 99) - (SLOT_RANK.get(b.abbr) ?? 99))

  return (
    <div className="col" style={{ gap: 12 }}>
      <Card className="card-pad">
        <div className="row" style={{ gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Kicker>Depth chart</Kicker>
          <div className="subtabs" style={{ marginLeft: 'auto' }}>
            {(['offense', 'defense', 'special'] as const).map((s) => (
              <button key={s} className="tab" aria-pressed={side === s} onClick={() => setSide(s)}
                style={{ color: side === s ? 'var(--accent)' : undefined }}>
                {s === 'special' ? 'SPECIAL TEAMS' : s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <p className="body-serif" style={{ marginTop: 7 }}>
          Read out of your save, in the order the game plays them. Open a position to reorder it —
          drag, or use the arrows. Nothing is written until you commit.
        </p>
        {dirty ? (
          <div className="row" style={{ gap: 10, marginTop: 12, alignItems: 'center' }}>
            <Meta color="var(--warn)">
              {dirty} POSITION{dirty === 1 ? '' : 'S'} CHANGED — NOTHING WRITTEN YET
            </Meta>
            <Btn variant="primary" disabled={busy} onClick={commit}>
              {busy ? 'Writing…' : 'Commit to the save'}
            </Btn>
            <Btn onClick={() => setEdits({})}>Discard</Btn>
          </div>
        ) : null}
      </Card>

      <div className="gs-tiles" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {shown.map((s) => {
          const rows = rowsOf(s.i)
          const isOpen = open === s.i
          const changed = edits[s.i] !== undefined
          return (
            <Card key={s.i} className="card-pad" style={changed ? { borderColor: 'var(--accent)' } : undefined}>
              <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                <Meta size={9} color={changed ? 'var(--accent)' : undefined}>{s.name.toUpperCase()}</Meta>
                <span style={{ marginLeft: 'auto' }}><Meta size={9} color="var(--ink4)">{s.abbr}</Meta></span>
              </div>
              {rows.length === 0 ? (
                <Meta size={10} color="var(--ink4)">NOBODY</Meta>
              ) : (
                (isOpen ? rows : rows.slice(0, 1)).map((row, k) => {
                  const p = byRow.get(row)
                  return (
                    <div
                      key={row}
                      className="row"
                      draggable={isOpen}
                      onDragStart={() => setDrag({ slot: s.i, from: k })}
                      onDragOver={(e) => { if (drag?.slot === s.i) e.preventDefault() }}
                      onDrop={() => { if (drag?.slot === s.i) move(s.i, drag.from, k); setDrag(null) }}
                      style={{
                        gap: 9, alignItems: 'center', marginTop: 8,
                        cursor: isOpen ? 'grab' : undefined,
                        opacity: drag?.slot === s.i && drag.from === k ? 0.4 : 1,
                      }}
                    >
                      <Meta size={9} color="var(--ink4)">{k + 1}</Meta>
                      <PlayerFace
                        first={p?.first ?? ''} last={p?.last ?? ''} size={26}
                        file={p ? save.facePaths[p.assetId] : undefined}
                      />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p ? `${p.first} ${p.last}` : `row ${row}`}
                      </span>
                      <Meta size={9} color="var(--ink3)">{p?.position}</Meta>
                      <span className="num" style={{ fontSize: 13, color: 'var(--ink)' }}>{p?.overall}</span>
                      {isOpen ? (
                        <span className="row" style={{ gap: 2 }}>
                          <button className="meta" aria-label="Up" disabled={k === 0}
                            onClick={() => move(s.i, k, k - 1)}
                            style={{ color: k === 0 ? 'var(--ink4)' : 'var(--accent)' }}>↑</button>
                          <button className="meta" aria-label="Down" disabled={k === rows.length - 1}
                            onClick={() => move(s.i, k, k + 1)}
                            style={{ color: k === rows.length - 1 ? 'var(--ink4)' : 'var(--accent)' }}>↓</button>
                        </span>
                      ) : null}
                    </div>
                  )
                })
              )}
              {rows.length > 1 ? (
                <button className="meta" onClick={() => setOpen(isOpen ? null : s.i)}
                  style={{ marginTop: 9, color: 'var(--ink3)' }}>
                  {isOpen ? 'HIDE ▲' : `+${rows.length - 1} ▾`}
                </button>
              ) : null}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
