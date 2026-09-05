import { useMemo, useState } from 'react'
import { useSave } from '../saveStore'
import { useStore } from '../store'
import { Btn, Card, Empty, Kicker, Meta, SectionHeader } from '../ui'
import { TEAM_ID_NAMES } from '../../electron/teamIds'
import { dateLabel, kickoffLabel, weatherName } from '../../electron/gameEnums'
import type { SeasonGame } from '../../electron/saveAnalysis'

const UNASSIGNED = 255

/**
 * The front page.
 *
 * Everything here is read out of the save — the week's result, the record, the
 * best players on the roster, the top of the recruiting board. The one thing
 * that is written rather than read is the lead story, and it is generated on
 * demand from a fact sheet of those same numbers, so it can describe the game
 * but cannot invent one.
 */
export default function WireSave() {
  const { save } = useSave()
  const { state, dispatch } = useStore()
  const roster = save.roster
  const me = state.teamId === null ? null : (state.teamNames[state.teamId] ?? TEAM_ID_NAMES[state.teamId] ?? null)

  const games = roster?.games ?? []
  const mine = useMemo(
    () => games.filter((g) => g.home === me || g.away === me).sort((a, b) => a.week - b.week),
    [games, me],
  )
  const last = [...mine].reverse().find((g) => g.played) ?? null
  const next = mine.find((g) => !g.played) ?? null

  const record = useMemo(() => {
    let w = 0, l = 0
    for (const g of mine) {
      if (!g.played || g.postseason) continue
      const us = g.home === me ? g.homeScore : g.awayScore
      const them = g.home === me ? g.awayScore : g.homeScore
      if (us > them) w++; else if (us < them) l++
    }
    return { w, l }
  }, [mine, me])

  // The rest of the country, for the week they have actually reached.
  const weekGames = useMemo(() => {
    const played = games.filter((g) => g.played && !g.postseason)
    if (!played.length) return []
    const wk = last ? last.week : Math.max(...played.map((g) => g.week))
    return played.filter((g) => g.week === wk && g.home !== me && g.away !== me)
  }, [games, last, me])

  const squad = useMemo(
    () => (roster?.players ?? []).filter((p) => p.team === state.teamId).sort((a, b) => b.overall - a.overall),
    [roster, state.teamId],
  )
  const board = useMemo(
    () => (roster?.players ?? [])
      .filter((p) => p.team === UNASSIGNED && p.recruitFlag && /^Generic_/.test(p.assetId ?? ''))
      .sort((a, b) => b.stars - a.stars || a.last.localeCompare(b.last))
      .slice(0, 6),
    [roster],
  )

  if (!roster) {
    return (
      <>
        <SectionHeader title="Wire" sub={<Meta>NOTHING READ YET</Meta>} />
        <Card className="card-pad">
          <Kicker>Your dynasty</Kicker>
          <p className="body-serif" style={{ marginTop: 7 }}>
            Open Team and read the roster. The whole front page comes out of that one pass —
            the schedule, the scores, the squad and the recruiting board.
          </p>
        </Card>
      </>
    )
  }

  return (
    <>
      <SectionHeader
        title={me ?? 'The Wire'}
        sub={<Meta>{record.w}-{record.l}{next ? ` · NEXT ${(next.home === me ? next.away : next.home) ?? ''} WEEK ${next.week}` : ''}</Meta>}
      />

      <div className="rail-wide">
        <div className="col" style={{ gap: 14 }}>
          {last ? <Lead g={last} team={me} apiKey={state.anthropicKey}
            log={(text, kind) => dispatch({ type: 'log', line: { text, kind: kind ?? 'good' } })} /> : null}

          {weekGames.length ? (
            <Card className="card-pad">
              <div className="card-head"><Kicker>Around the country · week {last?.week ?? ''}</Kicker></div>
              <div className="wire-grid">
                {weekGames.slice(0, 12).map((g) => (
                  <div className="wire-box" key={g.row}>
                    <Side name={g.away} score={g.awayScore} lost={g.awayScore < g.homeScore} />
                    <Side name={g.home} score={g.homeScore} lost={g.homeScore < g.awayScore} />
                    <div className="wire-box-meta">FINAL{g.overtime ? ' / OT' : ''}</div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>

        <div className="col" style={{ gap: 14 }}>
          {next ? (
            <Card className="card-pad">
              <div className="card-head"><Kicker>Next up</Kicker></div>
              <div className="wire-next-team">{(next.home === me ? next.away : next.home) ?? 'TBD'}</div>
              <Meta size={9}>
                {next.home === me ? 'HOME' : 'AWAY'} · WEEK {next.week} · {dateLabel(next.month, next.day)}
              </Meta>
              <div className="row" style={{ gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                {[
                  kickoffLabel(next.kickoff),
                  weatherName(next.weather) ? `${next.temperatureF}°F ${weatherName(next.weather)}` : null,
                ].filter(Boolean).map((t) => <Meta key={t as string} size={9}>{t}</Meta>)}
              </div>
            </Card>
          ) : null}

          {squad.length ? (
            <Card className="card-pad">
              <div className="card-head"><Kicker>Top of the roster</Kicker></div>
              {squad.slice(0, 6).map((p) => (
                <div className="wire-line" key={p.index}>
                  <span className="wire-line-ovr">{p.overall}</span>
                  <span className="wire-line-pos">{p.position}</span>
                  <span className="wire-line-name">{p.first} {p.last}</span>
                  <span className="wire-line-tail">{p.hometown}</span>
                </div>
              ))}
            </Card>
          ) : null}

          {board.length ? (
            <Card className="card-pad">
              <div className="card-head"><Kicker>Recruiting board</Kicker></div>
              {board.map((p) => (
                <div className="wire-line" key={p.index}>
                  <span className="wire-line-stars">{'★'.repeat(p.stars)}</span>
                  <span className="wire-line-pos">{p.position}</span>
                  <span className="wire-line-name">{p.first} {p.last}</span>
                  <span className="wire-line-tail">{p.homeState ?? ''}</span>
                </div>
              ))}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  )
}

function Side({ name, score, lost }: { name: string | null; score: number; lost: boolean }) {
  return (
    <div className={`wire-box-row${lost ? ' is-lost' : ''}`}>
      <span className="wire-box-team">{name}</span>
      <span className="wire-box-score">{score}</span>
    </div>
  )
}

/** The lead: the last result, and a story about it if the user asks for one. */
function Lead({ g, team, apiKey, log }: {
  g: SeasonGame; team: string | null; apiKey: string
  log: (text: string, kind?: 'good' | 'bad') => void
}) {
  const [story, setStory] = useState<{ headline: string; standfirst: string; body: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const home = g.home === team
  const us = home ? g.homeScore : g.awayScore
  const them = home ? g.awayScore : g.homeScore
  const other = (home ? g.away : g.home) ?? 'their opponent'

  const write = async () => {
    setBusy(true); setError(null)
    const res = await window.dcc.writePress({ game: g, kind: 'recap', userTeam: team })
    setBusy(false)
    if (res.ok) { setStory(res.story); log(`wrote a recap for ${g.away} at ${g.home}`) }
    else { setError(res.message); log(res.message, 'bad') }
  }

  return (
    <Card className="card-pad wire-lead">
      <Meta size={9} color={us > them ? 'var(--good)' : 'var(--accent)'}>
        {us > them ? 'WON' : 'LOST'} · WEEK {g.week} · {dateLabel(g.month, g.day)}
      </Meta>
      <h2 className="wire-lead-head">
        {story ? story.headline : `${us}-${them} ${home ? 'over' : 'at'} ${other}`}
      </h2>
      {story ? (
        <>
          <p className="wire-lead-stand">{story.standfirst}</p>
          {story.body.split(/\n+/).map((para, i) => (
            <p key={i} className="body-serif" style={{ margin: '0 0 8px' }}>{para}</p>
          ))}
        </>
      ) : (
        <p className="wire-lead-stand">
          {g.attendance ? `${g.attendance.toLocaleString()} watched it. ` : ''}
          {weatherName(g.weather) ? `${g.temperatureF}°F, ${weatherName(g.weather)?.toLowerCase()}.` : ''}
        </p>
      )}
      <div className="row" style={{ gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
        <Btn size="sm" onClick={write} disabled={busy || !apiKey}>
          {busy ? 'Writing…' : story ? 'Write another' : 'Write the story'}
        </Btn>
        {!apiKey ? <Meta size={9}>ADD AN API KEY IN SETTINGS</Meta> : null}
        {error ? <Meta size={9} color="var(--accent)">{error.toUpperCase()}</Meta> : null}
      </div>
      {!g.played ? <Empty>not played yet</Empty> : null}
    </Card>
  )
}
