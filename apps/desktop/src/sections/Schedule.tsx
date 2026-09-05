import { useMemo, useState } from 'react'
import { Card, Chip, Empty, Kicker, Meta, SchoolArt } from '../ui'
import type { SeasonGame } from '../../electron/saveAnalysis'
import { dateLabel, kickoffLabel, weatherName } from '../../electron/gameEnums'

/**
 * Schedule and results, read from the save's game table.
 *
 * With a team chosen it is that team's season; without one it is the league,
 * a week at a time. Results for weeks the user has not played yet are hidden
 * by default: the game simulates the rest of the country before the user's
 * own game and keeps those scores out of sight until it is played, so showing
 * them here would spoil the week.
 */
export default function Schedule({ games, team, art }: {
  games: SeasonGame[]
  team: string | null
  art: Record<string, string>
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
              onToggle={() => setOpen(open === g.row ? null : g.row)} hidden={false} />
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
            onToggle={() => setOpen(open === g.row ? null : g.row)} hidden={hidden(g)} />
        ))}
      </Card>
    </>
  )
}

function GameRow({ g, team, icon, open, onToggle, hidden }: {
  g: SeasonGame; team: string | null; icon: (n: string | null) => string | undefined
  open: boolean; onToggle: () => void; hidden: boolean
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
      {open && !hidden ? <BoxScore g={g} /> : null}
    </div>
  )
}

function BoxScore({ g }: { g: SeasonGame }) {
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
    </div>
  )
}
