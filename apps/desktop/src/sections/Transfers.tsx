import { useEffect, useMemo, useState } from 'react'
import { useSave } from '../saveStore'
import { useStore } from '../store'
import { Btn, Card, Chip, Empty, Input, Kicker, Meta, SchoolArt, SectionHeader } from '../ui'
import { TEAM_ID_NAMES } from '../../electron/teamIds'
import type { TransferView } from '../../electron/preload'

const ovrColor = (o: number) =>
  o >= 90 ? 'var(--accent)' : o >= 80 ? 'var(--good)' : o >= 70 ? 'var(--ink)' : 'var(--ink3)'

type Scope = 'mine' | 'in' | 'out' | 'all'

/**
 * Who moved, where from and where to.
 *
 * There is no transfer history in the save to read — a player who moved in the
 * offseason looks exactly like one who was always there — so this screen is
 * built out of DCC's own ledger, which files one line per rostered player every
 * time a save is read. It therefore has nothing to show until two seasons have
 * been read, and says so rather than looking broken.
 */
export default function Transfers() {
  const { save } = useSave()
  const { state } = useStore()
  const [view, setView] = useState<TransferView | null>(null)
  const [scope, setScope] = useState<Scope>('mine')
  const [query, setQuery] = useState('')
  const [year, setYear] = useState('')
  const [saving, setSaving] = useState(false)

  const nameOf = (id: number) => state.teamNames[id] ?? TEAM_ID_NAMES[id] ?? `Team ${id}`
  const logoOf = (id: number) => {
    const n = nameOf(id)
    return save.schoolArt[`${n}|logoLight`] ?? save.schoolArt[`${n}|icon`] ?? save.schoolArt[`${n}|logoGold`]
  }

  const refresh = async () => {
    const v = await window.dcc.transfers()
    setView(v)
    setYear(v.latestYear ? String(v.latestYear) : '')
  }

  // The ledger is written by the roster read, so re-reading it whenever the
  // roster changes is what keeps this screen current without a refresh button.
  useEffect(() => { void refresh() }, [save.roster])

  const label = (season: number) => {
    const y = view?.years?.[String(season)]
    return y ? String(y) : `Season ${season}`
  }

  const mine = state.teamId

  const moves = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (view?.moves ?? []).filter((m) => {
      if (scope === 'mine' && m.from !== mine && m.to !== mine) return false
      if (scope === 'in' && m.to !== mine) return false
      if (scope === 'out' && m.from !== mine) return false
      if (!q) return true
      return `${m.first} ${m.last}`.toLowerCase().includes(q)
        || nameOf(m.from).toLowerCase().includes(q)
        || nameOf(m.to).toLowerCase().includes(q)
    })
  }, [view, scope, query, mine, state.teamNames])

  const seasons = view?.seasons ?? []
  const ready = seasons.length > 1

  const setLatestYear = async () => {
    setSaving(true)
    const n = Number(year)
    await window.dcc.setTransferYear(Number.isFinite(n) && n > 1900 && n < 2200 ? n : null)
    await refresh()
    setSaving(false)
  }

  return (
    <>
      <SectionHeader
        title="Transfers"
        sub={<Meta>{ready
          ? `${(view?.moves.length ?? 0).toLocaleString()} MOVES ACROSS ${seasons.length} SEASONS`
          : `${seasons.length} SEASON RECORDED — TWO ARE NEEDED`}</Meta>}
      />

      <div className="col" style={{ gap: 12, maxWidth: 980 }}>
        <Card className="card-pad">
          <Kicker>How this is built</Kicker>
          <p className="body-serif" style={{ marginTop: 7 }}>
            Your dynasty file says where every player is, never where they have been. So DCC
            writes down each roster whenever it reads your save, and a transfer is a player
            who turns up somewhere else the next season. Read your save once a year and this
            fills itself in — including the schools you never play.
          </p>
          <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {seasons.map((s) => (
              <span key={s.season} className="row" style={{ gap: 6, alignItems: 'baseline' }}>
                <span className="mono" style={{ fontSize: 11, letterSpacing: 1.2, color: 'var(--ink2)' }}>
                  {label(s.season).toUpperCase()}
                </span>
                <Meta color="var(--ink4)">
                  {s.players.toLocaleString()} players{s.week ? ` · week ${s.week}` : ''}
                </Meta>
              </span>
            ))}
            {!seasons.length ? <Meta color="var(--ink4)">NOTHING RECORDED YET</Meta> : null}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
            <Meta>THIS SEASON IS</Meta>
            <span style={{ width: 92 }}>
              <Input
                placeholder="2027"
                value={year}
                inputMode="numeric"
                onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
              />
            </span>
            <Btn onClick={setLatestYear} disabled={saving}>{saving ? 'Saving…' : 'Name the year'}</Btn>
            <Meta color="var(--ink4)">
              The save does not carry a calendar year, so DCC counts seasons until you name one.
            </Meta>
          </div>
        </Card>

        {!ready ? (
          <Empty>
            Transfers appear once two seasons have been read. Open your save again after the
            offseason and everyone who moved shows up here.
          </Empty>
        ) : (
          <>
            <Card className="card-pad">
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <Chip on={scope === 'mine'} onClick={() => setScope('mine')}>MY PROGRAM</Chip>
                <Chip on={scope === 'in'} onClick={() => setScope('in')}>CAME IN</Chip>
                <Chip on={scope === 'out'} onClick={() => setScope('out')}>LEFT</Chip>
                <Chip on={scope === 'all'} onClick={() => setScope('all')}>EVERY SCHOOL</Chip>
              </div>
              <div style={{ marginTop: 10 }}>
                <Input
                  placeholder="search by player or school"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </Card>

            {!moves.length ? (
              <Empty>No transfers match that.</Empty>
            ) : (
              <Card>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Pos</th>
                      <th className="num">Ovr</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Year</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moves.slice(0, 400).map((m) => (
                      <tr key={`${m.key}-${m.toSeason}`}>
                        <td>{m.first} {m.last}</td>
                        <td><Meta>{m.position}</Meta></td>
                        <td className="num" style={{ color: ovrColor(m.overallAfter) }}>
                          {m.overallAfter}
                          {m.overallAfter !== m.overallBefore ? (
                            <Meta color="var(--ink4)"> from {m.overallBefore}</Meta>
                          ) : null}
                        </td>
                        <td>
                          <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                            <SchoolArt file={logoOf(m.from)} size={18} />
                            {nameOf(m.from)}
                          </span>
                        </td>
                        <td>
                          <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                            <SchoolArt file={logoOf(m.to)} size={18} />
                            <span style={{ color: m.to === mine ? 'var(--accent)' : undefined }}>
                              {nameOf(m.to)}
                            </span>
                          </span>
                        </td>
                        <td><Meta>{label(m.toSeason)}</Meta></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {moves.length > 400 ? (
                  <div className="card-pad">
                    <Meta color="var(--ink4)">
                      SHOWING THE FIRST 400 OF {moves.length.toLocaleString()} — NARROW IT WITH THE SEARCH
                    </Meta>
                  </div>
                ) : null}
              </Card>
            )}

            {(view?.paths.length ?? 0) ? (
              <Card className="card-pad">
                <Kicker>Two schools or more</Kicker>
                <div className="col" style={{ gap: 7, marginTop: 9 }}>
                  {(view?.paths ?? [])
                    .filter((p) => scope === 'all' || p.stops.some((s) => s.team === mine))
                    .slice(0, 60)
                    .map((p) => (
                      <div key={p.key} className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ minWidth: 190 }}>{p.first} {p.last}</span>
                        <Meta>{p.position}</Meta>
                        {p.stops.map((s, i) => (
                          <span key={i} className="row" style={{ gap: 5, alignItems: 'center' }}>
                            {i ? <Meta color="var(--ink4)">→</Meta> : null}
                            <SchoolArt file={logoOf(s.team)} size={16} />
                            <Meta color={s.team === mine ? 'var(--accent)' : undefined}>
                              {nameOf(s.team)} · {label(s.season)}
                            </Meta>
                          </span>
                        ))}
                      </div>
                    ))}
                </div>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </>
  )
}
