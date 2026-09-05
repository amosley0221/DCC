import { useMemo, useState } from 'react'
import { indexArt, rosterPatch, useSave } from '../saveStore'
import { Btn, Card, Chip, Empty, Input, Kicker, Meta, PlayerFace, SectionHeader, Tab } from '../ui'
import { useOps, useStore } from '../store'
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
 * Everyone off a roster lands in one pool, and that pool is not the recruiting
 * class: it also holds players who have left, transferred, graduated or been
 * drafted. Those are the ones that put Malachi Toney at 99 and Jadan Baugh at
 * 95 on top of a recruiting list.
 *
 * The art the save names for each player separates them. Recruits are
 * generated and carry a `Generic_` face; real players carry an authored
 * `Unique_` one. Checked against a class list from the same save: 28 confirmed
 * recruits all generated, 10 confirmed non-recruits all authored, no errors.
 *
 * Two generated players still rate above the best real recruit in that save —
 * 89 and 86 against 83 — so a small residual remains, and a field that marks a
 * live recruit outright has been searched for without success. See
 * docs/SAVE-FORMAT.md.
 */
const KINDS = ['RECRUITS', 'LEFT THE ROSTER', 'EVERYONE'] as const
type Kind = (typeof KINDS)[number]
const isGenerated = (p: RosterPlayer) => p.assetId.startsWith('Generic_')
/** Generated, and carrying the flag the game's own prospect list agrees with. */
const isRecruit = (p: RosterPlayer) => isGenerated(p) && p.recruitFlag
const GROUPS: [string, string[]][] = [
  ['ALL', []],
  ['OFFENSE', ['QB', 'HB', 'FB', 'WR', 'TE']],
  ['LINE', ['LT', 'LG', 'C', 'RG', 'RT']],
  ['FRONT', ['LE', 'RE', 'DT']],
  ['LINEBACK', ['LOLB', 'MLB', 'ROLB']],
  ['SECONDARY', ['CB', 'FS', 'SS']],
  ['SPECIAL', ['K', 'P']],
]

const ovrColour = (o: number) =>
  o >= 90 ? 'var(--accent)' : o >= 80 ? 'var(--good)' : o >= 70 ? 'var(--ink)' : 'var(--ink3)'

export default function RecruitSave() {
  const { save, patch } = useSave()
  const { state, dispatch } = useStore()
  const ops = useOps()

  const pickFaces = async () => {
    const dir = await window.dcc.pickFaces()
    if (!dir || !save.roster) return
    patch({ facesBusy: true })
    const art = await indexArt(dir, save.roster)
    patch({ facesBusy: false })
    if (!art.ok) {
      dispatch({ type: 'log', line: { text: art.message, kind: 'bad' } })
      return
    }
    patch(art.patch)
    // Remembered, so the folder is chosen once rather than on every launch.
    dispatch({ type: 'artPath', path: dir })
    dispatch({ type: 'log', line: {
      text: `matched ${art.matched.toLocaleString()} of ${art.players.toLocaleString()} players to faces` +
        `, and ${art.schools} of ${save.roster.schools.length} schools to logos`,
      kind: art.matched ? 'good' : 'bad',
    } })
  }
  const [group, setGroup] = useState('ALL')
  const [stars, setStars] = useState<number | null>(null)
  const [kind, setKind] = useState<Kind>('RECRUITS')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<number | null>(null)

  const unrostered = useMemo(
    () => (save.roster?.players ?? []).filter((p) => p.team === UNASSIGNED),
    [save.roster],
  )
  const counts = useMemo(() => {
    const rec = unrostered.filter(isRecruit).length
    return { rec, other: unrostered.length - rec }
  }, [unrostered])
  const pool = useMemo(() => (
    kind === 'RECRUITS' ? unrostered.filter(isRecruit)
    : kind === 'LEFT THE ROSTER' ? unrostered.filter((p) => !isRecruit(p))
    : unrostered
  ), [unrostered, kind])

  // Scouting is a mechanic, so an unscouted recruit's overall stays hidden.
  const revealed = useMemo(() => new Set(state.revealedRecruits), [state.revealedRecruits])
  const isShown = (p: RosterPlayer) => state.revealAllRecruits || revealed.has(p.playerId)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const want = GROUPS.find(([g]) => g === group)?.[1] ?? []
    return pool
      .filter((p) => (want.length === 0 || want.includes(p.position)) &&
        (stars === null || p.stars === stars) &&
        (!q || `${p.first} ${p.last} ${p.hometown} ${p.homeState ?? ''} ${p.pipeline ?? ''} ` +
          `${p.archetype ?? ''} ${p.position}`.toLowerCase().includes(q)))
      // Ordering by a hidden overall would give it away — the top of the list
      // would be the best players whether or not their number is on screen. With
      // overalls hidden the order is stars then name, which is public knowledge.
      .sort((a, b) => (state.revealAllRecruits
        ? b.stars - a.stars || b.overall - a.overall
        : b.stars - a.stars || (a.last + a.first).localeCompare(b.last + b.first)))
  }, [pool, group, query, stars, state.revealAllRecruits])

  const load = async () => {
    if (!save.path) return
    patch({ rosterBusy: true })
    const res = await window.dcc.roster(save.path, state.teamId)
    patch({ rosterBusy: false })
    if (res.ok) {
      patch({ roster: rosterPatch(res) })
      dispatch({ type: 'log', line: { text: `read ${res.count.toLocaleString()} players from the save`, kind: 'good' } })
    }
  }

  const header = (
    <SectionHeader
      title="Recruiting"
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
    {/* The list is the page; everything that narrows it sits in the rail. */}
    <div className="rail">
    <Card className="card-pad">
      {ops ? (
      <p className="body-serif" style={{ marginTop: 0, marginBottom: 12 }}>
        {counts.rec.toLocaleString()} recruits, out of {unrostered.length.toLocaleString()} players
        on none of the 138 rosters — the other {counts.other.toLocaleString()} have left or are in
        the pool for some other reason. Two things separate them: recruits are generated by the
        game, so the save names them a generated face, and they carry a flag the game's own
        prospect list agrees with. Checked against that list — the 28 recruits and 10 departed
        players in it all sort correctly, the best eight here are its best eight, and the count
        lands within a handful of the game's own. Star rating, class and commitment are still
        unreadable, so they are absent rather than invented.
      </p>
      ) : null}

      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {KINDS.map((k) => (
          <Tab key={k} on={kind === k} onClick={() => setKind(k)}>{k}</Tab>
        ))}
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
            shown={isShown(p)}
            onReveal={() => dispatch({ type: 'revealRecruit', playerId: p.playerId })}
            onClick={() => setOpen(open === p.index ? null : p.index)} />
        ))}
      </div>

      {shown.length > 300 && (
        <div style={{ marginTop: 8 }}>
          <Meta>Showing the top 300 — narrow the search to see further down.</Meta>
        </div>
      )}
    </Card>

    <div className="col" style={{ gap: 12 }}>
      <Card className="card-pad">
        <Kicker>Narrow the pool</Kicker>
      <div className="row" style={{ gap: 8, marginTop: 9, alignItems: 'baseline', flexWrap: 'wrap' }}>
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

      <div className="row" style={{ gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
        {GROUPS.map(([g]) => (
          <Tab key={g} on={group === g} onClick={() => setGroup(g)}>{g}</Tab>
        ))}
      </div>

      <div className="row" style={{ gap: 6, marginTop: 9, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <Chip on={state.revealAllRecruits} accent
          onClick={() => dispatch({ type: 'revealAllRecruits', on: !state.revealAllRecruits })}>
          {state.revealAllRecruits ? 'OVERALLS SHOWN' : 'OVERALLS HIDDEN'}
        </Chip>
        {!state.revealAllRecruits && revealed.size > 0 ? (
          <Meta size={9}>{revealed.size} SCOUTED</Meta>
        ) : null}
      </div>

      <div className="row" style={{ gap: 6, marginTop: 9, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <Chip on={stars === null} onClick={() => setStars(null)}>ALL STARS</Chip>
        {[5, 4, 3, 2, 1].map((n) => (
          <Chip key={n} on={stars === n} onClick={() => setStars(stars === n ? null : n)}>
            {n}★ {pool.filter((p) => p.stars === n).length.toLocaleString()}
          </Chip>
        ))}
      </div>

      <div style={{ marginTop: 9 }}>
        <Input placeholder="search name, town, state, pipeline or archetype"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      </Card>
    </div>
    </div>
    </>
  )
}

function RecruitRow(
  { p, open, onClick, ratingNames, face, shown, onReveal }:
  {
    p: RosterPlayer; open: boolean; onClick: () => void; ratingNames: string[]; face?: string
    shown: boolean; onReveal: () => void
  },
) {
  return (
    <div>
      <button className="row" onClick={onClick}
        style={{
          gap: 10, width: '100%', textAlign: 'left', padding: '5px 8px',
          background: open ? 'var(--rule)' : 'transparent',
          border: 0, borderRadius: 4, cursor: 'pointer', alignItems: 'center',
        }}>
        <PlayerFace file={face} first={p.first} last={p.last} />
        <span style={{ width: 34, color: 'var(--ink3)', fontSize: 12 }}>{p.position}</span>
        <span style={{ width: 46, color: 'var(--accent)', fontSize: 11, letterSpacing: -1 }}>
          {'★'.repeat(p.stars)}
        </span>
        <span style={{ flex: 1 }}>{p.first} {p.last}</span>
        <span style={{ color: 'var(--ink3)', fontSize: 12 }}>{p.archetype ?? ''}</span>
        <span style={{ width: 150, textAlign: 'right', color: 'var(--ink3)', fontSize: 12 }}>
          {p.hometown}{p.homeState ? `, ${p.homeState}` : ''}
        </span>
        <span style={{
          width: 30, textAlign: 'right', fontWeight: 600,
          color: shown ? ovrColour(p.overall) : 'var(--ink3)',
        }}>
          {shown ? p.overall : '––'}
        </span>
      </button>
      {open && (
        <div className="col" style={{ gap: 8, padding: '6px 8px 10px 44px' }}>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {([
              ['CLASS', p.classYear],
              ['DEV', p.devTrait],
              ['HEIGHT', `${Math.floor(p.heightIn / 12)}'${p.heightIn % 12}"`],
              ['WEIGHT', `${p.weightLb} lb`],
              ['PIPELINE', p.pipeline],
              ['NIL', `$${p.nilK}K`],
              ['DEALBREAKER', p.dealbreaker],
              ['PITCH', p.idealPitch],
            ] as [string, string | null][]).map(([k, v]) => v == null ? null : (
              <Chip key={k} on={false}>
                <span style={{ color: 'var(--ink3)' }}>{k}</span> {v}
              </Chip>
            ))}
          </div>
          {shown ? (
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              {ratingNames.map((n) => {
                const v = p.ratings[n]
                return v === undefined ? null : (
                  <Chip key={n} on={false}>
                    <span style={{ color: 'var(--ink3)' }}>{n}</span> {v}
                  </Chip>
                )
              })}
            </div>
          ) : (
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <Btn size="sm" onClick={onReveal}>Scout {p.first} {p.last}</Btn>
              <Meta size={9}>OVERALL AND ALL RATINGS ARE IN THE SAVE — THIS ONLY DECIDES WHETHER YOU SEE THEM</Meta>
            </div>
          )}
          {shown ? (
            <div><Btn size="sm" onClick={onReveal}>Hide again</Btn></div>
          ) : null}
        </div>
      )}
    </div>
  )
}
