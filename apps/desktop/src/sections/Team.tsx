import { useMemo, useState } from 'react'
import { useDynasty } from '../store'
import type { Player, Story } from '../model'
import { ROSTER_LIMIT, countColor, playerValue, tradeVerdict } from '../logic'
import {
  Btn, Card, Chip, Empty, Input, Kicker, Meta, Portrait, SchoolBadge, SectionHeader, Stepper, Tab, Toggle,
} from '../ui'

const TABS = ['SCHEDULE', 'ROSTER', 'DEPTH', 'TRADE', 'TOP 25'] as const
const DEV_TRAITS = ['Normal', 'Impact', 'Star', 'Elite']
const CLASSES = ['FR', 'FR (RS)', 'SO', 'JR', 'SR']
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P']

function TeamPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { dynasty } = useDynasty()
  return (
    <select
      className="input"
      style={{ width: 190, cursor: 'pointer' }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {dynasty.teams.slice().sort((a, b) => a.rank - b.rank).map((t) => (
        <option key={t.id} value={t.id} style={{ background: 'var(--bg1)' }}>
          {t.rank}. {t.name}{t.isUser ? ' (you)' : ''}
        </option>
      ))}
    </select>
  )
}

export default function Team() {
  const { dynasty, state, dispatch, d } = useDynasty()
  const [tab, setTab] = useState<(typeof TABS)[number]>('SCHEDULE')
  const [teamId, setTeamId] = useState(dynasty.meta.userTeamId)
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [posFilter, setPosFilter] = useState('QB')
  const [rosterQuery, setRosterQuery] = useState('')
  const [writing, setWriting] = useState<string | null>(null)

  const team = d.teamsById.get(teamId)!
  const roster = d.rosterOf(teamId)
  const sel = selectedPlayer ? d.playersById.get(selectedPlayer) : null

  const queueRoster = (p: Player, patch: Partial<Player>, detail: string) => {
    dispatch({ type: 'player/patch', id: p.id, patch })
    dispatch({
      type: 'queue/add',
      item: {
        type: 'ROSTER',
        title: `${p.name} — ${team.name}`,
        detail,
        origin: 'desktop',
        apply: patch.ovr != null ? { kind: 'ovr', playerId: p.id, ovr: patch.ovr } : { kind: 'noop' },
      },
    })
  }

  const writeRecap = (gameId: string) => {
    const game = dynasty.schedule.find((g) => g.id === gameId)!
    const opp = d.teamsById.get(game.opponentId)!
    setWriting(gameId)
    // The story engine runs on the home server; the staged wait is the same
    // shape the relay call has, so the UI does not change when it is wired up.
    setTimeout(() => {
      const stars = d.rosterOf(teamId).slice(0, 2)
      const story: Story = {
        id: `recap-${gameId}`,
        kicker: 'Game Recap',
        week: game.week,
        time: '23:04',
        headline: `${game.result === 'W' ? 'Held on' : 'Fell short'} ${game.home ? 'at home' : 'on the road'} against ${opp.name}`,
        body: `${game.score} ${game.home ? '' : 'on the road '}in week ${game.week}. ${stars[0].name} carried the load and ${stars[1].name} was the difference on the other side of the ball. Box score and time-matched captures went to the story engine with this one.`,
        effect: null,
        status: 'open',
        media: [],
      }
      dispatch({ type: 'recap', gameId, story })
      setWriting(null)
    }, 900)
  }

  return (
    <>
      <SectionHeader
        title={team.name}
        sub={
          <div className="row" style={{ gap: 12 }}>
            <Meta>RANK #{team.rank} · {team.wins}–{team.losses} · {team.conference}</Meta>
            <TeamPicker value={teamId} onChange={(id) => { setTeamId(id); setSelectedPlayer(null) }} />
          </div>
        }
        right={<div className="subtabs">{TABS.map((t) => <Tab key={t} on={tab === t} onClick={() => setTab(t)}>{t}</Tab>)}</div>}
      />

      {tab === 'SCHEDULE' ? (
        <Card style={{ maxWidth: 900, overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr><th style={{ width: 46 }}>Wk</th><th>Opponent</th><th>Detail</th><th style={{ width: 110 }}>Result</th><th style={{ width: 150 }}>Story</th></tr>
            </thead>
            <tbody>
              {dynasty.schedule.filter((g) => g.teamId === teamId).map((g) => {
                const opp = d.teamsById.get(g.opponentId)!
                const storyId = state.recaps[g.id] ?? g.storyId
                const color = g.result === 'W' ? 'var(--good)' : g.result === 'L' ? 'var(--accent)' : g.result === 'NEXT' ? 'var(--warn)' : 'var(--ink4)'
                return (
                  <tr key={g.id} style={g.result === 'NEXT' ? { boxShadow: 'inset 0 0 0 1px var(--accent)' } : undefined}>
                    <td className="num" style={{ color: 'var(--ink3)' }}>{g.week}</td>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <SchoolBadge teamId={opp.id} size={22} />
                        <span className="row-title" style={{ color: 'var(--ink)' }}>{opp.name}</span>
                      </span>
                    </td>
                    <td>
                      <Meta size={10}>
                        {g.home ? 'HOME' : 'AWAY'}
                        {g.ranked ? ` · #${opp.rank}` : ''}
                        {g.rivalry ? ' · RIVALRY' : ''} · {g.kickoff}
                      </Meta>
                    </td>
                    <td>
                      <span className="mono" style={{ color, fontWeight: 600, fontSize: 12, letterSpacing: 1 }}>
                        {g.result ?? '—'}
                      </span>
                      {g.score ? <Meta size={10}> {g.score}</Meta> : null}
                    </td>
                    <td>
                      {g.result === 'W' || g.result === 'L' ? (
                        storyId ? (
                          <span className="chip" style={{ color: 'var(--ink3)' }}>Story →</span>
                        ) : writing === g.id ? (
                          <span className="chip" style={{ color: 'var(--warn)' }}>Writing…</span>
                        ) : (
                          <Btn size="sm" onClick={() => writeRecap(g.id)}>✎ Write recap</Btn>
                        )
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      ) : null}

      {tab === 'ROSTER' ? (
        <div className="rail">
          <Card style={{ overflow: 'hidden' }}>
            <div className="card-pad row" style={{ gap: 10, borderBottom: '1px solid var(--line)' }}>
              <Input placeholder="SEARCH ROSTER" value={rosterQuery} onChange={(e) => setRosterQuery(e.target.value)} style={{ width: 220 }} />
              <Meta size={9.5}>{roster.length} / {ROSTER_LIMIT}</Meta>
            </div>
            <div style={{ maxHeight: 560, overflowY: 'auto' }}>
              <table className="tbl">
                <thead><tr><th style={{ width: 48 }}>OVR</th><th>Player</th><th style={{ width: 190 }}>Detail</th><th style={{ width: 90 }} /></tr></thead>
                <tbody>
                  {roster
                    .filter((p) => !rosterQuery || p.name.toLowerCase().includes(rosterQuery.toLowerCase()) || p.pos.toLowerCase() === rosterQuery.toLowerCase())
                    .map((p) => (
                      <tr key={p.id} aria-selected={selectedPlayer === p.id} onClick={() => setSelectedPlayer(p.id)}>
                        <td className="num" style={{ fontWeight: 600, fontSize: 14, color: p.ovr >= 90 ? 'var(--ink)' : 'var(--ink2)' }}>{p.ovr}</td>
                        <td>
                          <span className="row" style={{ gap: 8 }}>
                            <Portrait name={p.name} size={26} />
                            <span className="row-title" style={{ color: 'var(--ink)' }}>{p.name}</span>
                            {d.queuedPlayerIds.has(p.id) ? <Meta size={9} color="var(--warn)">● QUEUED</Meta> : null}
                          </span>
                        </td>
                        <td><Meta size={10}>{p.pos}{p.depth} · {p.year} · {p.dev}{p.redshirt ? ' · RS' : ''}</Meta></td>
                        <td><Meta size={11}>✆</Meta></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="card-pad" style={{ position: 'sticky', top: 0 }}>
            {!sel ? <Empty>select a player to edit</Empty> : (
              <div className="col" style={{ gap: 12 }}>
                <div className="row" style={{ gap: 11 }}>
                  <Portrait name={sel.name} size={46} />
                  <div className="col">
                    <span className="hero-headline">{sel.name}</span>
                    <Meta size={10}>{sel.pos}{sel.depth} · {sel.height} · {sel.weight} lb · {sel.hometown}</Meta>
                  </div>
                </div>

                <div className="col" style={{ gap: 6 }}>
                  <Meta size={9}>OVERALL</Meta>
                  <Stepper value={sel.ovr} min={40} max={99} onChange={(v) => queueRoster(sel, { ovr: v }, `Overall ${sel.ovr} → ${v}`)} />
                </div>

                <div className="col" style={{ gap: 6 }}>
                  <Meta size={9}>DEV TRAIT</Meta>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {DEV_TRAITS.map((t) => (
                      <Chip key={t} accent on={sel.dev === t} onClick={() => queueRoster(sel, { dev: t }, `Dev trait ${sel.dev} → ${t}`)}>{t}</Chip>
                    ))}
                  </div>
                </div>

                <div className="col" style={{ gap: 6 }}>
                  <Meta size={9}>CLASS</Meta>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {CLASSES.map((c) => (
                      <Chip key={c} accent on={sel.year === c} onClick={() => queueRoster(sel, { year: c }, `Class ${sel.year} → ${c}`)}>{c}</Chip>
                    ))}
                  </div>
                </div>

                <div className="col" style={{ gap: 6 }}>
                  <Meta size={9}>POSITION</Meta>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {POSITIONS.map((c) => (
                      <Chip key={c} accent on={sel.pos === c} onClick={() => queueRoster(sel, { pos: c }, `Position ${sel.pos} → ${c}`)}>{c}</Chip>
                    ))}
                  </div>
                </div>

                <Toggle
                  on={sel.redshirt}
                  label={sel.redshirt ? 'REDSHIRTED' : 'NOT REDSHIRTED'}
                  onChange={(v) => queueRoster(sel, { redshirt: v }, v ? 'Redshirt applied' : 'Redshirt removed')}
                />

                <Btn
                  variant="accent"
                  onClick={() => dispatch({
                    type: 'queue/add',
                    item: { type: 'ROSTER', title: `Release ${sel.name}`, detail: `Removed from the ${team.name} roster`, origin: 'desktop', apply: { kind: 'noop' } },
                  })}
                >
                  Release player
                </Btn>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'DEPTH' ? <Depth teamId={teamId} pos={posFilter} setPos={setPosFilter} /> : null}
      {tab === 'TRADE' ? <Trade myTeamId={dynasty.meta.userTeamId} /> : null}

      {tab === 'TOP 25' ? (
        <Card style={{ maxWidth: 640, overflow: 'hidden' }}>
          <table className="tbl">
            <thead><tr><th style={{ width: 46 }}>Rank</th><th>School</th><th style={{ width: 70 }}>Record</th><th style={{ width: 56 }}>Trend</th></tr></thead>
            <tbody>
              {dynasty.teams.slice().sort((a, b) => a.rank - b.rank).map((t) => (
                <tr key={t.id} aria-selected={t.id === teamId} onClick={() => setTeamId(t.id)}>
                  <td className="num" style={{ color: t.isUser ? 'var(--accent)' : 'var(--ink3)' }}>{t.rank}</td>
                  <td>
                    <span className="row" style={{ gap: 8 }}>
                      <SchoolBadge teamId={t.id} size={20} />
                      <span className="row-title" style={{ color: 'var(--ink)' }}>{t.name}</span>
                      {t.isUser ? <Meta size={9} color="var(--accent)">YOU</Meta> : null}
                    </span>
                  </td>
                  <td className="num">{t.wins}–{t.losses}</td>
                  <td style={{ color: t.trend === 'up' ? 'var(--good)' : t.trend === 'down' ? 'var(--accent)' : 'var(--ink4)' }}>
                    {t.trend === 'up' ? '▲' : t.trend === 'down' ? '▼' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </>
  )
}

// ── depth chart ───────────────────────────────────────────────────────────────

function Depth({ teamId, pos, setPos }: { teamId: string; pos: string; setPos: (p: string) => void }) {
  const { dispatch, d } = useDynasty()
  const group = d.depthOf(teamId, pos)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= group.length) return
    const order = group.map((p) => p.id)
    const [moved] = order.splice(from, 1)
    order.splice(to, 0, moved)
    dispatch({ type: 'depth/set', teamId, pos, order })
    dispatch({
      type: 'queue/add',
      item: {
        type: 'DEPTH',
        title: `${pos} depth chart — ${d.teamsById.get(teamId)?.name}`,
        detail: `${d.playersById.get(moved)?.name} → ${pos}${to + 1}`,
        origin: 'desktop',
        apply: { kind: 'depth', teamId, pos, order },
      },
    })
  }

  return (
    <div className="col" style={{ gap: 12, maxWidth: 620 }}>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {POSITIONS.map((p) => <Chip key={p} on={pos === p} onClick={() => setPos(p)}>{p}</Chip>)}
      </div>
      <Card style={{ overflow: 'hidden' }}>
        {group.map((p, i) => (
          <div
            key={p.id}
            className="row card-pad"
            style={{ gap: 11, borderBottom: i < group.length - 1 ? '1px solid var(--line)' : undefined }}
          >
            <span className="mono" style={{ width: 42, fontWeight: 600, fontSize: 11, letterSpacing: 1, color: i === 0 ? 'var(--accent)' : 'var(--ink3)' }}>
              {pos}{i + 1}
            </span>
            <Portrait name={p.name} size={26} />
            <span className="row-title" style={{ flex: 1, color: 'var(--ink)' }}>{p.name}</span>
            <Meta size={10}>{p.year} · {p.dev}</Meta>
            <span className="num" style={{ fontWeight: 600, color: p.ovr >= 90 ? 'var(--ink)' : 'var(--ink2)' }}>{p.ovr}</span>
            <div className="row" style={{ gap: 4 }}>
              <Btn size="sm" disabled={i === 0} onClick={() => move(i, i - 1)}>↑</Btn>
              <Btn size="sm" disabled={i === group.length - 1} onClick={() => move(i, i + 1)}>↓</Btn>
            </div>
          </div>
        ))}
      </Card>
      <Meta size={9.5}>REORDERS QUEUE LIKE ANY OTHER SAVE WRITE AND POST A WIRE STORY ON APPLY</Meta>
    </div>
  )
}

// ── trade ─────────────────────────────────────────────────────────────────────

function TradePanel({ teamId, onPick, picked, projected }: {
  teamId: string; picked: Set<string>; projected: number
  onPick: (p: Player) => void
}) {
  const { d } = useDynasty()
  const team = d.teamsById.get(teamId)!
  const roster = d.rosterOf(teamId)
  return (
    <Card style={{ overflow: 'hidden' }}>
      <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="row-title" style={{ color: 'var(--ink)' }}>{team.name}</span>
          <span className="num" style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--ink3)' }}>{roster.length}/{ROSTER_LIMIT} → </span>
            <span style={{ color: countColor(projected), fontWeight: 600 }}>{projected}</span>
          </span>
        </div>
      </div>
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {roster.slice(0, 40).map((p) => (
          <button
            key={p.id}
            className="row card-pad"
            style={{
              gap: 9, width: '100%', textAlign: 'left', borderBottom: '1px solid var(--line)',
              background: picked.has(p.id) ? 'var(--surface)' : undefined,
              boxShadow: picked.has(p.id) ? 'inset 2px 0 0 var(--accent)' : undefined,
            }}
            onClick={() => onPick(p)}
          >
            <Portrait name={p.name} size={24} />
            <span className="col" style={{ flex: 1, minWidth: 0 }}>
              <span className="row-title" style={{ fontSize: 13, color: 'var(--ink)' }}>{p.name}</span>
              <Meta size={9.5}>{p.pos}{p.depth} · {p.year}</Meta>
            </span>
            <span className="num" style={{ fontWeight: 600, color: p.ovr >= 90 ? 'var(--ink)' : 'var(--ink2)' }}>{p.ovr}</span>
          </button>
        ))}
      </div>
    </Card>
  )
}

function Trade({ myTeamId }: { myTeamId: string }) {
  const { dispatch, d, dynasty } = useDynasty()
  const [otherId, setOtherId] = useState(dynasty.teams.find((t) => !t.isUser)!.id)
  const [mine, setMine] = useState<Set<string>>(new Set())
  const [theirs, setTheirs] = useState<Set<string>>(new Set())

  const minePlayers = useMemo(() => [...mine].map((id) => d.playersById.get(id)!).filter(Boolean), [mine, d])
  const theirPlayers = useMemo(() => [...theirs].map((id) => d.playersById.get(id)!).filter(Boolean), [theirs, d])

  const myCount = d.rosterOf(myTeamId).length
  const theirCount = d.rosterOf(otherId).length
  const myProjected = myCount - minePlayers.length + theirPlayers.length
  const theirProjected = theirCount - theirPlayers.length + minePlayers.length

  const overTeam =
    myProjected > ROSTER_LIMIT ? d.teamsById.get(myTeamId)!
    : theirProjected > ROSTER_LIMIT ? d.teamsById.get(otherId)!
    : null
  const overCount = myProjected > ROSTER_LIMIT ? myProjected : theirProjected
  const empty = minePlayers.length === 0 && theirPlayers.length === 0
  const verdict = tradeVerdict(minePlayers, theirPlayers)

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void) => (p: Player) => {
    const next = new Set(set)
    if (next.has(p.id)) next.delete(p.id)
    else next.add(p.id)
    setter(next)
  }

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 10 }}>
        <Meta size={9}>TRADE PARTNER</Meta>
        <TeamPicker value={otherId} onChange={setOtherId} />
        <span className="spacer" />
        <Btn size="sm" onClick={() => { setMine(new Set()); setTheirs(new Set()) }}>Clear</Btn>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <TradePanel teamId={myTeamId} picked={mine} projected={myProjected} onPick={toggle(mine, setMine)} />
        <TradePanel teamId={otherId} picked={theirs} projected={theirProjected} onPick={toggle(theirs, setTheirs)} />
      </div>

      <Card className="card-pad">
        <Kicker>Trade summary</Kicker>
        <div className="row" style={{ gap: 20, marginTop: 9, alignItems: 'flex-start' }}>
          <div className="col" style={{ flex: 1, gap: 3 }}>
            <Meta size={9}>YOU SEND ({minePlayers.length})</Meta>
            {minePlayers.length === 0 ? <Meta size={10} color="var(--ink4)">nobody</Meta> : null}
            {minePlayers.map((p) => <span key={p.id} className="body-serif">{p.name} · {p.pos} · {p.ovr}</span>)}
          </div>
          <div className="col" style={{ flex: 1, gap: 3 }}>
            <Meta size={9}>YOU RECEIVE ({theirPlayers.length})</Meta>
            {theirPlayers.length === 0 ? <Meta size={10} color="var(--ink4)">nobody</Meta> : null}
            {theirPlayers.map((p) => <span key={p.id} className="body-serif">{p.name} · {p.pos} · {p.ovr}</span>)}
          </div>
        </div>

        <div className="col" style={{ gap: 6, marginTop: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <Meta size={9}>VALUE READ</Meta>
            <span className="mono" style={{ fontWeight: 600, fontSize: 10, letterSpacing: 1.4, color: verdict.color }}>
              {empty ? '—' : verdict.text}
            </span>
          </div>
          <div className="track" style={{ height: 5 }}>
            <div
              className="track-fill"
              style={{ width: `${Math.round(verdict.balance * 100)}%`, background: verdict.color === 'var(--ink2)' ? 'var(--ink3)' : verdict.color }}
            />
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <Meta size={9}>YOU SEND {minePlayers.reduce((s, p) => s + playerValue(p), 0)}</Meta>
            <Meta size={9}>YOU GET {theirPlayers.reduce((s, p) => s + playerValue(p), 0)}</Meta>
          </div>
        </div>

        {/* The 85-man limit is enforced by prevention: an illegal trade has no
            submit path, so there is no failure state to land in. */}
        {overTeam ? (
          <div className="effect" style={{ marginTop: 12 }}>
            {overTeam.name} would carry {overCount} players — {overCount - ROSTER_LIMIT} over the {ROSTER_LIMIT}-man limit.
          </div>
        ) : null}

        <div style={{ marginTop: 12 }}>
          {overTeam ? (
            <Btn variant="dead" style={{ width: '100%' }}>Over the limit — can't queue</Btn>
          ) : (
            <Btn
              variant="primary"
              style={{ width: '100%' }}
              disabled={empty}
              onClick={() => {
                dispatch({
                  type: 'queue/add',
                  item: {
                    type: 'TRADE',
                    title: `${d.teamsById.get(myTeamId)!.name} ⇄ ${d.teamsById.get(otherId)!.name}`,
                    detail: `Send ${minePlayers.map((p) => p.name).join(', ') || 'nobody'} · receive ${theirPlayers.map((p) => p.name).join(', ') || 'nobody'} · post-trade ${myProjected}/${theirProjected}`,
                    origin: 'desktop',
                    apply: { kind: 'noop' },
                  },
                })
                setMine(new Set()); setTheirs(new Set())
              }}
            >
              {empty ? 'Select players' : 'Queue trade'}
            </Btn>
          )}
        </div>
      </Card>
    </div>
  )
}
