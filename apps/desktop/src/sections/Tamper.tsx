import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Convo } from '../model'
import {
  PROMISES, ROLES, TALKING_POINTS, newConvo, nilVerdict, scoreExchange, standing,
} from '../logic'
import {
  Btn, Card, Chip, Empty, Input, Kicker, Meta, Portrait, SchoolBadge, SectionHeader, Stepper, Track,
} from '../ui'

export default function Tamper() {
  const { dynasty, state, dispatch, d, sem } = useStore()
  const [target, setTarget] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [teamFilter, setTeamFilter] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)

  const locked = state.week < sem.tamper.opensWeek
  const weeksOut = sem.tamper.opensWeek - state.week

  const targets = useMemo(() => {
    const q = query.trim().toLowerCase()
    return d.players
      .filter((p) => p.teamId !== dynasty.meta.userTeamId)
      .filter((p) => !teamFilter || p.teamId === teamFilter)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 60)
  }, [d.players, dynasty.meta.userTeamId, teamFilter, query])

  const player = target ? d.playersById.get(target) ?? null : null
  const convo = player ? state.convos[player.id] ?? newConvo(player) : null

  const update = (next: Convo) => dispatch({ type: 'convo/set', playerId: next.playerId, convo: next })

  const send = (text: string) => {
    if (!player || !convo || !text.trim() || convo.status !== 'open') return
    const withMine: Convo = {
      ...convo,
      messages: [...convo.messages, { from: 'me', text, at: Date.now() }],
    }
    update(withMine)
    setDraft('')
    setThinking(true)

    // The relay's model writes the reply in a wired-up install; scoring the
    // exchange locally keeps the section usable with the server off.
    setTimeout(() => {
      const res = scoreExchange(player, withMine, text)
      const interest = Math.max(0, Math.min(100, withMine.interest + res.interestDelta))
      update({
        ...withMine,
        contacted: true,
        interest,
        status: res.burned ? 'burned' : withMine.status,
        messages: [
          ...withMine.messages,
          res.reply,
          { from: 'system', text: res.note, at: Date.now() },
        ],
      })
      dispatch({ type: 'heat', delta: res.heatDelta })
      if (res.burned) {
        dispatch({
          type: 'recap',
          gameId: `compliance-${player.id}`,
          story: {
            id: `compliance-${player.id}`,
            kicker: 'Compliance',
            week: state.week,
            time: new Date().toISOString().slice(11, 16),
            headline: `${player.name} reported contact from your staff`,
            body: `The ${d.teamsById.get(player.teamId)?.name} ${player.pos} turned over his messages. A pending penalty is attached until the program responds.`,
            effect: { label: 'Program +12 Heat · pending penalty', targets: [] },
            status: 'open',
            media: [],
          },
        })
      }
      setThinking(false)
    }, 700)
  }

  return (
    <>
      <SectionHeader
        title="Tampering"
        sub={
          locked ? (
            <Meta color="var(--warn)">TAMPERING OPENS WEEK {sem.tamper.opensWeek} — {weeksOut} WEEK(S) OUT</Meta>
          ) : (
            <Meta color="var(--accent)">CONTACT IS LOGGED AND CARRIES REAL HEAT</Meta>
          )
        }
        right={
          <div className="row" style={{ gap: 10 }}>
            <Meta size={9}>WEEK</Meta>
            <Stepper value={state.week} min={1} max={15} onChange={(v) => dispatch({ type: 'week', week: v })} />
          </div>
        }
      />

      {locked ? (
        <Card className="card-pad" style={{ maxWidth: 620, borderColor: 'var(--warn)' }}>
          <Kicker color="var(--warn)">Window closed</Kicker>
          <div className="body-serif" style={{ marginTop: 6 }}>
            Contact is locked until regular-season week {sem.tamper.opensWeek}. The target list is visible so you
            can build it now, but nothing sends.
          </div>
          <div style={{ marginTop: 11 }}>
            <Track value={state.week} max={sem.tamper.opensWeek} fill="var(--warn)" height={5} />
          </div>
        </Card>
      ) : null}

      <div className="rail-wide" style={{ marginTop: locked ? 14 : 0 }}>
        <Card style={{ overflow: 'hidden' }}>
          <div className="card-pad col" style={{ gap: 8, borderBottom: '1px solid var(--line)' }}>
            <Input placeholder="SEARCH TARGETS" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <Chip on={!teamFilter} onClick={() => setTeamFilter(null)}>All teams</Chip>
              {dynasty.teams.filter((t) => !t.isUser).slice(0, 8).map((t) => (
                <Chip key={t.id} on={teamFilter === t.id} onClick={() => setTeamFilter(t.id)}>{t.abbr}</Chip>
              ))}
            </div>
          </div>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr><th style={{ width: 44 }}>OVR</th><th>Player</th><th style={{ width: 58 }}>Depth</th><th style={{ width: 74 }}>Interest</th><th style={{ width: 84 }} /></tr>
              </thead>
              <tbody>
                {targets.map((p) => {
                  const c = state.convos[p.id]
                  return (
                    <tr key={p.id} aria-selected={target === p.id} onClick={() => setTarget(p.id)}>
                      <td className="num" style={{ fontWeight: 600, color: p.ovr >= 90 ? 'var(--warn)' : 'var(--ink2)' }}>{p.ovr}</td>
                      <td>
                        <span className="row" style={{ gap: 8 }}>
                          <Portrait name={p.name} size={24} />
                          <span className="col">
                            <span className="row-title" style={{ fontSize: 13, color: 'var(--ink)' }}>{p.name}</span>
                            <span className="row" style={{ gap: 5 }}>
                              <SchoolBadge teamId={p.teamId} size={14} />
                              <Meta size={9}>{p.pos}</Meta>
                            </span>
                          </span>
                        </span>
                      </td>
                      {/* Buried players are the receptive ones, so depth > 1 is highlighted. */}
                      <td className="num" style={{ color: p.depth > 1 ? 'var(--warn)' : 'var(--ink3)' }}>{p.pos}#{p.depth}</td>
                      <td className="num" style={{ color: c ? 'var(--ink)' : 'var(--ink4)' }}>{c ? c.interest : '—'}</td>
                      <td>
                        <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1, fontWeight: 600, color: c?.status === 'burned' ? 'var(--ink4)' : c ? 'var(--ink2)' : 'var(--accent)' }}>
                          {c?.status === 'burned' ? 'BURNED' : c ? 'OPEN' : '✆ TEXT'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="col" style={{ gap: 12, position: 'sticky', top: 0 }}>
          {!player || !convo ? (
            <Card className="card-pad"><Empty>pick a target to open a conversation</Empty></Card>
          ) : (
            <>
              <Card className="card-pad">
                <div className="row" style={{ gap: 11 }}>
                  <Portrait name={player.name} size={52} />
                  <div className="col" style={{ flex: 1 }}>
                    <span className="hero-headline">{player.name}</span>
                    <Meta size={10}>
                      {player.pos}#{player.depth} · {d.teamsById.get(player.teamId)?.name} · {player.ovr} OVR
                    </Meta>
                  </div>
                  <span className="pill" style={{ color: standing(convo.interest).color }}>
                    {standing(convo.interest).text}
                  </span>
                </div>

                <div className="effect" style={{ marginTop: 11 }}>
                  DEALBREAKER · {player.dealbreaker.toUpperCase()}
                </div>

                <div className="row" style={{ gap: 16, marginTop: 12 }}>
                  <div className="col" style={{ flex: 1, gap: 4 }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <Meta size={9}>INTEREST</Meta>
                      <span className="num" style={{ fontWeight: 600, color: convo.interest >= 70 ? 'var(--good)' : convo.interest >= 35 ? 'var(--warn)' : 'var(--ink3)' }}>
                        {convo.interest}
                      </span>
                    </div>
                    <Track
                      value={convo.interest}
                      fill={convo.interest >= 70 ? 'var(--good)' : convo.interest >= 35 ? 'var(--warn)' : 'var(--ink4)'}
                    />
                  </div>
                  <div className="col" style={{ width: 90, gap: 4 }}>
                    <Meta size={9}>PROGRAM HEAT</Meta>
                    <span className="num" style={{ fontWeight: 600, fontSize: 17, color: state.heat >= sem.heat.threshold ? 'var(--accent)' : 'var(--ink)' }}>
                      {state.heat}
                    </span>
                  </div>
                </div>
              </Card>

              <Card className="card-pad">
                <Kicker>The offer</Kicker>
                <div className="col" style={{ gap: 9, marginTop: 9 }}>
                  <Meta size={9}>ROLE PROMISE</Meta>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {ROLES.map((rl) => (
                      <Chip key={rl} accent on={convo.role === rl} onClick={() => update({ ...convo, role: rl })}>{rl}</Chip>
                    ))}
                  </div>

                  <Meta size={9}>PROMISES</Meta>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {PROMISES.map((pr) => (
                      <Chip
                        key={pr}
                        on={convo.promises.includes(pr)}
                        onClick={() => update({
                          ...convo,
                          promises: convo.promises.includes(pr)
                            ? convo.promises.filter((x) => x !== pr)
                            : [...convo.promises, pr],
                        })}
                      >
                        {pr}
                      </Chip>
                    ))}
                  </div>

                  <div className="row" style={{ justifyContent: 'space-between', marginTop: 3 }}>
                    <div className="col">
                      <Meta size={9}>NIL — HIS NUMBER IS {player.nil.toLocaleString()}</Meta>
                      <span className="mono" style={{ fontWeight: 600, fontSize: 10, letterSpacing: 1.3, color: nilVerdict(convo.nilOffer, player.nil).color }}>
                        {nilVerdict(convo.nilOffer, player.nil).text}
                      </span>
                    </div>
                    <Stepper
                      value={convo.nilOffer}
                      min={0}
                      max={400000}
                      step={2500}
                      onChange={(v) => update({ ...convo, nilOffer: v })}
                    />
                  </div>
                  <Track
                    value={convo.nilOffer}
                    max={Math.max(player.nil * 2, 1)}
                    fill={nilVerdict(convo.nilOffer, player.nil).color}
                  />
                </div>
              </Card>

              <Card style={{ overflow: 'hidden' }}>
                <div className="card-pad col" style={{ gap: 9, maxHeight: 300, overflowY: 'auto' }}>
                  {convo.messages.length === 0 ? <Empty>no messages yet</Empty> : null}
                  {convo.messages.map((m, i) =>
                    m.from === 'system' ? (
                      <div key={i} className="meta" style={{ fontSize: 9.5, color: 'var(--ink4)', textAlign: 'center' }}>{m.text}</div>
                    ) : (
                      <div key={i} className="row" style={{ justifyContent: m.from === 'me' ? 'flex-end' : 'flex-start' }}>
                        <span className={m.from === 'me' ? 'bubble bubble-me' : 'bubble bubble-them'}>{m.text}</span>
                      </div>
                    ),
                  )}
                  {thinking ? <div className="meta" style={{ fontSize: 9.5, color: 'var(--warn)', textAlign: 'center' }}>SCORING YOUR CALL…</div> : null}
                </div>

                <div className="card-pad col" style={{ gap: 8, borderTop: '1px solid var(--line)' }}>
                  {convo.status === 'burned' ? (
                    <Meta color="var(--accent)">HE REPORTED THE CONTACT — THIS LINE IS DEAD</Meta>
                  ) : (
                    <>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        {TALKING_POINTS.map((t) => (
                          <Chip key={t} disabled={locked || thinking} onClick={() => send(t)}>{t}</Chip>
                        ))}
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <Input
                          placeholder={locked ? 'LOCKED UNTIL WEEK 11' : 'SAY SOMETHING'}
                          value={draft}
                          disabled={locked || thinking}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') send(draft) }}
                        />
                        <Btn variant="primary" disabled={locked || thinking || !draft.trim()} onClick={() => send(draft)}>Send</Btn>
                      </div>
                      {convo.interest >= sem.tamper.pledgeInterest ? (
                        <Btn
                          variant="accent"
                          style={{ width: '100%' }}
                          onClick={() => {
                            update({ ...convo, status: 'pledged' })
                            dispatch({
                              type: 'queue/add',
                              item: {
                                type: 'PORTAL',
                                title: `${player.name} — portal commitment`,
                                detail: `${convo.role} · NIL ${convo.nilOffer.toLocaleString()} · from ${d.teamsById.get(player.teamId)?.name}`,
                                origin: 'desktop',
                                apply: { kind: 'noop' },
                              },
                            })
                          }}
                        >
                          Get the pledge — queue portal commitment
                        </Btn>
                      ) : null}
                    </>
                  )}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  )
}
