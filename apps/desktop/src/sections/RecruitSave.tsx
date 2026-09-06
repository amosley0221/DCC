import { useCallback, useMemo, useState } from 'react'
import { indexArt, rosterPatch, useSave } from '../saveStore'
import { Btn, Card, Chip, Empty, Input, Kicker, Meta, PlayerFace, SchoolArt, SectionHeader, Tab } from '../ui'
import { useOps, useStore } from '../store'
import type { RecruitBoard, RosterPlayer } from '../../electron/saveAnalysis'
import { COMMIT_MAX, INTEREST_MAX, RECRUIT_STAGES, STAGE_LABEL } from '../../electron/recruiting'

/**
 * The schools worth showing on a row: the one he picked, or the three still in
 * it.
 *
 * A hard commit or a signature settles it, so showing the field there would be
 * noise — the interest behind a committed recruit is last week's race. A soft
 * commit keeps all three, because that is the recruit worth looking at twice.
 */
const leaders = (board: RecruitBoard | null): string[] => {
  const ranked = [...(board?.topSchools ?? [])].sort((a, b) => b.interest - a.interest)
  if (!ranked.length) return []
  return board!.stage === 'HardCommitted' || board!.stage === 'Signed'
    ? [ranked[0].school]
    : ranked.slice(0, 3).map((s) => s.school)
}

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

  // The board the game itself shows: rank, stage and how close they are to
  // committing. Keyed by the player's row, which is how the record names them.
  const board = useMemo(
    () => new Map((save.roster?.recruitBoard ?? []).map((b) => [b.playerIndex, b])),
    [save.roster],
  )

  /** A school's mark, by the same fallbacks the rest of the app uses. */
  const crest = useCallback(
    (school: string) => save.schoolArt[`${school}|logoLight`] ?? save.schoolArt[`${school}|icon`],
    [save.schoolArt],
  )

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
      // National rank first, because the game puts it on its own board — it
      // gives nothing away that the game keeps back. Where the save has no
      // record for a prospect the old order stands: ordering by a hidden
      // overall would give it away, so it is stars then name, which is public.
      .sort((a, b) => {
        const ra = board.get(a.index)?.nationalRank, rb = board.get(b.index)?.nationalRank
        if (ra && rb) return ra - rb
        if (ra) return -1
        if (rb) return 1
        return state.revealAllRecruits
          ? b.stars - a.stars || b.overall - a.overall
          : b.stars - a.stars || (a.last + a.first).localeCompare(b.last + b.first)
      })
  }, [pool, group, query, stars, state.revealAllRecruits, board])

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
            board={board.get(p.index) ?? null}
            crest={crest}
            onSaved={() => void load()}
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
  { p, board, crest, open, onClick, ratingNames, face, shown, onReveal, onSaved }:
  {
    p: RosterPlayer; board: RecruitBoard | null
    crest: (school: string) => string | undefined
    open: boolean; onClick: () => void; ratingNames: string[]; face?: string
    shown: boolean; onReveal: () => void; onSaved: () => void
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
        <span style={{ width: 38, textAlign: 'right', color: 'var(--ink3)', fontSize: 12 }}>
          {board ? `#${board.nationalRank}` : ''}
        </span>
        <PlayerFace file={face} first={p.first} last={p.last} />
        <span style={{ width: 34, color: 'var(--ink3)', fontSize: 12 }}>{p.position}</span>
        <span style={{ width: 46, color: 'var(--accent)', fontSize: 11, letterSpacing: -1 }}>
          {'★'.repeat(p.stars)}
        </span>
        <span style={{ flex: 1 }}>{p.first} {p.last}</span>
        <span style={{ color: 'var(--ink3)', fontSize: 12 }}>{p.archetype ?? ''}</span>
        {board ? (
          <span style={{ width: 104, textAlign: 'right', fontSize: 11, color: 'var(--ink3)' }}>
            {STAGE_LABEL[board.stage] ?? board.stage}
          </span>
        ) : null}
        <span className="row" style={{ gap: 3, width: 66, justifyContent: 'flex-end' }}>
          {leaders(board).map((school) => (
            <SchoolArt key={school} size={18} file={crest(school)} />
          ))}
        </span>
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
              ...(board ? [
                ['NATIONAL', `#${board.nationalRank}`],
                ['POSITION', `#${board.positionRank}`],
                ['STATE', `#${board.stateRank}`],
                ['COMMITMENT', `${Math.round(board.commitScore / 10.23)}%`],
                ['OFFERS', String(board.totalOffers)],
              ] as [string, string][] : []),
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
          {board?.topSchools.length ? (
            <RecruitBoardPanel p={p} board={board} onSaved={onSaved} />
          ) : null}
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

/**
 * The game's own board for one recruit: who is recruiting him, how hard, and
 * how close he is to signing — with the three of those DCC can write back.
 *
 * The ten schools are the list. A school can be moved up or down it, but not
 * added to it: the game decides who is on a recruit's list, and writing an
 * eleventh would mean pushing one off, which is its business rather than DCC's.
 */
function RecruitBoardPanel(
  { p, board, onSaved }: { p: RosterPlayer; board: RecruitBoard; onSaved: () => void },
) {
  const { save } = useSave()
  const { dispatch } = useStore()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [commit, setCommit] = useState<number | null>(null)
  const [stage, setStage] = useState<string | null>(null)
  const [interest, setInterest] = useState<Record<string, number>>({})

  const top = Math.max(1, ...board.topSchools.map((s) => s.interest))
  const dirty = (commit === null ? 0 : 1) + (stage === null ? 0 : 1) + Object.keys(interest).length

  const write = async () => {
    if (!save.path) return
    setBusy(true)
    const res = await window.dcc.writeRecruits(save.path, [{
      playerIndex: p.index,
      ...(commit === null ? {} : { commitScore: commit }),
      ...(stage === null ? {} : { stage }),
      ...(Object.keys(interest).length ? { interest } : {}),
    }])
    setBusy(false)
    dispatch({ type: 'log', line: { text: res.message, kind: res.ok ? 'good' : 'bad' } })
    if (res.ok) { setCommit(null); setStage(null); setInterest({}); setEditing(false); onSaved() }
  }

  return (
    <div className="col" style={{ gap: 6, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
      <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
        <Meta size={9} color="var(--ink4)">WHO IS RECRUITING HIM</Meta>
        <span style={{ marginLeft: 'auto' }}>
          <Btn size="sm" onClick={() => setEditing(!editing)}>
            {editing ? 'Done' : 'Change his recruitment'}
          </Btn>
        </span>
      </div>

      {/* Interest as a bar against the leader, because the raw number means
          nothing on its own — what matters is who is ahead and by how far. */}
      <div className="col" style={{ gap: 3 }}>
        {board.topSchools.map((s) => {
          const value = interest[s.school] ?? s.interest
          return (
            <div key={s.school} className="row" style={{ gap: 8, alignItems: 'center' }}>
              <span style={{ width: 150, fontSize: 12, color: 'var(--ink2)' }}>{s.school}</span>
              <span style={{ flex: 1, height: 6, background: 'var(--rule)', borderRadius: 3 }}>
                <span style={{
                  display: 'block', height: '100%', borderRadius: 3,
                  width: `${Math.round(100 * Math.min(1, value / top))}%`,
                  background: value === top ? 'var(--accent)' : 'var(--ink4)',
                }} />
              </span>
              {editing ? (
                <span style={{ width: 74 }}>
                  <Input value={String(value)} inputMode="numeric"
                    onChange={(e) => setInterest({
                      ...interest,
                      [s.school]: Math.max(0, Math.min(INTEREST_MAX, Number(e.target.value.replace(/[^0-9]/g, '')) || 0)),
                    })} />
                </span>
              ) : (
                <span style={{ width: 54, textAlign: 'right', fontSize: 12, color: 'var(--ink3)' }}>{s.interest}</span>
              )}
            </div>
          )
        })}
      </div>

      {editing ? (
        <div className="col" style={{ gap: 8, marginTop: 4 }}>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Meta size={9}>STAGE</Meta>
            {RECRUIT_STAGES.map((n) => (
              <Chip key={n} on={(stage ?? board.stage) === n} onClick={() => setStage(n)}>
                {STAGE_LABEL[n] ?? n}
              </Chip>
            ))}
          </div>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <Meta size={9}>COMMITMENT 0–{COMMIT_MAX}</Meta>
            <span style={{ width: 84 }}>
              <Input value={String(commit ?? board.commitScore)} inputMode="numeric"
                onChange={(e) => setCommit(
                  Math.max(0, Math.min(COMMIT_MAX, Number(e.target.value.replace(/[^0-9]/g, '')) || 0)),
                )} />
            </span>
            <Btn size="sm" variant="primary" disabled={busy || !dirty} onClick={() => void write()}>
              {busy ? 'Writing…' : `Write ${dirty} change${dirty === 1 ? '' : 's'} to the save`}
            </Btn>
          </div>
          <Meta size={9} color="var(--ink4)">
            A COPY OF THE SAVE IS KEPT FIRST, AND THE WRITE IS REFUSED UNLESS NOTHING BUT THESE FIELDS MOVED
          </Meta>
        </div>
      ) : null}
    </div>
  )
}
