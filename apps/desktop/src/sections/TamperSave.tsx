import { useEffect, useMemo, useState } from 'react'
import { useKit, useSave } from '../saveStore'
import { useStore } from '../store'
import { Btn, Card, Chip, Empty, Input, Kicker, Meta, PlayerFace, SchoolArt, SectionHeader, Track } from '../ui'
import { TEAM_ID_NAMES } from '../../electron/teamIds'
import { playerKey } from '../../electron/transfers'
import { TAMPER_OPENS_WEEK } from '../../electron/tamper'
import { UNITS } from '../../electron/positions'
import { currentWeek } from '../../electron/season'
import type { DepthStanding, TamperTarget } from '../../electron/tamper'
import type { TamperThreadView } from '../../electron/preload'
import type { RosterPlayer } from '../../electron/saveAnalysis'

const UNASSIGNED = 255



const ord = (n: number) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th')
const standingOf = (d: DepthStanding | null) =>
  d ? `${d.string}${ord(d.string)} at ${d.slot}` : 'not on the chart'

/**
 * Texting players on other rosters, which you are not allowed to do.
 *
 * It opens in week 11 and it is a conversation, not a form. You send a text, he
 * answers for himself, and how far he moves depends on what he would be giving
 * up: where he sits on their depth chart, how their season is going, and how
 * yours compares. All of that is read out of the save.
 *
 * What DCC keeps is the thread and where you stand in it. Nothing is written to
 * the dynasty file — the portal list and the commit score are not decoded yet —
 * and the screen says so rather than implying otherwise.
 */
export default function TamperSave() {
  const { save, patch } = useSave()
  const { state, dispatch } = useStore()
  const kit = useKit(state.teamNames)
  const { path, roster, rosterBusy } = save

  const [threads, setThreads] = useState<TamperThreadView[]>([])
  const [openKey, setOpenKey] = useState<string | null>(null)
  /** A player picked from the search who has not been texted yet. */
  const [pending, setPending] = useState<RosterPlayer | null>(null)
  const [query, setQuery] = useState('')
  const [unit, setUnit] = useState<string | null>(null)
  /** Hide the starters, who are the hardest calls in the country. */
  const [benched, setBenched] = useState(false)
  /** How many of the list to draw; the country is 11,000 players long. */
  const [limit, setLimit] = useState(60)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [charts, setCharts] = useState<{ block: number; slots: number[][] }[] | null>(null)
  const [slotNames, setSlotNames] = useState<{ abbr: string }[] | null>(null)
  const [moved, setMoved] = useState<Record<string, string>>({})

  const nameOf = (id: number) => state.teamNames[id] ?? TEAM_ID_NAMES[id] ?? `Team ${id}`
  const logoFor = (name: string) =>
    save.schoolArt[`${name}|logoLight`] ?? save.schoolArt[`${name}|icon`] ?? save.schoolArt[`${name}|logoGold`]

  const refresh = async () => setThreads((await window.dcc.tamperThreads()).threads)
  useEffect(() => { void refresh() }, [])

  // The depth chart is what makes a player worth calling, so it is loaded here
  // rather than only on The Program's own chart.
  useEffect(() => {
    if (!path || charts) return
    void window.dcc.depth(path).then((r) => {
      if (r.ok) { setCharts(r.charts); setSlotNames(r.slots) }
    })
  }, [path, charts])

  // Whether a player you talked to actually moved, once the ledger can say so.
  useEffect(() => {
    void window.dcc.transfers().then((v) => {
      const out: Record<string, string> = {}
      for (const m of v.moves) out[m.key] = `${nameOf(m.from)} → ${nameOf(m.to)}`
      setMoved(out)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.roster, state.teamNames])

  const load = async () => {
    if (!path) return
    patch({ rosterBusy: true })
    const res = await window.dcc.roster(path, state.teamId)
    patch({ rosterBusy: false })
    if (res.ok) {
      patch({ roster: { count: res.count, ratingNames: res.ratingNames, unverifiedPairs: res.unverifiedPairs, schools: res.schools, coaches: res.coaches, stores: res.stores, games: res.games, players: res.players, season: res.season, titles: res.titles } })
    }
  }

  const players = useMemo(() => roster?.players ?? [], [roster])
  const games = useMemo(() => roster?.games ?? [], [roster])
  const me = state.teamId
  const myName = me === null ? null : nameOf(me)

  const week = useMemo(() => currentWeek(games, myName), [games, myName])

  /** Every school's record this season, as far as the save shows. */
  const records = useMemo(() => {
    const m = new Map<string, { wins: number; losses: number }>()
    for (const g of games) {
      if (!g.played || g.postseason || !g.home || !g.away) continue
      const homeWon = g.homeScore > g.awayScore
      for (const [n, won] of [[g.home, homeWon], [g.away, !homeWon]] as [string, boolean][]) {
        const r = m.get(n) ?? { wins: 0, losses: 0 }
        if (won) r.wins++; else r.losses++
        m.set(n, r)
      }
    }
    return m
  }, [games])

  /** Average overall per roster, which stands in for how good a program is. */
  const strength = useMemo(() => {
    const sum = new Map<number, { n: number; total: number }>()
    for (const p of players) {
      if (p.team === UNASSIGNED) continue
      const s = sum.get(p.team) ?? { n: 0, total: 0 }
      s.n++; s.total += p.overall
      sum.set(p.team, s)
    }
    const out = new Map<number, number>()
    for (const [id, s] of sum) out.set(id, s.total / s.n)
    return out
  }, [players])

  // The chart region orders teams the way the team table does and the roster by
  // the save's own team id, so a block is matched to a team by whose players are
  // in it — the same way The Program finds yours, run over every block.
  const chartOf = useMemo(() => {
    const out = new Map<number, number[][]>()
    if (!charts) return out
    const byRow = new Map<number, RosterPlayer>()
    for (const p of players) byRow.set(p.index, p)
    for (const c of charts) {
      const count = new Map<number, number>()
      let seen = 0
      for (const rows of c.slots) for (const r of rows) {
        const p = byRow.get(r)
        if (!p || p.team === UNASSIGNED) continue
        seen++
        count.set(p.team, (count.get(p.team) ?? 0) + 1)
      }
      if (!seen) continue
      let top = -1, hits = 0
      for (const [id, n] of count) if (n > hits) { top = id; hits = n }
      if (top >= 0 && hits / seen > 0.9 && !out.has(top)) out.set(top, c.slots)
    }
    return out
  }, [charts, players])

  const depthOf = (p: RosterPlayer): DepthStanding | null => {
    const slots = chartOf.get(p.team)
    if (!slots || !slotNames) return null
    for (let i = 0; i < slots.length; i++) {
      const at = slots[i].indexOf(p.index)
      if (at >= 0) return { slot: slotNames[i]?.abbr ?? `#${i}`, string: at + 1, of: slots[i].length }
    }
    return null
  }

  const targetOf = (p: RosterPlayer): TamperTarget => {
    const team = nameOf(p.team)
    const r = records.get(team) ?? { wins: 0, losses: 0 }
    return {
      first: p.first, last: p.last, position: p.position, overall: p.overall,
      team, depth: depthOf(p),
      teamWins: r.wins, teamLosses: r.losses,
      teamStrength: Math.round(strength.get(p.team) ?? 70),
    }
  }

  const coach = useMemo(() => {
    const r = (myName && records.get(myName)) || { wins: 0, losses: 0 }
    return {
      team: myName ?? 'your program',
      wins: r.wins, losses: r.losses,
      strength: Math.round((me === null ? undefined : strength.get(me)) ?? 70),
    }
  }, [myName, records, strength, me])

  /**
   * Everyone on another roster, best first.
   *
   * The whole country, not just what a search turns up: you rarely know the
   * name of the man you want, only that he is a corner nobody is playing. The
   * search narrows this rather than being the only way in.
   */
  const pool = useMemo(
    () => players
      .filter((p) => p.team !== UNASSIGNED && p.team !== me)
      .sort((a, b) => b.overall - a.overall),
    [players, me],
  )

  const found = useMemo(() => {
    const q = query.trim().toLowerCase()
    const inUnit = unit ? new Set(UNITS.find(([u]) => u === unit)?.[1] ?? []) : null
    return pool.filter((p) =>
      (!q || `${p.first} ${p.last}`.toLowerCase().includes(q) || nameOf(p.team).toLowerCase().includes(q))
      && (!inUnit || inUnit.has(p.position))
      && (!benched || depthOf(p)?.string !== 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, query, unit, benched, chartOf, slotNames, state.teamNames])

  const open = threads.find((t) => t.key === openKey) ?? null

  /** The roster player a thread is about, so a reply can be sent to him again. */
  const playerFor = (t: TamperThreadView) =>
    players.find((p) => p.team !== UNASSIGNED && playerKey(p) === t.key) ?? null

  const send = async (p: RosterPlayer | null) => {
    if (!p || !draft.trim()) return
    setBusy(true); setNote(null)
    const res = await window.dcc.tamperSend({
      key: playerKey(p),
      target: targetOf(p),
      coach,
      message: draft.trim(),
      season: roster?.season ?? null,
      week,
    })
    setBusy(false)
    if (!res.ok) { setNote(res.message); return }
    setDraft('')
    setPending(null)
    setOpenKey(res.thread.key)
    await refresh()
    dispatch({ type: 'log', line: { text: `texted ${p.first} ${p.last} of ${nameOf(p.team)}`, kind: 'info' } })
  }

  if (!roster) {
    return (
      <>
        <SectionHeader title="Tampering" sub={<Meta>ROSTER NOT READ YET</Meta>} />
        <Card className="card-pad" style={{ maxWidth: 620 }}>
          <Kicker>Read the roster first</Kicker>
          <p className="body-serif" style={{ marginTop: 7 }}>
            Tampering needs every other roster and their depth charts, which come out of the save.
          </p>
          <Btn variant="primary" onClick={load} disabled={rosterBusy}>
            {rosterBusy ? 'Reading…' : 'Read the roster'}
          </Btn>
        </Card>
      </>
    )
  }

  const locked = week !== null && week < TAMPER_OPENS_WEEK

  return (
    <>
      <SectionHeader
        title="Tampering"
        sub={<Meta>{locked
          ? `OPENS IN WEEK ${TAMPER_OPENS_WEEK} — YOU ARE ON WEEK ${week}`
          : `${threads.length} CONVERSATION${threads.length === 1 ? '' : 'S'}`}</Meta>}
      />

      <div className="col" style={{ gap: 12, maxWidth: 980 }}>
        <Card className="card-pad">
          <Kicker>What this is</Kicker>
          <p className="body-serif" style={{ marginTop: 7 }}>
            From week {TAMPER_OPENS_WEEK} you can text players on other rosters directly, which the
            rulebook and the game both say you cannot. They answer for themselves. How far one moves
            depends on what he would be giving up — where he sits on their depth chart, how their
            season is going, and how yours compares — and all of that is read out of your save.
          </p>
          <p className="body-serif" style={{ marginTop: 7, color: 'var(--ink3)' }}>
            The replies are written by Claude with your own API key, so they cost what they cost.
            Nothing here is written into your dynasty file: the portal list and the commit score are
            not decoded yet, so DCC keeps where you stand and no more.
          </p>
        </Card>

        {locked ? (
          <Empty>
            Illegal contact opens in week {TAMPER_OPENS_WEEK}. Play on and come back — by then a man
            who has not played all year is thinking about next year too.
          </Empty>
        ) : (
          <>
            {open ? (
              <Card className="card-pad">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <SchoolArt file={logoFor(open.team)} size={22} />
                      <span className="serif" style={{ fontSize: 22 }}>{open.first} {open.last}</span>
                      <Meta>{open.position} · {open.overall} · {open.team}</Meta>
                    </div>
                    <Meta color="var(--ink4)">
                      {open.standing.toUpperCase()}
                      {open.mood ? ` · ${open.mood.toUpperCase()}` : ''}
                      {open.committed ? ' · SAYS HE IS ENTERING' : ''}
                    </Meta>
                    {moved[open.key] ? (
                      <div style={{ marginTop: 4 }}>
                        <Meta color="var(--accent)">HE MOVED — {moved[open.key].toUpperCase()}</Meta>
                      </div>
                    ) : null}
                  </div>
                  <Btn onClick={() => { setOpenKey(null); setDraft(''); setNote(null) }}>Close</Btn>
                </div>

                <div className="row" style={{ gap: 16, marginTop: 12, alignItems: 'flex-start' }}>
                  <span style={{ flex: 1 }}>
                    <Meta>WHERE YOU STAND · {open.interest}</Meta>
                    <Track value={open.interest} fill="var(--accent)" height={5} />
                  </span>
                  <span style={{ flex: 1 }}>
                    <Meta>HOW HARD HE IS TO MOVE · {open.resistance}</Meta>
                    <Track value={open.resistance} fill="var(--ink3)" height={5} />
                  </span>
                </div>
                {open.because.length ? (
                  <div style={{ marginTop: 7 }}>
                    <Meta color="var(--ink4)">{open.because.join(' ')}</Meta>
                  </div>
                ) : null}

                <div className="col" style={{ gap: 8, marginTop: 14 }}>
                  {open.turns.map((t, i) => (
                    <div key={i} style={{ alignSelf: t.from === 'coach' ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                      <div className={t.from === 'coach' ? 'bubble bubble-me' : 'bubble bubble-them'}>
                        {t.text}
                      </div>
                      {t.from === 'player' && t.move ? (
                        <Meta color={t.move > 0 ? 'var(--good)' : 'var(--warn)'}>
                          {t.move > 0 ? `+${t.move}` : t.move}
                        </Meta>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="row" style={{ gap: 8, marginTop: 14 }}>
                  <span style={{ flex: 1 }}>
                    <Input
                      placeholder={`text ${open.first}…`}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void send(playerFor(open)) }}
                    />
                  </span>
                  <Btn variant="primary" onClick={() => send(playerFor(open))} disabled={busy || !playerFor(open)}>
                    {busy ? 'Sending…' : 'Send'}
                  </Btn>
                  <Btn onClick={async () => { await window.dcc.tamperForget(open.key); setOpenKey(null); await refresh() }}>
                    Delete
                  </Btn>
                </div>
                {!playerFor(open) ? (
                  <div style={{ marginTop: 7 }}>
                    <Meta color="var(--warn)">HE IS NOT ON A ROSTER IN THIS SAVE ANY MORE.</Meta>
                  </div>
                ) : null}
                {note ? <div style={{ marginTop: 7 }}><Meta color="var(--warn)">{note}</Meta></div> : null}
              </Card>
            ) : null}

            {pending ? (
              <Card className="card-pad">
                <Kicker>First text to {pending.first} {pending.last}</Kicker>
                <div style={{ marginTop: 4 }}>
                  <Meta color="var(--ink4)">
                    {(() => {
                      const t = targetOf(pending)
                      return `${t.position} · ${t.overall} · ${t.team} ${t.teamWins}-${t.teamLosses} · ${standingOf(t.depth)}`
                    })()}
                  </Meta>
                </div>
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <span style={{ flex: 1 }}>
                    <Input
                      autoFocus
                      placeholder="he has never heard from you before"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void send(pending) }}
                    />
                  </span>
                  <Btn variant="primary" onClick={() => send(pending)} disabled={busy}>
                    {busy ? 'Sending…' : 'Send'}
                  </Btn>
                  <Btn onClick={() => { setPending(null); setDraft(''); setNote(null) }}>Cancel</Btn>
                </div>
                {note ? <div style={{ marginTop: 7 }}><Meta color="var(--warn)">{note}</Meta></div> : null}
              </Card>
            ) : null}

            {threads.length ? (
              <Card className="card-pad">
                <Kicker>Who you are working on</Kicker>
                <div className="col" style={{ gap: 2, marginTop: 9 }}>
                  {threads.map((t) => (
                    <button
                      key={t.key}
                      className="rowbtn"
                      onClick={() => { setOpenKey(t.key); setPending(null); setNote(null); setDraft('') }}
                    >
                      <span className="row" style={{ gap: 8, flex: 1, minWidth: 0 }}>
                        <SchoolArt file={logoFor(t.team)} size={18} />
                        <span style={{ minWidth: 170 }}>{t.first} {t.last}</span>
                        <Meta>{t.position} · {t.overall}</Meta>
                        <Meta color="var(--ink4)">{t.team}</Meta>
                      </span>
                      <span className="row" style={{ gap: 10 }}>
                        {t.committed ? <Meta color="var(--accent)">ENTERING</Meta> : null}
                        {moved[t.key] ? <Meta color="var(--good)">MOVED</Meta> : null}
                        <Meta>{t.standing}</Meta>
                        <span className="num" style={{ width: 28, textAlign: 'right' }}>{t.interest}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </Card>
            ) : null}

            <Card className="card-pad">
              <div className="row" style={{ gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <Kicker>Everyone else in the country</Kicker>
                <Meta color="var(--ink4)">
                  {found.length.toLocaleString()} OF {pool.length.toLocaleString()}, BEST FIRST
                </Meta>
              </div>
              <p className="body-serif" style={{ marginTop: 7 }}>
                Every player on every other roster, strongest first. What you see beside him is
                what he would be giving up.
              </p>
              <Input
                placeholder="search by player or school"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setLimit(60) }}
              />
              <div className="row" style={{ gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
                {UNITS.map(([u]) => (
                  <Chip key={u} on={unit === u} onClick={() => { setUnit(unit === u ? null : u); setLimit(60) }}>{u}</Chip>
                ))}
                <Chip on={benched} onClick={() => { setBenched(!benched); setLimit(60) }}>NOT STARTING</Chip>
              </div>
              {!charts ? (
                <div style={{ marginTop: 8 }}><Meta color="var(--ink4)">READING THE DEPTH CHARTS…</Meta></div>
              ) : null}
              <div className="col" style={{ gap: 2, marginTop: 10 }}>
                {found.slice(0, limit).map((p) => {
                  const d = depthOf(p)
                  const key = playerKey(p)
                  const already = threads.some((t) => t.key === key)
                  return (
                    <button
                      key={p.index}
                      className="rowbtn"
                      onClick={() => {
                        setDraft(''); setNote(null)
                        if (already) { setPending(null); setOpenKey(key) }
                        else { setOpenKey(null); setPending(p) }
                      }}
                    >
                      <span className="row" style={{ gap: 8, flex: 1, minWidth: 0 }}>
                        <PlayerFace file={save.facePaths[p.assetId]} first={p.first} last={p.last} size={24} round
                          {...kit(p.team)} />
                        <span style={{ minWidth: 170 }}>{p.first} {p.last}</span>
                        <Meta>{p.position} · {p.overall}</Meta>
                        <SchoolArt file={logoFor(nameOf(p.team))} size={16} />
                        <Meta color="var(--ink4)">{nameOf(p.team)}</Meta>
                      </span>
                      <span className="row" style={{ gap: 10 }}>
                        {already ? <Meta color="var(--accent)">TALKING</Meta> : null}
                        <Meta color={d && d.string === 1 ? 'var(--ink3)' : 'var(--good)'}>{standingOf(d)}</Meta>
                      </span>
                    </button>
                  )
                })}
                {!found.length ? <Meta color="var(--ink4)">NOBODY MATCHES THAT.</Meta> : null}
                {found.length > limit ? (
                  <div style={{ marginTop: 8 }}>
                    <Btn onClick={() => setLimit(limit + 120)}>
                      Show more — {(found.length - limit).toLocaleString()} left
                    </Btn>
                  </div>
                ) : null}
              </div>
            </Card>
          </>
        )}
      </div>
    </>
  )
}
