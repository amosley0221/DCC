import { useMemo, useState } from 'react'
import { Btn, Card, Chip, Empty, Input, Kicker, Meta, SchoolArt } from '../ui'
import type { SeasonGame } from '../../electron/saveAnalysis'
import { WEATHER, dateLabel, kickoffLabel, weatherName } from '../../electron/gameEnums'

/** Kickoff times the game offers, in minutes after midnight. */
const KICKOFFS = [720, 750, 810, 840, 900, 960, 1020, 1080, 1110, 1170, 1215, 1260, 1290, 1365]
/** Conditions the Weather field can actually hold; the dynamic and random ones are not offered. */
const CONDITIONS = [0, 2, 1, 4, 5, 6, 7, 8, 9]

/**
 * Schedule and results, read from the save's game table.
 *
 * With a team chosen it is that team's season; without one it is the league,
 * a week at a time. Results for weeks the user has not played yet are hidden
 * by default: the game simulates the rest of the country before the user's
 * own game and keeps those scores out of sight until it is played, so showing
 * them here would spoil the week.
 */
export default function Schedule({ games, team, art, savePath, onEdited, log }: {
  games: SeasonGame[]
  team: string | null
  art: Record<string, string>
  savePath: string | null
  onEdited: () => void
  log: (text: string, kind?: 'good' | 'bad') => void
}) {
  const [open, setOpen] = useState<number | null>(null)
  const [spoilers, setSpoilers] = useState(false)
  const [week, setWeek] = useState<number | null>(null)

  const mine = useMemo(() => (team ? games.filter((g) => g.home === team || g.away === team) : []), [games, team])
  /** First week with an unplayed game for the user's team is where the spoiler line sits. */
  const holdFrom = useMemo(() => {
    const next = mine.filter((g) => !g.postseason && !g.played).map((g) => g.week)
    return next.length ? Math.min(...next) : Infinity
  }, [mine])
  const weeks = useMemo(() => [...new Set(games.filter((g) => !g.postseason).map((g) => g.week))].sort((a, b) => a - b), [games])
  const shownWeek = week ?? (holdFrom === Infinity ? weeks[weeks.length - 1] : holdFrom)
  const league = useMemo(() => games.filter((g) => !g.postseason && g.week === shownWeek), [games, shownWeek])
  const hidden = (g: SeasonGame) => !spoilers && g.played && g.week >= holdFrom && !(g.home === team || g.away === team)

  const icon = (name: string | null) => (name ? (art[`${name}|icon`] ?? art[`${name}|logoLight`]) : undefined)

  if (!games.length) return <Card className="card-pad"><Empty>the save has no games in it</Empty></Card>

  const record = mine.filter((g) => g.played && !g.postseason).reduce((r, g) => {
    const won = (g.home === team ? g.homeScore > g.awayScore : g.awayScore > g.homeScore)
    return won ? { w: r.w + 1, l: r.l } : { w: r.w, l: r.l + 1 }
  }, { w: 0, l: 0 })

  return (
    <>
      {team ? (
        <Card className="card-pad">
          <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
            <Kicker>{team} — {record.w}-{record.l}</Kicker>
            <Meta size={9}>{mine.filter((g) => !g.postseason).length} GAMES</Meta>
          </div>
          {mine.filter((g) => !g.postseason).map((g) => (
            <GameRow key={g.row} g={g} team={team} icon={icon} open={open === g.row}
              onToggle={() => setOpen(open === g.row ? null : g.row)} hidden={false}
              savePath={savePath} onEdited={onEdited} log={log} />
          ))}
        </Card>
      ) : null}

      <Card className="card-pad">
        <div className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Kicker>Around the league</Kicker>
          {holdFrom !== Infinity ? (
            <Chip on={spoilers} onClick={() => setSpoilers(!spoilers)}>
              {spoilers ? 'showing results you have not reached' : 'results held until you play the week'}
            </Chip>
          ) : null}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {weeks.map((w) => <Chip key={w} on={w === shownWeek} onClick={() => setWeek(w)}>WK {w}</Chip>)}
        </div>
        {league.length === 0 ? <Empty>no games that week</Empty> : null}
        {league.map((g) => (
          <GameRow key={g.row} g={g} team={team} icon={icon} open={open === g.row}
            onToggle={() => setOpen(open === g.row ? null : g.row)} hidden={hidden(g)}
            savePath={savePath} onEdited={onEdited} log={log} />
        ))}
      </Card>
    </>
  )
}

function GameRow({ g, team, icon, open, onToggle, hidden, savePath, onEdited, log }: {
  g: SeasonGame; team: string | null; icon: (n: string | null) => string | undefined
  open: boolean; onToggle: () => void; hidden: boolean
  savePath: string | null; onEdited: () => void
  log: (text: string, kind?: 'good' | 'bad') => void
}) {
  const mineHome = team !== null && g.home === team
  const mineAway = team !== null && g.away === team
  const opponent = mineHome ? g.away : mineAway ? g.home : null
  const won = mineHome ? g.homeScore > g.awayScore : mineAway ? g.awayScore > g.homeScore : null
  const kickoff = kickoffLabel(g.kickoff)
  const result = !g.played ? null
    : hidden ? 'ON HOLD'
    : opponent ? `${won ? 'W' : 'L'} ${mineHome ? g.homeScore : g.awayScore}-${mineHome ? g.awayScore : g.homeScore}${g.overtime ? ' OT' : ''}`
    : `${g.awayScore}-${g.homeScore}${g.overtime ? ' OT' : ''}`
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 8 }}>
      <button onClick={onToggle} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <Meta size={9}>{g.postseason ? 'BOWL' : `WK ${g.week}`}</Meta>
          <span style={{ color: 'var(--ink3)', fontSize: 11, width: 46 }}>{dateLabel(g.month, g.day)}</span>
          {opponent ? (
            <>
              <Meta size={9}>{mineHome ? 'VS' : '@'}</Meta>
              <SchoolArt size={16} file={icon(opponent)} />
              <strong style={{ color: 'var(--ink)', minWidth: 130 }}>{opponent}</strong>
            </>
          ) : (
            <>
              <SchoolArt size={16} file={icon(g.away)} />
              <strong style={{ color: 'var(--ink)' }}>{g.away}</strong>
              <Meta size={9}>@</Meta>
              <SchoolArt size={16} file={icon(g.home)} />
              <strong style={{ color: 'var(--ink)', minWidth: 110 }}>{g.home}</strong>
            </>
          )}
          <span className="num" style={{ fontSize: 13, color: result === 'ON HOLD' ? 'var(--ink3)' : won === null ? 'var(--ink)' : won ? 'var(--good)' : 'var(--warn)', minWidth: 70 }}>
            {result ?? (kickoff ? `Sat ${kickoff}` : 'TBD')}
          </span>
          {g.userPlayed ? <Meta size={9} color="var(--accent)">YOU PLAYED</Meta> : null}
        </div>
      </button>
      {open && !hidden ? <BoxScore g={g} savePath={savePath} onEdited={onEdited} log={log} /> : null}
    </div>
  )
}

function BoxScore({ g, savePath, onEdited, log }: {
  g: SeasonGame; savePath: string | null; onEdited: () => void
  log: (text: string, kind?: 'good' | 'bad') => void
}) {
  const [editing, setEditing] = useState(false)
  const kickoff = kickoffLabel(g.kickoff)
  const weather = weatherName(g.weather)
  const facts = [
    kickoff ? `Kickoff ${kickoff}` : null,
    g.played || weather ? `${g.temperatureF}°F` : null,
    weather,
    g.windMph ? `Wind ${g.windMph} mph` : null,
    g.attendance ? `Attendance ${g.attendance.toLocaleString()}` : null,
    g.played ? (g.userPlayed ? 'Played by you' : 'Simulated') : 'Upcoming',
  ].filter(Boolean)
  const cols = ['Q1', 'Q2', 'Q3', 'Q4', ...(g.overtime || g.homeOT || g.awayOT ? ['OT'] : []), 'F']
  const line = (name: string | null, q: number[], ot: number, final: number) => (
    <div className="row" style={{ gap: 0, alignItems: 'baseline' }}>
      <span style={{ color: 'var(--ink)', width: 140, fontSize: 12 }}>{name}</span>
      {q.map((v, i) => <span key={i} className="num" style={{ width: 34, textAlign: 'right', color: 'var(--ink2)', fontSize: 12 }}>{v}</span>)}
      {cols.includes('OT') ? <span className="num" style={{ width: 34, textAlign: 'right', color: 'var(--ink2)', fontSize: 12 }}>{ot}</span> : null}
      <span className="num" style={{ width: 40, textAlign: 'right', color: 'var(--ink)', fontSize: 13 }}>{final}</span>
    </div>
  )
  return (
    <div style={{ marginTop: 8, paddingLeft: 4 }}>
      <Meta size={9}>{facts.join('  ·  ')}</Meta>
      {g.played ? (
        <div style={{ marginTop: 6 }}>
          <div className="row" style={{ gap: 0, alignItems: 'baseline' }}>
            <span style={{ width: 140 }} />
            {cols.map((c) => <Meta key={c} size={9}><span style={{ display: 'inline-block', width: c === 'F' ? 40 : 34, textAlign: 'right' }}>{c}</span></Meta>)}
          </div>
          {line(g.away, g.awayQ, g.awayOT, g.awayScore)}
          {line(g.home, g.homeQ, g.homeOT, g.homeScore)}
          <Meta size={9}>Team and player statistics are only kept by the game for the current week; DCC shows what the save still holds.</Meta>
        </div>
      ) : null}
      {savePath && !g.played ? (
        editing
          ? <Conditions g={g} savePath={savePath} onDone={() => { setEditing(false); onEdited() }}
              onCancel={() => setEditing(false)} log={log} />
          : (
            <div style={{ marginTop: 8 }}>
              <Btn size="sm" onClick={() => setEditing(true)}>Change kickoff and conditions</Btn>
            </div>
          )
      ) : null}
    </div>
  )
}

/**
 * The editor for an upcoming game.
 *
 * Only the four fields DCC can write are offered, and only the conditions the
 * game's own Weather field can hold — offering one it cannot is exactly the
 * failure that makes a save refuse the write.
 */
function Conditions({ g, savePath, onDone, onCancel, log }: {
  g: SeasonGame; savePath: string; onDone: () => void; onCancel: () => void
  log: (text: string, kind?: 'good' | 'bad') => void
}) {
  const [kickoff, setKickoff] = useState(g.kickoff)
  const [weather, setWeather] = useState(g.weather)
  const [temp, setTemp] = useState(String(g.temperatureF))
  const [wind, setWind] = useState(String(g.windMph))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true); setError(null)
    const res = await window.dcc.writeGames(savePath, [{
      row: g.row, kickoff, weather,
      temperatureF: Number(temp), windMph: Number(wind),
    }])
    setBusy(false)
    if (!res.ok) { setError(res.message); log(`schedule edit refused: ${res.message}`, 'bad'); return }
    log(`${g.away} at ${g.home}: ${res.message}. Backup at ${res.backup}`, 'good')
    onDone()
  }

  return (
    <div style={{ marginTop: 10, padding: 10, border: '1px solid var(--accent)', borderRadius: 4 }}>
      <Kicker>Kickoff</Kicker>
      <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        {KICKOFFS.map((k) => (
          <Chip key={k} on={k === kickoff} onClick={() => setKickoff(k)}>{kickoffLabel(k)}</Chip>
        ))}
      </div>
      <div style={{ marginTop: 10 }}><Kicker>Conditions</Kicker></div>
      <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        {CONDITIONS.map((w) => (
          <Chip key={w} on={w === weather} onClick={() => setWeather(w)}>{WEATHER[w]}</Chip>
        ))}
      </div>
      <div className="row" style={{ gap: 14, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="row" style={{ gap: 6, alignItems: 'center' }}>
          <Meta size={9}>TEMPERATURE °F</Meta>
          <Input style={{ width: 70 }} value={temp} onChange={(e) => setTemp(e.target.value)} />
        </span>
        <span className="row" style={{ gap: 6, alignItems: 'center' }}>
          <Meta size={9}>WIND MPH</Meta>
          <Input style={{ width: 70 }} value={wind} onChange={(e) => setWind(e.target.value)} />
        </span>
      </div>
      <p className="body-serif" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
        The game decides a week's weather when that week begins, so conditions set before
        then are replaced when you advance. Kickoff holds whenever it is set. A timestamped
        backup of the save is written first.
      </p>
      {error ? <Meta size={9} color="var(--warn)">{error}</Meta> : null}
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <Btn variant="primary" size="sm" onClick={save} disabled={busy}>
          {busy ? 'Writing…' : 'Write to the save'}
        </Btn>
        <Btn size="sm" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  )
}
