import { useMemo, useState } from 'react'
import { useSave } from '../saveStore'
import { Card, Chip, Input, Kicker, Meta, PlayerFace, SchoolArt, Tab } from '../ui'
import type { RosterPlayer } from '../../electron/saveAnalysis'
import PlayerSheet from './PlayerSheet'

const VIEWS = ['LIST', 'GALLERY', 'CARDS'] as const
type View = (typeof VIEWS)[number]

const UNITS: [string, string[]][] = [
  ['OFFENSE', ['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT']],
  ['DEFENSE', ['LE', 'RE', 'DT', 'LOLB', 'MLB', 'ROLB', 'CB', 'FS', 'SS']],
  ['SPECIAL TEAMS', ['K', 'P']],
]

const ovrColour = (o: number) =>
  o >= 90 ? 'var(--accent)' : o >= 80 ? 'var(--good)' : o >= 70 ? 'var(--ink)' : 'var(--ink3)'

const height = (inches: number) => (inches ? `${Math.floor(inches / 12)}' ${inches % 12}"` : '—')
const nil = (k: number) => (k > 0 ? `$${k >= 1000 ? `${(k / 1000).toFixed(1)}M` : `${k}K`}` : '—')

/** The rating a position is judged on, for the one number a card has room for. */
const KEY_RATING: Record<string, string> = {
  QB: 'ThrowPower', HB: 'Speed', FB: 'RunBlocking', WR: 'Catching', TE: 'Catching',
  LT: 'PassBlocking', LG: 'RunBlocking', C: 'RunBlocking', RG: 'RunBlocking', RT: 'PassBlocking',
  LE: 'PowerMoves', RE: 'FinesseMoves', DT: 'BlockShedding',
  LOLB: 'Pursuit', MLB: 'Tackling', ROLB: 'Pursuit',
  CB: 'ManCoverage', FS: 'ZoneCoverage', SS: 'Tackling', K: 'KickPower', P: 'KickPower',
}

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
  const [view, setView] = useState<View>('LIST')
  const [query, setQuery] = useState('')
  const [unit, setUnit] = useState<string | null>(null)
  const [pos, setPos] = useState<string | null>(null)
  const [year, setYear] = useState<string | null>(null)
  /** The player whose sheet is open, by roster row. */
  const [sheet, setSheet] = useState<number | null>(null)

  const faceOf = (p: RosterPlayer) => save.facePaths[p.assetId]
  const logo = teamName
    ? save.schoolArt[`${teamName}|logoLight`] ?? save.schoolArt[`${teamName}|icon`]
    : undefined

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of players) m.set(p.position, (m.get(p.position) ?? 0) + 1)
    return m
  }, [players])

  const years = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of players) if (p.classYear) m.set(p.classYear, (m.get(p.classYear) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
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
          {[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([p, n]) => (
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
                <th>Name</th><th>Pos</th><th>Yr</th>
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
                    <PlayerFace file={faceOf(p)} first={p.first} last={p.last} size={26} />
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
        <div className="gs-tiles" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', marginTop: 0 }}>
          {shown.map((p) => {
            const key = KEY_RATING[p.position]
            return (
              <Card key={p.index} className="card-pad"
                style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}
                onClick={() => setSheet(p.index)}>
                <div style={{ position: 'relative', background: 'var(--surfaceStrong)' }}>
                  {/* The school's own mark behind the face, quietly. */}
                  <span style={{ position: 'absolute', right: 8, bottom: 8, opacity: 0.16 }}>
                    <SchoolArt size={54} file={logo} />
                  </span>
                  <div style={{ display: 'grid', placeItems: 'center', padding: '14px 0 8px' }}>
                    <PlayerFace file={faceOf(p)} first={p.first} last={p.last} size={104} />
                  </div>
                  <span style={{ position: 'absolute', top: 8, right: 10 }}>
                    <span className="num" style={{ fontSize: 21, color: ovrColour(p.overall) }}>{p.overall}</span>
                  </span>
                  <span style={{ position: 'absolute', top: 10, left: 10 }}><Redshirt on={p.redshirt} /></span>
                </div>
                <div style={{ padding: '10px 12px 12px' }}>
                  <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
                    <strong style={{ color: 'var(--ink)', fontSize: 14 }}>{p.first} {p.last}</strong>
                  </div>
                  <div style={{ marginTop: 3 }}>
                    <Meta size={9}>{[p.position, p.classYear, height(p.heightIn)].filter(Boolean).join(' · ')}</Meta>
                  </div>
                  <div className="row" style={{ gap: 10, marginTop: 8, alignItems: 'baseline' }}>
                    {key && p.ratings[key] !== undefined ? (
                      <span><Meta size={9} color="var(--ink4)">{key.replace(/([A-Z])/g, ' $1').trim().toUpperCase()}</Meta>{' '}
                        <span className="num" style={{ color: 'var(--ink)' }}>{p.ratings[key]}</span></span>
                    ) : null}
                    {mine && p.nilK > 0 ? (
                      <span style={{ marginLeft: 'auto' }}><Meta size={9}>{nil(p.nilK)}</Meta></span>
                    ) : null}
                  </div>
                  {p.devTrait ? (
                    <div style={{ marginTop: 6 }}>
                      <Meta size={9} color="var(--accent)">{p.devTrait.toUpperCase()}</Meta>
                    </div>
                  ) : null}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
