import { useMemo, useState } from 'react'
import { useSave } from '../saveStore'
import { Btn, Card, Chip, Empty, Input, Kicker, Meta, SectionHeader, Tab } from '../ui'
import { useStore } from '../store'
import type { RosterPlayer } from '../../electron/saveAnalysis'

/**
 * The recruiting pool, read from the save.
 *
 * Every player the save does not put on a roster sits in one pool: the 138
 * schools hold exactly 85 each, and everyone left over is a recruit or in the
 * portal. Names, positions, hometowns and all 53 ratings are already readable
 * for them — the same players other dynasty trackers show, matched by name,
 * position and hometown against a live dynasty.
 *
 * What the save has not given up yet is the recruiting layer on top: star
 * rating, class, archetype, interest and commitment. Those are not guessed at
 * here. A column that is not known is absent rather than filled in.
 */
const UNASSIGNED = 255

/**
 * Who is actually a recruit.
 *
 * Everyone off a roster lands in one pool, and that pool is not all prospects:
 * it also holds real players who left — transferred, graduated, drafted. The
 * two are told apart by the art the save names for them. Recruits are
 * generated, so they carry a `Generic_` face; real players carry an authored
 * `Unique_` one. In a Penn State save that splits 4,527 generated from 180
 * real, and the real ones are why Malachi Toney at 99 and Jadan Baugh at 95
 * were sitting on top of a recruiting list.
 *
 * This is an inference from the asset id, not a class field read from the save
 * — the save's own class and recruiting stage are still unmapped — so the
 * screen says which group it is showing rather than presenting one as the
 * whole truth.
 */
const KINDS = ['PROSPECTS', 'LEFT THE ROSTER', 'EVERYONE'] as const
type Kind = (typeof KINDS)[number]
const isGenerated = (p: RosterPlayer) => p.assetId.startsWith('Generic_')
const GROUPS: [string, string[]][] = [
  ['ALL', []],
  ['OFFENCE', ['QB', 'HB', 'FB', 'WR', 'TE']],
  ['LINE', ['LT', 'LG', 'C', 'RG', 'RT']],
  ['FRONT', ['LE', 'RE', 'DT']],
  ['LINEBACK', ['LOLB', 'MLB', 'ROLB']],
  ['SECONDARY', ['CB', 'FS', 'SS']],
  ['SPECIAL', ['K', 'P']],
]

const ovrColour = (o: number) =>
  o >= 90 ? 'var(--accent)' : o >= 80 ? 'var(--good)' : o >= 70 ? 'var(--ink)' : 'var(--ink3)'

/** A face from the chosen art folder, or the initials while there is none. */
function Face({ file, first, last }: { file?: string; first: string; last: string }) {
  const initials = (first[0] ?? '') + (last[0] ?? '')
  const box: React.CSSProperties = {
    width: 30, height: 30, borderRadius: 4, flex: '0 0 auto',
    background: 'var(--rule)', objectFit: 'cover',
  }
  if (!file) {
    return (
      <span style={{ ...box, display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--ink3)' }}>
        {initials}
      </span>
    )
  }
  return <img style={box} alt="" loading="lazy"
    src={'dccart://art/' + file.split(/[\\/]/).map(encodeURIComponent).join('/')} />
}

export default function RecruitSave() {
  const { save, patch } = useSave()
  const { dispatch } = useStore()

  const pickFaces = async () => {
    const dir = await window.dcc.pickFaces()
    if (!dir || !save.roster) return
    patch({ facesBusy: true })
    const ids = save.roster.players.map((p) => p.assetId)
    const schools = save.roster.schools.map((s) => s.name)
    const res = await window.dcc.indexFaces(dir, ids, schools)
    patch({ facesBusy: false })
    if (!res.ok) {
      dispatch({ type: 'log', line: { text: res.message, kind: 'bad' } })
      return
    }
    patch({
      faces: {
        root: dir, files: res.files, bytes: res.bytes,
        matched: res.match.matched, players: res.match.players,
        sample: res.sample, unmatchedSample: res.match.unmatchedSample,
        byExtension: res.byExtension, dirs: res.dirs,
      },
      facePaths: res.paths,
      schoolArt: res.schoolArt.art,
      schoolArtMissing: res.schoolArt.missing,
    })
    dispatch({ type: 'log', line: {
      text: `matched ${res.match.matched.toLocaleString()} of ${res.match.players.toLocaleString()} players to faces` +
        `, and ${res.schoolArt.matched.length} of ${schools.length} schools to logos`,
      kind: res.match.matched ? 'good' : 'bad',
    } })
  }
  const [group, setGroup] = useState('ALL')
  const [kind, setKind] = useState<Kind>('PROSPECTS')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<number | null>(null)

  const unrostered = useMemo(
    () => (save.roster?.players ?? []).filter((p) => p.team === UNASSIGNED),
    [save.roster],
  )
  const counts = useMemo(() => {
    const gen = unrostered.filter(isGenerated).length
    return { gen, real: unrostered.length - gen }
  }, [unrostered])
  const pool = useMemo(() => (
    kind === 'PROSPECTS' ? unrostered.filter(isGenerated)
    : kind === 'LEFT THE ROSTER' ? unrostered.filter((p) => !isGenerated(p))
    : unrostered
  ), [unrostered, kind])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const want = GROUPS.find(([g]) => g === group)?.[1] ?? []
    return pool
      .filter((p) => (want.length === 0 || want.includes(p.position)) &&
        (!q || `${p.first} ${p.last} ${p.hometown} ${p.position}`.toLowerCase().includes(q)))
      .sort((a, b) => b.overall - a.overall)
  }, [pool, group, query])

  const load = async () => {
    if (!save.path) return
    patch({ rosterBusy: true })
    const res = await window.dcc.roster(save.path)
    patch({ rosterBusy: false })
    if (res.ok) {
      patch({ roster: { count: res.count, ratingNames: res.ratingNames, unverifiedPairs: res.unverifiedPairs, schools: res.schools, players: res.players } })
      dispatch({ type: 'log', line: { text: `read ${res.count.toLocaleString()} players from the save`, kind: 'good' } })
    }
  }

  const header = (
    <SectionHeader
      title="Recruit"
      sub={<Meta>{save.roster ? `${pool.length.toLocaleString()} IN THE POOL` : 'ROSTER NOT READ YET'}</Meta>}
    />
  )

  if (!save.roster) {
    return (
      <>
        {header}
        <Card className="card-pad">
          <Kicker>Recruiting pool</Kicker>
          <p className="body-serif" style={{ marginTop: 7 }}>
            Your recruits are in the save. Read it and they appear here.
          </p>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <Btn onClick={load} disabled={save.rosterBusy}>
              {save.rosterBusy ? 'Reading…' : 'Read the save'}
            </Btn>
          </div>
        </Card>
      </>
    )
  }

  if (!pool.length) {
    return (
      <>
        {header}
        <Card className="card-pad">
          <Kicker>Recruiting pool</Kicker>
          <Empty>This save has no unrostered players.</Empty>
        </Card>
      </>
    )
  }

  return (
    <>
    {header}
    <Card className="card-pad">
      <Kicker>Recruiting pool — from your save</Kicker>
      <p className="body-serif" style={{ marginTop: 7 }}>
        {unrostered.length.toLocaleString()} players are on none of the 138 rosters, and they are
        not all prospects. {counts.gen.toLocaleString()} are generated players — the recruits —
        and {counts.real.toLocaleString()} are real players who left your rosters, which is why
        names like Malachi Toney and Jadan Baugh turn up here. They are told apart by the face the
        save names for each: generated players get a <code>Generic_</code> one, real players an
        authored <code>Unique_</code> one. The save's own class and recruiting stage are still
        unmapped, so nothing here is a reading of them.
      </p>

      <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {KINDS.map((k) => (
          <Tab key={k} on={kind === k} onClick={() => setKind(k)}>{k}</Tab>
        ))}
      </div>

      <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <Btn onClick={pickFaces} disabled={save.facesBusy}>
          {save.facesBusy ? 'Indexing…' : save.faces ? 'Change the art folder' : 'Choose the art folder'}
        </Btn>
        <Meta>
          {save.faces
            ? `${save.faces.matched.toLocaleString()} of ${save.faces.players.toLocaleString()} players matched a face` +
              ` — ${save.faces.files.toLocaleString()} images indexed`
            : 'Point DCC at a folder of extracted art and the faces appear — the save names each one.'}
        </Meta>
      </div>

      <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {GROUPS.map(([g]) => (
          <Tab key={g} on={group === g} onClick={() => setGroup(g)}>{g}</Tab>
        ))}
      </div>

      <div style={{ marginTop: 10 }}>
        <Input placeholder="search name, hometown or position"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div style={{ marginTop: 8 }}>
        <Meta>
          {shown.length.toLocaleString()} shown{shown.length !== pool.length ? ` of ${pool.length.toLocaleString()}` : ''}
        </Meta>
      </div>

      <div className="col" style={{ gap: 2, marginTop: 8 }}>
        {shown.slice(0, 300).map((p) => (
          <RecruitRow key={p.index} p={p} open={open === p.index}
            ratingNames={save.roster!.ratingNames}
            face={save.facePaths[p.assetId]}
            onClick={() => setOpen(open === p.index ? null : p.index)} />
        ))}
      </div>

      {shown.length > 300 && (
        <div style={{ marginTop: 8 }}>
          <Meta>Showing the top 300 — narrow the search to see further down.</Meta>
        </div>
      )}
    </Card>
    </>
  )
}

function RecruitRow(
  { p, open, onClick, ratingNames, face }:
  { p: RosterPlayer; open: boolean; onClick: () => void; ratingNames: string[]; face?: string },
) {
  return (
    <div>
      <button className="row" onClick={onClick}
        style={{
          gap: 10, width: '100%', textAlign: 'left', padding: '5px 8px',
          background: open ? 'var(--rule)' : 'transparent',
          border: 0, borderRadius: 4, cursor: 'pointer', alignItems: 'center',
        }}>
        <Face file={face} first={p.first} last={p.last} />
        <span style={{ width: 34, color: 'var(--ink3)', fontSize: 12 }}>{p.position}</span>
        <span style={{ flex: 1 }}>{p.first} {p.last}</span>
        <span style={{ color: 'var(--ink3)', fontSize: 12 }}>{p.hometown}</span>
        <span style={{ width: 30, textAlign: 'right', color: ovrColour(p.overall), fontWeight: 600 }}>
          {p.overall}
        </span>
      </button>
      {open && (
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', padding: '6px 8px 10px 44px' }}>
          {ratingNames.map((n) => {
            const v = p.ratings[n]
            return v === undefined ? null : (
              <Chip key={n} on={false}>
                <span style={{ color: 'var(--ink3)' }}>{n}</span> {v}
              </Chip>
            )
          })}
        </div>
      )}
    </div>
  )
}
