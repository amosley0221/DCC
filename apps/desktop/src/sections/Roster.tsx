import { useMemo, useState } from 'react'
import { useSave } from '../saveStore'
import { useStore } from '../store'
import { Card, Chip, Input, Kicker, Meta, PlayerFace, SchoolArt, Tab } from '../ui'
import { POSITION_RANK, UNITS } from '../../electron/positions'
import type { RosterPlayer } from '../../electron/saveAnalysis'
import PlayerSheet from './PlayerSheet'

const VIEWS = ['LIST', 'GALLERY', 'CARDS'] as const
type View = (typeof VIEWS)[number]

const ovrColour = (o: number) =>
  o >= 90 ? 'var(--accent)' : o >= 80 ? 'var(--good)' : o >= 70 ? 'var(--ink)' : 'var(--ink3)'

const height = (inches: number) => (inches ? `${Math.floor(inches / 12)}' ${inches % 12}"` : '—')
const nil = (k: number) => (k > 0 ? `$${k >= 1000 ? `${(k / 1000).toFixed(1)}M` : `${k}K`}` : '—')

/** Class order, which is the order a roster reads them in. */
const CLASSES = ['Freshman', 'Sophomore', 'Junior', 'Senior']

/** A redshirt, marked the way the game marks it. */
function Redshirt({ on }: { on: boolean }) {
  if (!on) return null
  return (
    <span title="Redshirted" aria-label="Redshirted" style={{
      display: 'inline-grid', placeItems: 'center', width: 15, height: 15, borderRadius: 3,
      background: 'color-mix(in srgb, var(--warn) 22%, transparent)', color: 'var(--warn)',
      fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)', flex: '0 0 auto',
    }}>RS</span>
  )
}

/**
 * The roster, in the three shapes a roster wants to be read in.
 *
 * List is for scanning eighty-five names, gallery for putting a face to each,
 * cards for looking at one. The same players and the same filters throughout —
 * the view changes how they are drawn and nothing else.
 *
 * Season statistics and jersey numbers are not on any of them because neither
 * is decoded out of the save yet. Everything shown here is read from it.
 */
export default function Roster({ players, teamName, mine, onChangeTeam, onSaved }: {
  players: RosterPlayer[]; teamName: string | null; mine: boolean
  onChangeTeam?: () => void
  /** Re-read the save after a write, so the screen shows what it now holds. */
  onSaved?: () => void
}) {
  const { save } = useSave()
  const { state, dispatch } = useStore()
  const [view, setView] = useState<View>('LIST')
  const [query, setQuery] = useState('')
  const [unit, setUnit] = useState<string | null>(null)
  const [pos, setPos] = useState<string | null>(null)
  const [year, setYear] = useState<string | null>(null)
  /** The player whose sheet is open, by roster row. */
  const [sheet, setSheet] = useState<number | null>(null)

  const faceOf = (p: RosterPlayer) => save.facePaths[p.assetId]
  /**
   * A champion by the save's own year summary, or one the user has marked for a
   * title the save cannot know about — a dynasty joined part-way through.
   */
  const champion = !!teamName && (
    save.roster?.titles.some((t) => t.champion === teamName)
    || state.champions.includes(teamName)
  )
  const wonIn = teamName
    ? (save.roster?.titles ?? []).filter((t) => t.champion === teamName).map((t) => t.season)
    : []
  const logo = teamName
    ? save.schoolArt[`${teamName}|logoLight`] ?? save.schoolArt[`${teamName}|icon`]
    : undefined
  // A champion keeps the gold mark, which is the whole reason the game ships one.
  const cardMark = teamName && champion
    ? save.schoolArt[`${teamName}|logoGold`] ?? logo
    : logo
  /**
   * The school's own colour, read out of its logo when the art folder is
   * pointed at. Without one the card falls back to the theme's own panel, which
   * is the right failure — a made-up colour on the wrong school is worse.
   */
  const teamColor = teamName ? save.schoolColors[teamName] : undefined
  /**
   * The team's own jersey, which is a transparent shoulders-and-collar image.
   * Drawn over the portrait rather than under it: the game's portraits come
   * with a generic grey shirt, and the jersey covers exactly that, leaving the
   * head above the collar in the school's own kit.
   */
  const jersey = teamName ? save.schoolArt[`${teamName}|jersey`] : undefined

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of players) m.set(p.position, (m.get(p.position) ?? 0) + 1)
    return m
  }, [players])

  const years = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of players) if (p.classYear) m.set(p.classYear, (m.get(p.classYear) ?? 0) + 1)
    return CLASSES.filter((c) => m.has(c)).map((c) => [c, m.get(c)!] as const)
  }, [players])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const inUnit = unit ? new Set(UNITS.find(([u]) => u === unit)?.[1] ?? []) : null
    return players
      .filter((p) =>
        (!q || (p.first + ' ' + p.last).toLowerCase().includes(q)) &&
        (!pos || p.position === pos) &&
        (!year || p.classYear === year) &&
        (!inUnit || inUnit.has(p.position)))
      .sort((a, b) => b.overall - a.overall)
  }, [players, query, pos, year, unit])

  // Averages by unit, and what the roster costs — the four numbers a coach
  // looks at before any individual player.
  const summary = useMemo(() => {
    const avg = (list: RosterPlayer[]) =>
      list.length ? Math.round((list.reduce((s, p) => s + p.overall, 0) / list.length) * 10) / 10 : 0
    const off = players.filter((p) => UNITS[0][1].includes(p.position))
    const def = players.filter((p) => UNITS[1][1].includes(p.position))
    const paid = players.filter((p) => p.nilK > 0)
    return {
      team: avg(players), offense: avg(off), defense: avg(def),
      offN: off.length, defN: def.length,
      nilTotal: paid.reduce((s, p) => s + p.nilK, 0), paid: paid.length,
    }
  }, [players])

  const shownPlayer = players.find((p) => p.index === sheet) ?? null

  return (
    <div className="col" style={{ gap: 12 }}>
      {shownPlayer ? (
        <PlayerSheet
          player={shownPlayer}
          teamName={teamName}
          onClose={() => setSheet(null)}
          onSaved={onSaved ?? (() => {})}
        />
      ) : null}

      {mine ? (
        <div className="gs-tiles gs-tiles-4" style={{ marginTop: 0 }}>
          {[
            ['TEAM', summary.team.toFixed(1), `${players.length} players`],
            ['OFFENSE', summary.offense.toFixed(1), `${summary.offN} players`],
            ['DEFENSE', summary.defense.toFixed(1), `${summary.defN} players`],
            ['NIL', nil(summary.nilTotal), `${summary.paid} with a deal`],
          ].map(([label, value, sub]) => (
            <Card key={label} className="card-pad">
              <Meta size={9} color="var(--ink4)">{label}</Meta>
              <div className="num" style={{ fontSize: 24, color: 'var(--ink)', marginTop: 3 }}>{value}</div>
              <Meta size={9} color="var(--ink4)">{sub}</Meta>
            </Card>
          ))}
        </div>
      ) : null}

      <Card className="card-pad">
        <div className="row" style={{ gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Kicker>{teamName ?? 'Roster'} — {shown.length} of {players.length}</Kicker>
          {onChangeTeam ? (
            <button onClick={onChangeTeam} style={{ all: 'unset', cursor: 'pointer' }}>
              <Meta size={9} color="var(--accent)">CHANGE TEAM</Meta>
            </button>
          ) : null}
          {teamName && wonIn.length ? (
            <Meta size={9} color="var(--accent)">
              ★ NATIONAL CHAMPION — SEASON {wonIn.join(', ')}
            </Meta>
          ) : teamName ? (
            <button
              onClick={() => dispatch({ type: 'champion', team: teamName, on: !champion })}
              title="The save names a champion once the title game is played. Mark one yourself for a title it does not know about."
              style={{ all: 'unset', cursor: 'pointer' }}
            >
              <Meta size={9} color={champion ? 'var(--accent)' : 'var(--ink4)'}>
                {champion ? '★ NATIONAL CHAMPION' : 'MARK AS CHAMPION'}
              </Meta>
            </button>
          ) : null}
          <div className="subtabs" style={{ marginLeft: 'auto' }}>
            {VIEWS.map((v) => <Tab key={v} on={view === v} onClick={() => setView(v)}>{v}</Tab>)}
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <Input placeholder="search by name" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="row" style={{ gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
          {UNITS.map(([u]) => (
            <Chip key={u} on={unit === u} onClick={() => { setUnit(unit === u ? null : u); setPos(null) }}>{u}</Chip>
          ))}
          {years.map(([y, n]) => (
            <Chip key={y} on={year === y} onClick={() => setYear(year === y ? null : y)}>{y} {n}</Chip>
          ))}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
          {[...counts.entries()]
            .sort((a, b) => (POSITION_RANK.get(a[0]) ?? 99) - (POSITION_RANK.get(b[0]) ?? 99))
            .map(([p, n]) => (
            <Chip key={p} on={pos === p} onClick={() => setPos(pos === p ? null : p)}>{p} {n}</Chip>
          ))}
        </div>
      </Card>

      {view === 'LIST' ? (
        <Card className="card-pad">
          <table className="tbl">
            <thead>
              <tr>
                <th />
                <th>Name</th><th>Pos</th><th>Class</th>
                <th style={{ textAlign: 'right' }}>Ht</th>
                <th style={{ textAlign: 'right' }}>Wt</th>
                <th style={{ textAlign: 'right' }}>Ovr</th>
                {mine ? <th style={{ textAlign: 'right' }}>NIL</th> : null}
                <th>Hometown</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.index}>
                  <td style={{ width: 34 }}>
                    <PlayerFace file={faceOf(p)} first={p.first} last={p.last} size={34} />
                  </td>
                  <td className="name">
                    <button onClick={() => setSheet(p.index)}
                      style={{ all: 'unset', cursor: 'pointer' }}>
                      <span className="row" style={{ gap: 7, alignItems: 'center' }}>
                        <span style={{ color: 'var(--ink)' }}>{p.first} {p.last}</span>
                        <Redshirt on={p.redshirt} />
                      </span>
                    </button>
                  </td>
                  <td><Meta size={9}>{p.position}</Meta></td>
                  <td><Meta size={9}>{p.classYear ?? '—'}</Meta></td>
                  <td className="num">{height(p.heightIn)}</td>
                  <td className="num">{p.weightLb || '—'}</td>
                  <td className="num" style={{ color: ovrColour(p.overall) }}>{p.overall}</td>
                  {mine ? <td className="num">{nil(p.nilK)}</td> : null}
                  <td><Meta size={9}>{p.hometown}</Meta></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : view === 'GALLERY' ? (
        <div className="col" style={{ gap: 8 }}>
          {shown.map((p) => (
            <Card key={p.index} className="card-pad"
              style={{ cursor: 'pointer' }} onClick={() => setSheet(p.index)}>
              <div className="row" style={{ gap: 14, alignItems: 'center' }}>
                <PlayerFace file={faceOf(p)} first={p.first} last={p.last} size={64} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <h3 className="headline" style={{ fontSize: 18 }}>{p.first} {p.last}</h3>
                    <Redshirt on={p.redshirt} />
                  </div>
                  <div style={{ marginTop: 3 }}>
                    <Meta size={10}>
                      {[p.position, p.classYear, height(p.heightIn), p.weightLb ? `${p.weightLb} lbs` : null,
                        p.hometown, p.archetype].filter(Boolean).join(' · ')}
                    </Meta>
                  </div>
                  {p.devTrait ? <div style={{ marginTop: 3 }}><Meta size={9} color="var(--accent)">{p.devTrait.toUpperCase()}</Meta></div> : null}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="num" style={{ fontSize: 30, color: ovrColour(p.overall) }}>{p.overall}</div>
                  <Meta size={9} color="var(--ink4)">OVR</Meta>
                  {mine && p.nilK > 0 ? (
                    <div style={{ marginTop: 4 }}><Meta size={9}>{nil(p.nilK)} NIL</Meta></div>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="gs-tiles" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12, marginTop: 0 }}>
          {shown.map((p) => (
              <button
                key={p.index}
                className="playercard"
                onClick={() => setSheet(p.index)}
                style={{ background: teamColor ?? 'var(--bg0)' }}
              >
                {/* The school's mark, gold once they have won it. */}
                <span className="playercard-mark"><SchoolArt size={86} file={cardMark} /></span>
                <span className="playercard-shade" />
                {faceOf(p) ? (
                  <img className="playercard-face" alt="" loading="lazy"
                    src={'dccart://art/' + faceOf(p)!.split(/[\\/]/).map(encodeURIComponent).join('/')} />
                ) : (
                  <span className="playercard-initials">{(p.first[0] ?? '') + (p.last[0] ?? '')}</span>
                )}
                {jersey ? (
                  <img className="playercard-jersey" alt="" loading="lazy"
                    src={'dccart://art/' + jersey.split(/[\\/]/).map(encodeURIComponent).join('/')} />
                ) : null}

                <span className="playercard-ovr num">{p.overall}</span>
                {p.redshirt ? <span className="playercard-rs">RS</span> : null}

                <span className="playercard-foot">
                  <span className="playercard-name">{p.first} <b>{p.last}</b></span>
                  <span className="playercard-line">
                    {[p.position, p.classYear, height(p.heightIn), p.weightLb ? `${p.weightLb} lb` : null]
                      .filter(Boolean).join(' · ')}
                  </span>
                  {/* Speed for everyone rather than a rating that suits the
                      position: a card is read across a grid, and a column of
                      the same number compares while a column of different ones
                      does not. It is also the one rating every position has. */}
                  <span className="playercard-stats">
                    <span><em>Speed</em> {p.ratings.Speed ?? '—'}</span>
                    {p.devTrait && p.devTrait !== 'Normal' ? <span>{p.devTrait}</span> : null}
                    {mine && p.nilK > 0 ? <span>{nil(p.nilK)}</span> : null}
                  </span>
                </span>
              </button>
          ))}
        </div>
      )}
    </div>
  )
}
