import { useMemo, useState } from 'react'
import { useSave } from '../saveStore'
import { useStore } from '../store'
import { Btn, Kicker, Meta, PlayerFace } from '../ui'
import { TEAM_ID_NAMES } from '../../electron/teamIds'
import { dateLabel, kickoffLabel, weatherName } from '../../electron/gameEnums'
import type { RosterPlayer, SeasonGame } from '../../electron/saveAnalysis'

const UNASSIGNED = 255

/** The six ratings a prospect card leads with, per position group. */
const CARD_RATINGS: Record<string, string[]> = {
  QB: ['Throwing Power', 'Short Throw Accuracy', 'Deep Throw Accuracy', 'Throw on the Run', 'Awareness', 'Speed'],
  HB: ['Speed', 'Acceleration', 'Agility', 'Break Tackle', 'Carrying', 'BC Vision'],
  FB: ['Run Blocking', 'Impact Blocking', 'Carrying', 'Strength', 'Awareness', 'Speed'],
  WR: ['Speed', 'Catching', 'Short Route Running', 'Deep Route Running', 'Release', 'Agility'],
  TE: ['Catching', 'Short Route Running', 'Run Blocking', 'Strength', 'Speed', 'Catch in Traffic'],
  LT: ['Pass Blocking', 'Run Blocking', 'Strength', 'Awareness', 'Pass Block Power', 'Impact Blocking'],
  LE: ['Power Moves', 'Finesse Moves', 'Block Shedding', 'Strength', 'Pursuit', 'Tackling'],
  DT: ['Power Moves', 'Block Shedding', 'Strength', 'Tackling', 'Pursuit', 'Awareness'],
  MLB: ['Tackling', 'Block Shedding', 'Pursuit', 'Zone Coverage', 'Hit Power', 'Speed'],
  CB: ['Speed', 'Man Coverage', 'Zone Coverage', 'Press', 'Acceleration', 'Awareness'],
  FS: ['Speed', 'Zone Coverage', 'Tackling', 'Pursuit', 'Awareness', 'Hit Power'],
  K: ['Kicking Power', 'Kicking Accuracy', 'Awareness', 'Stamina', 'Toughness', 'Speed'],
}
const GENERIC = ['Speed', 'Acceleration', 'Agility', 'Strength', 'Awareness', 'Toughness']
function cardRatings(pos: string): string[] {
  if (CARD_RATINGS[pos]) return CARD_RATINGS[pos]
  if (['LG', 'C', 'RG', 'RT'].includes(pos)) return CARD_RATINGS.LT
  if (pos === 'RE') return CARD_RATINGS.LE
  if (['LOLB', 'ROLB'].includes(pos)) return CARD_RATINGS.MLB
  if (pos === 'SS') return CARD_RATINGS.FS
  if (pos === 'P') return CARD_RATINGS.K
  return GENERIC
}

/**
 * A player's face where the front page used to draw their initials. The art is
 * already indexed for the roster screens; there was no reason Home was the one
 * place that did not use it.
 */
function Face({ p, size }: { p: { first: string; last: string; assetId?: string | null }; size: number }) {
  const { save } = useSave()
  return (
    <PlayerFace
      className="gs-row-avatar" round size={size}
      first={p.first} last={p.last}
      file={p.assetId ? save.facePaths[p.assetId] : undefined}
    />
  )
}


const ratingTone = (v: number) => (v >= 85 ? 'is-high' : v >= 75 ? 'is-mid' : 'is-low')

/**
 * Home.
 *
 * Your programme and your board on the left, the feature in the middle, the
 * week's results on the right. Opening a score or a board row swaps the middle
 * column rather than navigating away, so the rails stay put and you keep your
 * place — which is the whole reason the layout is three columns.
 *
 * Everything here is read out of the save. The one thing written rather than
 * read is the lead story, generated on demand from a fact sheet of these same
 * numbers, so it can describe the game but cannot invent one.
 */
export default function WireSave() {
  const { save } = useSave()
  const { state, dispatch } = useStore()
  const roster = save.roster
  const me = state.teamId === null ? null : (state.teamNames[state.teamId] ?? TEAM_ID_NAMES[state.teamId] ?? null)

  const [open, setOpen] = useState<{ kind: 'game'; row: number } | { kind: 'player'; index: number } | null>(null)

  const games = roster?.games ?? []
  const mine = useMemo(
    () => games.filter((g) => g.home === me || g.away === me).sort((a, b) => a.week - b.week),
    [games, me],
  )
  const last = [...mine].reverse().find((g) => g.played) ?? null
  const next = mine.find((g) => !g.played) ?? null

  /** Every programme's record, so the rail can place you in the country. */
  const table = useMemo(() => {
    const t = new Map<string, { w: number; l: number; cw: number; cl: number; pf: number; pa: number }>()
    const get = (n: string) => {
      let r = t.get(n)
      if (!r) { r = { w: 0, l: 0, cw: 0, cl: 0, pf: 0, pa: 0 }; t.set(n, r) }
      return r
    }
    const conf = new Map<string, string | null>()
    for (const c of roster?.coaches ?? []) {
      const n = state.teamNames[c.teamId] ?? TEAM_ID_NAMES[c.teamId]
      if (n) conf.set(n, c.conference)
    }
    for (const g of games) {
      if (!g.played || g.postseason || !g.home || !g.away) continue
      const h = get(g.home), a = get(g.away)
      h.pf += g.homeScore; h.pa += g.awayScore
      a.pf += g.awayScore; a.pa += g.homeScore
      const homeWon = g.homeScore > g.awayScore
      if (homeWon) { h.w++; a.l++ } else { h.l++; a.w++ }
      const sameConf = conf.get(g.home) && conf.get(g.home) === conf.get(g.away)
      if (sameConf) { if (homeWon) { h.cw++; a.cl++ } else { h.cl++; a.cw++ } }
    }
    return { t, conf }
  }, [games, roster, state.teamNames])

  const record = me ? table.t.get(me) : undefined
  const conference = me ? table.conf.get(me) ?? null : null
  const nationalRank = useMemo(() => {
    if (!me || !record) return null
    const pct = (r: { w: number; l: number }) => r.w / Math.max(1, r.w + r.l)
    const ordered = [...table.t.entries()]
      .sort((a, b) => pct(b[1]) - pct(a[1]) || (b[1].w - b[1].l) - (a[1].w - a[1].l) || a[0].localeCompare(b[0]))
    return ordered.findIndex(([n]) => n === me) + 1 || null
  }, [table, me, record])

  /** The week you have reached, and everyone else's results from it. */
  const saturday = useMemo(() => {
    const played = games.filter((g) => g.played && !g.postseason)
    if (!played.length) return []
    const wk = last ? last.week : Math.max(...played.map((g) => g.week))
    return played.filter((g) => g.week === wk).sort((a, b) => (a.home === me || a.away === me ? -1 : 0) - (b.home === me || b.away === me ? -1 : 0))
  }, [games, last, me])

  const scouted = (p: RosterPlayer) => state.revealAllRecruits || state.revealedRecruits.includes(p.playerId)

  const board = useMemo(
    () => (roster?.players ?? [])
      .filter((p) => p.team === UNASSIGNED && p.recruitFlag && /^Generic_/.test(p.assetId ?? ''))
      .sort((a, b) => b.stars - a.stars || b.overall - a.overall || a.last.localeCompare(b.last))
      .slice(0, 8),
    [roster],
  )

  const squad = useMemo(
    () => (roster?.players ?? []).filter((p) => p.team === state.teamId).sort((a, b) => b.overall - a.overall),
    [roster, state.teamId],
  )

  if (!roster) {
    return (
      <div className="gs-soon">
        <h1 className="screen-title" style={{ marginBottom: 14 }}>{me ?? 'Your dynasty'}</h1>
        <p className="gs-soon-body">
          {save.restoring
            ? 'Reading your save. The whole front page comes out of that one pass — ' +
              'the schedule, the scores, the squad and the recruiting board.'
            : 'Open The Program and read the roster. The whole front page comes out of that one ' +
              'pass — the schedule, the scores, the squad and the recruiting board.'}
        </p>
      </div>
    )
  }

  const openGame = open?.kind === 'game' ? games.find((g) => g.row === open.row) ?? null : null
  const openPlayer = open?.kind === 'player'
    ? (roster.players ?? []).find((p) => p.index === open.index) ?? null
    : null

  return (
    <div className="gs-shell">
      {/* ── your programme ────────────────────────────────────────────── */}
      <aside className="gs-rail">
        <div>
          <Kicker>Your programme</Kicker>
          <h1 className="screen-title" style={{ marginTop: 10 }}>{me ?? 'Pick your team'}</h1>
          <div style={{ marginTop: 8 }}>
            <Meta>
              {[record ? `${record.w}-${record.l}` : null, conference, nationalRank ? `No. ${nationalRank} by record` : null]
                .filter(Boolean).join(' · ')}
            </Meta>
          </div>
        </div>

        <div className="grid-2" style={{ gap: 12 }}>
          <div className="card card-pad">
            <Kicker>Conference</Kicker>
            <div className="gs-tile-val is-high" style={{ fontSize: 32 }}>
              {record ? <>{record.cw}<i className="gs-dash" />{record.cl}</> : '—'}
            </div>
            <div style={{ marginTop: 6 }}><Meta size={10}>{conference ?? 'Not read'}</Meta></div>
          </div>
          <div className="card card-pad">
            <Kicker>Scoring</Kicker>
            <div className="gs-tile-val is-mid" style={{ fontSize: 32 }}>{record ? record.pf : '—'}</div>
            <div style={{ marginTop: 6 }}><Meta size={10}>{record ? `${record.pa} allowed` : 'Not read'}</Meta></div>
          </div>
        </div>

        <div className="card card-pad" style={{ flex: 1, minHeight: 0 }}>
          <div className="card-head">
            <Kicker>The board</Kicker>
            <Meta size={10}>{board.length} of the class</Meta>
          </div>
          {board.map((p) => (
            <button
              key={p.index}
              className="gs-row"
              aria-selected={open?.kind === 'player' && open.index === p.index}
              onClick={() => setOpen(open?.kind === 'player' && open.index === p.index ? null : { kind: 'player', index: p.index })}
            >
              <Face p={p} size={30} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="gs-row-title">{p.first} {p.last}</span>
                <span className="gs-row-sub" style={{ display: 'block' }}>
                  <span className="gs-stars">{'★'.repeat(p.stars)}</span>{' '}
                  {p.position} · {p.homeState ?? p.hometown}
                </span>
              </span>
              <span className={`gs-tag ${scouted(p) ? 'gs-tag-accent' : 'gs-tag-mute'}`}>
                {scouted(p) ? p.overall : 'Scout'}
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* ── the middle column: feature, or whatever you opened ─────────── */}
      <div className="gs-main-col">
        {openGame ? (
          <BoxScore g={openGame} onClose={() => setOpen(null)} />
        ) : openPlayer ? (
          <ProspectCard
            p={openPlayer}
            revealed={state.revealAllRecruits || state.revealedRecruits.includes(openPlayer.playerId)}
            onReveal={() => dispatch({ type: 'revealRecruit', playerId: openPlayer.playerId })}
            onClose={() => setOpen(null)}
          />
        ) : last ? (
          <Feature
            g={last}
            team={me}
            apiKey={state.anthropicKey}
            log={(text, kind) => dispatch({ type: 'log', line: { text, kind: kind ?? 'good' } })}
            onBoxScore={() => setOpen({ kind: 'game', row: last.row })}
          />
        ) : (
          <div className="gs-figure"><Meta>NOTHING PLAYED YET</Meta></div>
        )}
      </div>

      {/* ── the week, and what is next ────────────────────────────────── */}
      <aside className="gs-rail-right">
        <Kicker>Saturday</Kicker>
        {saturday.slice(0, 9).map((g) => {
          const homeWon = g.homeScore > g.awayScore
          return (
            <button
              key={g.row}
              className="gs-score"
              aria-selected={open?.kind === 'game' && open.row === g.row}
              onClick={() => setOpen(open?.kind === 'game' && open.row === g.row ? null : { kind: 'game', row: g.row })}
            >
              <div className={`gs-score-row${homeWon ? ' is-lost' : ''}`}>
                <span className="gs-score-team">{g.away}</span>
                <span className="gs-score-num">{g.awayScore}</span>
              </div>
              <div className={`gs-score-row${homeWon ? '' : ' is-lost'}`}>
                <span className="gs-score-team">{g.home}</span>
                <span className="gs-score-num">{g.homeScore}</span>
              </div>
            </button>
          )
        })}

        {next ? (
          <>
            <div style={{ marginTop: 6 }}><Kicker>Next up</Kicker></div>
            <div className="card card-pad">
              <div className="gs-row-title" style={{ fontSize: 22, fontFamily: 'var(--serif)', fontWeight: 600 }}>
                {(next.home === me ? next.away : next.home) ?? 'TBD'}
              </div>
              <div style={{ marginTop: 6 }}>
                <Meta size={10}>
                  {next.home === me ? 'HOME' : 'AWAY'} · WEEK {next.week} · {dateLabel(next.month, next.day)}
                </Meta>
              </div>
              <div className="row" style={{ gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                {[kickoffLabel(next.kickoff), weatherName(next.weather) ? `${next.temperatureF}°F ${weatherName(next.weather)}` : null]
                  .filter(Boolean).map((t) => <Meta key={t as string} size={10}>{t}</Meta>)}
              </div>
            </div>
          </>
        ) : null}

        {squad.length ? (
          <>
            <div style={{ marginTop: 6 }}><Kicker>Top of the roster</Kicker></div>
            <div className="card card-pad">
              {squad.slice(0, 5).map((p) => (
                <div key={p.index} className="gs-row" style={{ cursor: 'default' }}>
                  <span className="gs-tile-val is-high" style={{ fontSize: 18, margin: 0, minWidth: 28 }}>{p.overall}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="gs-row-title">{p.first} {p.last}</span>
                    <span className="gs-row-sub" style={{ display: 'block' }}>{p.position}</span>
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </aside>
    </div>
  )
}

/**
 * The feature: the last result, told as a story.
 *
 * The well carries the scoreline at broadcast size rather than a photograph —
 * the save has no images, and a fabricated one would be the only invented thing
 * on the page.
 */
function Feature({ g, team, apiKey, log, onBoxScore }: {
  g: SeasonGame; team: string | null; apiKey: string
  log: (text: string, kind?: 'good' | 'bad') => void
  onBoxScore: () => void
}) {
  const [story, setStory] = useState<{ headline: string; standfirst: string; body: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const home = g.home === team
  const us = home ? g.homeScore : g.awayScore
  const them = home ? g.awayScore : g.homeScore
  const other = (home ? g.away : g.home) ?? 'their opponent'
  const won = us > them

  const write = async () => {
    setBusy(true); setError(null)
    const res = await window.dcc.writePress({ game: g, kind: 'recap', userTeam: team })
    setBusy(false)
    if (res.ok) { setStory(res.story); log(`wrote a recap for ${g.away} at ${g.home}`) }
    else { setError(res.message); log(res.message, 'bad') }
  }

  return (
    <>
      <div className="gs-figure">
        <div className="gs-figure-kicker"><Kicker>{won ? 'Won' : 'Lost'} · week {g.week}</Kicker></div>
        <div className="gs-figure-score">
          <span className={won ? '' : 'is-lost'}>{us}</span>
          <i className="gs-dash" />
          <span className={won ? 'is-lost' : ''}>{them}</span>
        </div>
        <div className="gs-figure-caption">
          {[home ? `vs ${other}` : `at ${other}`, dateLabel(g.month, g.day),
            g.attendance ? `${g.attendance.toLocaleString()} in attendance` : null,
            weatherName(g.weather) ? `${g.temperatureF}°F ${weatherName(g.weather)?.toLowerCase()}` : null]
            .filter(Boolean).join('  ·  ')}
        </div>
      </div>

      <div style={{ paddingTop: 20 }}>
        <h2 className="hero-headline" style={{ maxWidth: 560 }}>
          {story ? story.headline : `${team ?? 'You'} ${us}, ${other} ${them}`}
        </h2>
        {story ? (
          <>
            <p className="body-serif" style={{ margin: '12px 0 0', maxWidth: 520 }}>{story.standfirst}</p>
            {story.body.split(/\n+/).map((para, i) => (
              <p key={i} className="body-serif" style={{ margin: '10px 0 0', maxWidth: 520 }}>{para}</p>
            ))}
          </>
        ) : (
          <p className="body-serif" style={{ margin: '12px 0 0', maxWidth: 520 }}>
            {won
              ? `${team ?? 'You'} came out of week ${g.week} at ${g.attendance ? g.attendance.toLocaleString() : 'home'}.`
              : `A week ${g.week} loss to ${other}.`}
            {' '}Ask for the story and it is written from this game's own numbers — the teams, the
            records, the conditions and the score.
          </p>
        )}

        <div className="row" style={{ gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <Btn variant="primary" onClick={write} disabled={busy || !apiKey}>
            {busy ? 'Writing…' : story ? 'Write another' : 'Read'}
          </Btn>
          <Btn onClick={onBoxScore}>Box score</Btn>
          {!apiKey ? <Meta size={10}>ADD AN API KEY IN SETTINGS</Meta> : null}
          {error ? <Meta size={10} color="var(--accent-ui)">{error.toUpperCase()}</Meta> : null}
        </div>
      </div>
    </>
  )
}

/** A game opened from the Saturday rail. */
function BoxScore({ g, onClose }: { g: SeasonGame; onClose: () => void }) {
  const homeWon = g.homeScore > g.awayScore
  const quarters = ['1', '2', '3', '4']
  // Only the quarters the save actually holds; overtime is its own column.
  const rows: [string, number[], number, boolean][] = [
    [g.away ?? 'Away', g.awayQ, g.awayScore, !homeWon],
    [g.home ?? 'Home', g.homeQ, g.homeScore, homeWon],
  ]

  return (
    <div className="fade-in">
      <div className="row" style={{ gap: 14, alignItems: 'baseline' }}>
        <Kicker>Box score · week {g.week}</Kicker>
        <button className="gs-close" onClick={onClose}>Close ✕</button>
      </div>

      <div className="gs-figure" style={{ marginTop: 14 }}>
        <div className="gs-figure-score">
          <span className={homeWon ? 'is-lost' : ''}>{g.awayScore}</span>
          <i className="gs-dash" />
          <span className={homeWon ? '' : 'is-lost'}>{g.homeScore}</span>
        </div>
        <div className="gs-figure-caption">
          {`${g.away} at ${g.home}  ·  ${dateLabel(g.month, g.day)}`}
          {g.overtime ? '  ·  Overtime' : ''}
        </div>
      </div>

      <table className="tbl" style={{ marginTop: 20 }}>
        <thead>
          <tr>
            <th />
            {quarters.map((q) => <th key={q} style={{ textAlign: 'right' }}>{q}</th>)}
            {g.overtime ? <th style={{ textAlign: 'right' }}>OT</th> : null}
            <th style={{ textAlign: 'right' }}>T</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, qs, total, won], i) => (
            <tr key={name + i}>
              <td className="name" style={{ color: won ? 'var(--ink)' : 'var(--ink3)' }}>{name}</td>
              {quarters.map((q, qi) => (
                <td key={q} className="num" style={{ color: won ? 'var(--ink)' : 'var(--ink3)' }}>{qs[qi] ?? 0}</td>
              ))}
              {g.overtime ? (
                <td className="num" style={{ color: won ? 'var(--ink)' : 'var(--ink3)' }}>
                  {name === g.home ? g.homeOT : g.awayOT}
                </td>
              ) : null}
              <td className="num" style={{ color: won ? 'var(--accent-ui)' : 'var(--ink3)' }}>{total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Team totals are not decoded, so this compares what is: the scoring by
          quarter, which is the only per-team series the save gives up. */}
      <div className="row" style={{ gap: 16, marginTop: 20, flexWrap: 'wrap' }}>
        <span className="gs-bar-key"><i className="gs-bar-swatch is-away" />{g.away}</span>
        <span className="gs-bar-key"><i className="gs-bar-swatch is-home" />{g.home}</span>
      </div>
      <div className="gs-bars" style={{ marginTop: 10 }}>
        {quarters.map((q, i) => {
          const away = g.awayQ[i] ?? 0
          const home = g.homeQ[i] ?? 0
          const top = Math.max(1, ...g.homeQ, ...g.awayQ)
          return (
            <div className="gs-bar-row" key={q}>
              <span className="gs-bar-name">Quarter {q}</span>
              <span className="gs-bar-track">
                <span className="gs-bar gs-bar-mine" style={{ width: `${(away / top) * 100}%` }} />
                <span className="gs-bar gs-bar-theirs" style={{ width: `${(home / top) * 100}%` }} />
              </span>
              <span className="gs-bar-vals">
                <span className="gs-bar-mine-val">{away}</span>
                <span className="gs-bar-theirs-val">{home}</span>
              </span>
            </div>
          )
        })}
      </div>

      <div className="gs-tiles gs-tiles-5">
        {[
          ['Kickoff', kickoffLabel(g.kickoff) ?? 'TBD'],
          ['Attendance', g.attendance ? g.attendance.toLocaleString() : '—'],
          ['Temperature', `${g.temperatureF}°`],
          ['Weather', weatherName(g.weather) ?? '—'],
          ['Wind', g.windMph ? `${g.windMph} mph` : 'Calm'],
        ].map(([label, val]) => (
          <div className="gs-tile gs-rise" key={label}>
            <div className="gs-tile-label">{label}</div>
            <div className="gs-tile-val is-mid" style={{ fontSize: 19 }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** A recruit opened from the board. */
function ProspectCard({ p, revealed, onReveal, onClose }: {
  p: RosterPlayer; revealed: boolean; onReveal: () => void; onClose: () => void
}) {
  const picks = cardRatings(p.position)
  const top = picks.map((k) => [k, p.ratings[k] ?? 0] as const)

  return (
    <div className="fade-in">
      <div className="row" style={{ gap: 14, alignItems: 'baseline' }}>
        <Kicker>Prospect card</Kicker>
        <button className="gs-close" onClick={onClose}>Close ✕</button>
      </div>

      <div className="row" style={{ gap: 16, marginTop: 14, alignItems: 'center' }}>
        <Face p={p} size={54} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="headline">{p.first} {p.last}</h2>
          <div style={{ marginTop: 4 }}>
            <span className="gs-stars">{'★'.repeat(p.stars)}</span>{' '}
            <Meta size={10}>{[p.position, p.archetype, p.hometown].filter(Boolean).join(' · ')}</Meta>
          </div>
        </div>
        {revealed ? (
          <div style={{ textAlign: 'right' }}>
            <div className="gs-tile-val is-high" style={{ fontSize: 44 }}>{p.overall}</div>
            <Meta size={10}>OVERALL</Meta>
          </div>
        ) : null}
      </div>

      <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {[
          `${Math.floor(p.heightIn / 12)}'${p.heightIn % 12}" · ${p.weightLb}`,
          p.devTrait ? `${p.devTrait} dev` : null,
          p.nilK ? `NIL $${p.nilK}K` : null,
          p.pipeline ? `Pipeline · ${p.pipeline}` : null,
        ].filter(Boolean).map((t) => (
          <span key={t as string} className="gs-tag gs-tag-mute">{t}</span>
        ))}
      </div>

      {revealed ? (
        <div className="gs-tiles gs-tiles-3">
          {top.map(([label, v]) => (
            <div className="gs-tile gs-rise" key={label}>
              <div className="gs-tile-label">{label}</div>
              <div className={`gs-tile-val ${ratingTone(v)}`}>{v}</div>
              <div className="track" style={{ marginTop: 8 }}>
                <div className="track-fill" style={{ width: `${v}%`, background: 'var(--accent-ui)' }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 22 }}>
          <p className="body-serif" style={{ margin: '0 0 14px', maxWidth: 480 }}>
            His overall and all 53 ratings are in the save. Scouting only decides whether you see
            them — nothing about him changes either way.
          </p>
          <Btn variant="primary" onClick={onReveal}>Scout {p.first} {p.last}</Btn>
        </div>
      )}

      {revealed ? (
        <div className="row" style={{ gap: 10, marginTop: 18 }}>
          <Btn onClick={onReveal}>Hide again</Btn>
        </div>
      ) : null}
    </div>
  )
}
