import { useMemo, useState } from 'react'
import { useDynasty } from '../store'
import type { Prospect, Stage } from '../model'
import { interestFor, STAGES, stageColor, starText } from '../logic'
import {
  Btn, Card, Chip, Empty, Input, Meta, Portrait, SchoolBadge, SectionHeader, Tab,
} from '../ui'

const TABS = ['MY BOARD', 'PLAYER RANKINGS', 'TEAM RANKINGS', 'PROGRAM STATS'] as const
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P']

export default function Recruit() {
  const { dynasty, state, dispatch, d } = useDynasty()
  const [tab, setTab] = useState<(typeof TABS)[number]>('MY BOARD')
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [stars, setStars] = useState<number[]>([])
  const [pos, setPos] = useState<string[]>([])
  const [ovrRange, setOvrRange] = useState<[number, number] | null>(null)
  const [onlyInterested, setOnlyInterested] = useState(false)

  const me = dynasty.meta.userTeamId
  const board = useMemo(
    () => state.board.map((id) => d.prospectsById.get(id)).filter((p): p is Prospect => !!p),
    [state.board, d.prospectsById],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return d.prospects.filter((p) => {
      if (q && !`${p.name} ${p.town} ${p.state} ${p.pipeline}`.toLowerCase().includes(q)) return false
      if (stars.length && !stars.includes(p.stars)) return false
      if (pos.length && !pos.includes(p.pos)) return false
      // An OVR filter only makes sense against ratings the staff can actually
      // see, so hidden-OVR prospects drop out while it is active.
      if (ovrRange && (!p.ovrRevealed || p.ovr < ovrRange[0] || p.ovr > ovrRange[1])) return false
      if (onlyInterested && !interestFor(p, me)?.inRange) return false
      return true
    })
  }, [d.prospects, query, stars, pos, ovrRange, onlyInterested, me])

  const queueStage = (p: Prospect, stage: Stage) => {
    dispatch({ type: 'prospect/patch', id: p.id, patch: { stage } })
    dispatch({
      type: 'queue/add',
      item: {
        type: 'RECRUIT',
        title: `${p.name} — ${stage}`,
        detail: `Commitment stage ${p.stage} → ${stage}`,
        origin: 'desktop',
        apply: { kind: 'stage', prospectId: p.id, stage },
      },
    })
  }

  const sel = selected ? d.prospectsById.get(selected) : null

  return (
    <>
      <SectionHeader
        title="Recruiting"
        sub={<Meta>CLASS OF {dynasty.meta.season + 1} · {board.length} ON BOARD · {d.prospects.length} IN POOL</Meta>}
        right={
          <div className="subtabs">
            {TABS.map((t) => <Tab key={t} on={tab === t} onClick={() => setTab(t)}>{t}</Tab>)}
          </div>
        }
      />

      {tab === 'MY BOARD' ? (
        <div className="col" style={{ gap: 8, maxWidth: 820 }}>
          {board.length === 0 ? <Card className="card-pad"><Empty>add prospects from player rankings</Empty></Card> : null}
          {board.map((p) => {
            const interest = interestFor(p, me)
            const committed = ['SOFT COMMIT', 'COMMITTED', 'HARD COMMIT', 'SIGNED'].includes(p.stage)
            const open = selected === p.id
            return (
              <Card key={p.id} className="card-pad">
                <div className="row" style={{ gap: 11 }}>
                  <Portrait name={p.name} size={40} />
                  <div className="col" style={{ flex: 1, gap: 3, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="row-title" style={{ color: 'var(--ink)' }}>{p.name}</span>
                      <Meta size={10}>{p.pos} · #{p.natlRank} NATL</Meta>
                      <span style={{ color: 'var(--accent)', fontSize: 10 }}>{starText(p.stars)}</span>
                      {d.queuedProspectIds.has(p.id) ? (
                        <Meta size={9} color="var(--warn)">● QUEUED</Meta>
                      ) : null}
                    </div>
                    {interest ? (
                      <span className="mono" style={{ fontSize: 9, letterSpacing: 1, fontWeight: 600, color: interest.color }}>
                        {interest.text}
                      </span>
                    ) : null}
                  </div>

                  {/* The recruit's own board order — left is their #1. */}
                  <div className="row" style={{ gap: 4 }}>
                    {(committed ? p.topSchools.slice(0, 1) : p.topSchools.slice(0, 3)).map((s) => (
                      <SchoolBadge key={s} teamId={s} size={22} />
                    ))}
                  </div>

                  <button
                    className="pill"
                    style={{ color: stageColor(p.stage) }}
                    onClick={() => setSelected(open ? null : p.id)}
                  >
                    {p.stage}
                  </button>
                  <Btn size="sm" onClick={() => dispatch({ type: 'board/toggle', id: p.id })}>− Remove</Btn>
                </div>

                {open ? (
                  <div className="col" style={{ gap: 9, marginTop: 12, paddingTop: 11, borderTop: '1px solid var(--line)' }}>
                    <Meta size={9}>COMMITMENT STAGE — CHANGES QUEUE FOR THE PC AGENT</Meta>
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      {STAGES.map((s) => (
                        <Chip key={s} accent on={p.stage === s} onClick={() => queueStage(p, s)}>{s}</Chip>
                      ))}
                    </div>
                    <Meta size={9}>THEIR TOP SCHOOLS — IN THEIR ORDER</Meta>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      {p.topSchools.map((s, i) => (
                        <span key={s} className="row" style={{ gap: 6 }}>
                          <Meta size={9}>#{i + 1}</Meta>
                          <SchoolBadge teamId={s} size={22} />
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </Card>
            )
          })}
        </div>
      ) : null}

      {tab === 'PLAYER RANKINGS' ? (
        <div className="rail">
          <div className="col" style={{ gap: 10, minWidth: 0 }}>
            <Input
              placeholder="SEARCH NAME, TOWN, STATE, PIPELINE"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {[5, 4, 3, 2, 1].map((s) => (
                <Chip key={s} on={stars.includes(s)} onClick={() => setStars((v) => v.includes(s) ? v.filter((x) => x !== s) : [...v, s])}>
                  {s}★
                </Chip>
              ))}
              <span style={{ width: 10 }} />
              {POSITIONS.map((p) => (
                <Chip key={p} on={pos.includes(p)} onClick={() => setPos((v) => v.includes(p) ? v.filter((x) => x !== p) : [...v, p])}>
                  {p}
                </Chip>
              ))}
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <Chip on={!!ovrRange} onClick={() => setOvrRange(ovrRange ? null : [80, 99])}>
                OVR 80+ (revealed only)
              </Chip>
              <Chip on={onlyInterested} onClick={() => setOnlyInterested((v) => !v)}>
                Interested in me
              </Chip>
              {(stars.length || pos.length || ovrRange || onlyInterested || query) ? (
                <Chip onClick={() => { setStars([]); setPos([]); setOvrRange(null); setOnlyInterested(false); setQuery('') }}>
                  ✕ Reset
                </Chip>
              ) : null}
              <span className="spacer" />
              <Meta size={9.5}>{filtered.length.toLocaleString()} RESULTS</Meta>
            </div>

            <Card style={{ overflow: 'hidden' }}>
              {/* The pool runs past 3,000, so only the visible window renders. */}
              <div style={{ maxHeight: 560, overflowY: 'auto' }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }}>#</th>
                      <th>Prospect</th>
                      <th style={{ width: 44 }}>OVR</th>
                      <th style={{ width: 40 }}>Pos</th>
                      <th style={{ width: 44 }}>St</th>
                      <th>Archetype</th>
                      <th>Town</th>
                      <th style={{ width: 44 }}>State</th>
                      <th>Pipeline</th>
                      <th style={{ width: 96 }}>Stage</th>
                      <th style={{ width: 74 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 200).map((p) => {
                      const onBoard = state.board.includes(p.id)
                      return (
                        <tr key={p.id} aria-selected={selected === p.id} onClick={() => setSelected(p.id)}>
                          <td className="num" style={{ color: 'var(--ink4)' }}>{p.natlRank}</td>
                          <td>
                            <span className="row" style={{ gap: 8 }}>
                              <Portrait name={p.name} size={22} />
                              <span className="col">
                                <span className="row-title" style={{ fontSize: 13, color: 'var(--ink)' }}>{p.name}</span>
                                <span style={{ color: 'var(--accent)', fontSize: 8.5 }}>{starText(p.stars)}</span>
                              </span>
                            </span>
                          </td>
                          <td className="num" style={{ color: p.ovrRevealed ? 'var(--ink)' : 'var(--ink4)' }}>
                            {p.ovrRevealed ? p.ovr : '—'}
                          </td>
                          <td className="num">{p.pos}</td>
                          <td className="num" style={{ color: 'var(--ink4)' }}>{p.stateRank}</td>
                          <td><Meta size={10}>{p.archetype}</Meta></td>
                          <td><Meta size={10}>{p.town}</Meta></td>
                          <td className="num" style={{ color: 'var(--ink3)' }}>{p.state}</td>
                          <td><Meta size={10}>{p.pipeline}</Meta></td>
                          <td>
                            <span className="pill" style={{ color: stageColor(p.stage), fontSize: 8.5 }}>{p.stage}</span>
                          </td>
                          <td>
                            <Btn
                              size="sm"
                              variant={onBoard ? 'primary' : 'secondary'}
                              onClick={(e) => { e.stopPropagation(); dispatch({ type: 'board/toggle', id: p.id }) }}
                            >
                              {onBoard ? '✓ Board' : '+ Add'}
                            </Btn>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {filtered.length > 200 ? (
                  <div className="card-pad"><Meta size={9.5}>SHOWING FIRST 200 OF {filtered.length.toLocaleString()} — NARROW THE FILTERS</Meta></div>
                ) : null}
              </div>
            </Card>
          </div>

          {/* Right rail: the full prospect editor. */}
          <Card className="card-pad" style={{ position: 'sticky', top: 0 }}>
            {!sel ? <Empty>select a prospect to edit</Empty> : (
              <div className="col" style={{ gap: 11 }}>
                <div className="row" style={{ gap: 11 }}>
                  <Portrait name={sel.name} size={46} />
                  <div className="col">
                    <span className="hero-headline">{sel.name}</span>
                    <Meta size={10}>{sel.pos} · {sel.height} · {sel.weight} lb · {sel.town}, {sel.state}</Meta>
                  </div>
                </div>

                <div className="grid-3" style={{ gap: 8 }}>
                  <div><Meta size={9}>NATL</Meta><div className="num" style={{ fontSize: 16, color: 'var(--ink)' }}>#{sel.natlRank}</div></div>
                  <div><Meta size={9}>POS</Meta><div className="num" style={{ fontSize: 16, color: 'var(--ink)' }}>#{sel.posRank}</div></div>
                  <div><Meta size={9}>STATE</Meta><div className="num" style={{ fontSize: 16, color: 'var(--ink)' }}>#{sel.stateRank}</div></div>
                </div>

                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <Meta size={9}>OVERALL {sel.ovrRevealed ? '' : '(HIDDEN)'}</Meta>
                  <span className="num" style={{ fontSize: 18, fontWeight: 600, color: sel.ovrRevealed ? 'var(--ink)' : 'var(--ink4)' }}>
                    {sel.ovrRevealed ? sel.ovr : '—'}
                  </span>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <Btn size="sm" onClick={() => dispatch({ type: 'prospect/patch', id: sel.id, patch: { ovrRevealed: !sel.ovrRevealed } })}>
                    {sel.ovrRevealed ? 'Hide rating' : 'Reveal rating'}
                  </Btn>
                  <Btn size="sm" onClick={() => dispatch({ type: 'board/toggle', id: sel.id })}>
                    {state.board.includes(sel.id) ? '− Remove from board' : '+ Add to board'}
                  </Btn>
                </div>

                <div><Meta size={9}>ARCHETYPE</Meta><div className="body-serif">{sel.archetype}</div></div>
                <div className="row" style={{ gap: 18 }}>
                  <div><Meta size={9}>COMMIT POINTS</Meta><div className="num" style={{ color: 'var(--ink)' }}>{sel.commitPoints}</div></div>
                  <div><Meta size={9}>NIL</Meta><div className="num" style={{ color: 'var(--ink)' }}>{sel.nil.toLocaleString()}</div></div>
                  <div><Meta size={9}>PIPELINE</Meta><div className="num" style={{ color: 'var(--ink)' }}>{sel.pipeline}</div></div>
                </div>

                <div className="col" style={{ gap: 6 }}>
                  <Meta size={9}>STAGE — QUEUES A SAVE WRITE</Meta>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {STAGES.map((s) => (
                      <Chip key={s} accent on={sel.stage === s} onClick={() => queueStage(sel, s)}>{s}</Chip>
                    ))}
                  </div>
                </div>

                <div className="col" style={{ gap: 6 }}>
                  <Meta size={9}>TOP SCHOOLS — THEIR ORDER</Meta>
                  {sel.topSchools.map((s, i) => (
                    <div
                      key={s}
                      className="row"
                      style={{
                        gap: 8, padding: '5px 8px', borderRadius: 4,
                        border: s === me ? '1px solid var(--accent)' : '1px solid var(--line)',
                      }}
                    >
                      <Meta size={9}>#{i + 1}</Meta>
                      <SchoolBadge teamId={s} size={20} />
                      <span className="row-title" style={{ flex: 1, fontSize: 13 }}>{d.teamsById.get(s)?.name}</span>
                      <button
                        className="meta"
                        onClick={() => {
                          const next = sel.topSchools.filter((x) => x !== s)
                          dispatch({ type: 'prospect/patch', id: sel.id, patch: { topSchools: next } })
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {!sel.topSchools.includes(me) ? (
                    <Btn
                      size="sm"
                      onClick={() => dispatch({
                        type: 'prospect/patch', id: sel.id,
                        patch: { topSchools: [...sel.topSchools, me] },
                      })}
                    >
                      + Add my program
                    </Btn>
                  ) : null}
                </div>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'TEAM RANKINGS' ? (
        <Card style={{ maxWidth: 720, overflow: 'hidden' }}>
          <table className="tbl">
            <thead><tr><th style={{ width: 46 }}>Rank</th><th>School</th><th style={{ width: 80 }}>Commits</th><th style={{ width: 90 }}>Points</th></tr></thead>
            <tbody>
              {dynasty.teams.slice().sort((a, b) => b.prestige - a.prestige).map((t, i) => (
                <tr key={t.id} aria-selected={t.isUser}>
                  <td className="num" style={{ color: t.isUser ? 'var(--accent)' : 'var(--ink3)' }}>{i + 1}</td>
                  <td><span className="row" style={{ gap: 8 }}><SchoolBadge teamId={t.id} size={20} /><span className="row-title">{t.name}</span></span></td>
                  <td className="num">{10 + ((t.prestige * 3) % 14)}</td>
                  <td className="num" style={{ color: 'var(--ink)' }}>{(t.prestige * 271 + 900).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {tab === 'PROGRAM STATS' ? (
        <div className="grid-3" style={{ maxWidth: 900 }}>
          {[
            { label: 'ON BOARD', value: board.length },
            { label: 'COMMITTED TO YOU', value: board.filter((p) => interestFor(p, me)?.text.startsWith('COMMITTED TO YOU')).length },
            { label: 'INSIDE THEIR CUT', value: board.filter((p) => interestFor(p, me)?.inRange).length },
            { label: '5★ ON BOARD', value: board.filter((p) => p.stars === 5).length },
            { label: 'AVG NATL RANK', value: board.length ? Math.round(board.reduce((s, p) => s + p.natlRank, 0) / board.length) : '—' },
            { label: 'CLASS POINTS', value: board.reduce((s, p) => s + p.commitPoints, 0).toLocaleString() },
          ].map((s) => <Card key={s.label} className="card-pad"><Meta size={9}>{s.label}</Meta><div className="serif" style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)', marginTop: 3 }}>{s.value}</div></Card>)}
        </div>
      ) : null}
    </>
  )
}
