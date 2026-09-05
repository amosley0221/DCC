import { useMemo, useState } from 'react'
import { useSave } from '../saveStore'
import { useStore } from '../store'
import { Btn, Card, Input, Kicker, Meta, PlayerFace, SchoolArt, Tab } from '../ui'
import type { RosterPlayer } from '../../electron/saveAnalysis'

const TABS = ['PROFILE', 'RATINGS'] as const
type TabName = (typeof TABS)[number]

/** The rating groups, in the order a player card reads them. */
const GROUPS: [string, string[]][] = [
  ['PHYSICAL', ['Speed', 'Acceleration', 'Agility', 'ChangeOfDirection', 'Strength', 'Jumping', 'Stamina', 'Injury', 'Toughness', 'Awareness']],
  ['PASSING', ['ThrowPower', 'ShortThrowAccuracy', 'MediumThrowAccuracy', 'DeepThrowAccuracy', 'ThrowOnTheRun', 'PlayAction', 'BreakSack']],
  ['BALL CARRIER', ['Carrying', 'BreakTackle', 'Trucking', 'StiffArm', 'SpinMove', 'JukeMove', 'BCVision']],
  ['RECEIVING', ['Catching', 'CatchInTraffic', 'SpectacularCatch', 'ShortRouteRunning', 'MediumRouteRunning', 'DeepRouteRunning', 'Release']],
  ['BLOCKING', ['PassBlocking', 'PassBlockPower', 'PassBlockFinesse', 'RunBlocking', 'RunBlockPower', 'RunBlockFinesse', 'LeadBlock', 'ImpactBlocking']],
  ['DEFENSE', ['Tackling', 'HitPower', 'PowerMoves', 'FinesseMoves', 'BlockShedding', 'Pursuit', 'PlayRecognition', 'ManCoverage', 'ZoneCoverage', 'Press']],
  ['KICKING', ['KickPower', 'KickAccuracy', 'KickReturn']],
]

const ovrColour = (o: number) =>
  o >= 90 ? 'var(--accent)' : o >= 80 ? 'var(--good)' : o >= 70 ? 'var(--ink)' : 'var(--ink3)'
const height = (i: number) => (i ? `${Math.floor(i / 12)}' ${i % 12}"` : '—')

/**
 * One player, opened from the roster.
 *
 * The edit side offers exactly the fields DCC can place in the record and no
 * others: the overall, the 52 ratings whose bits are known, the redshirt flag
 * and the NIL figure. A field DCC cannot place is not offered as an empty box,
 * because a box that does nothing is worse than no box — and a wrong bit lands
 * in a neighbouring field. What is still undecoded is listed at the bottom so
 * the gap is visible rather than implied.
 */
export default function PlayerSheet({ player, teamName, onClose, onSaved }: {
  player: RosterPlayer; teamName: string | null; onClose: () => void; onSaved: () => void
}) {
  const { save } = useSave()
  const { dispatch } = useStore()
  const [tab, setTab] = useState<TabName>('PROFILE')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, number>>({})
  const [redshirt, setRedshirt] = useState<boolean | null>(null)
  const [nilK, setNilK] = useState<number | null>(null)

  const logo = teamName
    ? save.schoolArt[`${teamName}|logoLight`] ?? save.schoolArt[`${teamName}|icon`]
    : undefined

  const placed = useMemo(() => new Set(Object.keys(player.ratings)), [player.ratings])
  const dirty = Object.keys(edits).length + (redshirt === null ? 0 : 1) + (nilK === null ? 0 : 1)

  const valueOf = (k: string) => edits[k] ?? player.ratings[k] ?? 0

  const commit = async () => {
    if (!save.path) return
    setBusy(true)
    setNote(null)
    const { overall, ...ratings } = edits
    const res = await window.dcc.writePlayers(save.path, [{
      index: player.index,
      ...(overall !== undefined ? { overall } : {}),
      ...(Object.keys(ratings).length ? { ratings } : {}),
      ...(redshirt !== null ? { redshirt } : {}),
      ...(nilK !== null ? { nilK } : {}),
    }], save.roster?.count ?? 0)
    setBusy(false)
    setNote(res.message)
    dispatch({ type: 'log', line: { text: res.message, kind: res.ok ? 'good' : 'bad' } })
    if (res.ok) { setEdits({}); setRedshirt(null); setNilK(null); setEditing(false); onSaved() }
  }

  const field = (label: string, value: React.ReactNode) => (
    <div className="row" key={label} style={{ gap: 10, alignItems: 'baseline', borderTop: '1px solid var(--line)', padding: '6px 0' }}>
      <Meta size={9} color="var(--ink4)">{label}</Meta>
      <span style={{ marginLeft: 'auto', color: 'var(--ink)', fontSize: 13 }}>{value}</span>
    </div>
  )

  return (
    <Card className="card-pad" style={{ borderColor: 'var(--accent)' }}>
      <div className="row" style={{ gap: 14, alignItems: 'center' }}>
        <PlayerFace file={save.facePaths[player.assetId]} first={player.first} last={player.last} size={72} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 9, alignItems: 'center' }}>
            <h2 className="headline" style={{ fontSize: 21 }}>{player.first} {player.last}</h2>
            <SchoolArt size={20} file={logo} />
          </div>
          <div style={{ marginTop: 3 }}>
            <Meta size={10}>
              {[player.position, player.classYear, height(player.heightIn),
                player.weightLb ? `${player.weightLb} lbs` : null, player.hometown]
                .filter(Boolean).join(' · ')}
            </Meta>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="num" style={{ fontSize: 34, color: ovrColour(player.overall) }}>{player.overall}</div>
          <Meta size={9} color="var(--ink4)">OVERALL</Meta>
        </div>
        <button className="gs-close" onClick={onClose}>Close ✕</button>
      </div>

      <div className="row" style={{ gap: 12, marginTop: 14, alignItems: 'baseline' }}>
        <div className="subtabs">
          {TABS.map((t) => <Tab key={t} on={tab === t} onClick={() => setTab(t)}>{t}</Tab>)}
        </div>
        <span style={{ marginLeft: 'auto' }}>
          <Btn onClick={() => { setEditing(!editing); setTab('RATINGS') }}>
            {editing ? 'Stop editing' : 'Edit'}
          </Btn>
        </span>
      </div>

      {tab === 'PROFILE' ? (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0 24px' }}>
          <div>
            <Kicker>Player profile</Kicker>
            {field('Class', player.classYear ?? '—')}
            {field('Height', height(player.heightIn))}
            {field('Weight', player.weightLb ? `${player.weightLb} lb` : '—')}
            {field('Archetype', player.archetype ?? '—')}
            {field('Development', player.devTrait ?? '—')}
            {field('Redshirt', player.redshirt ? 'Yes' : 'No')}
            {field('Hometown', player.hometown || '—')}
            {field('Home state', player.homeState ?? '—')}
          </div>
          <div>
            <Kicker>Recruiting</Kicker>
            {field('Stars', player.stars ? '★'.repeat(player.stars) : '—')}
            {field('NIL', player.nilK > 0 ? `$${player.nilK}K` : '—')}
            {field('Pipeline', player.pipeline ?? '—')}
            {field('Dealbreaker', player.dealbreaker ?? '—')}
            {field('Ideal pitch', player.idealPitch ?? '—')}
            <div style={{ marginTop: 14 }}>
              <Meta size={9} color="var(--ink4)">
                NOT DECODED OUT OF THE SAVE YET — JERSEY NUMBER, AGE, PERSONALITY, SCHEME, ROLE,
                SKILL POINTS, XP, IMPACT PLAYER, SKILL GROUP CAPS, SEASON STATISTICS. THEY ARE NOT
                SHOWN RATHER THAN SHOWN WRONG.
              </Meta>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          {editing ? (
            <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              <Meta size={9} color={dirty ? 'var(--warn)' : 'var(--ink4)'}>
                {dirty ? `${dirty} CHANGED — NOTHING WRITTEN YET` : 'NOTHING CHANGED'}
              </Meta>
              <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                <Meta size={9}>REDSHIRT</Meta>
                <Btn size="sm" onClick={() => setRedshirt(!(redshirt ?? player.redshirt))}>
                  {(redshirt ?? player.redshirt) ? 'Yes' : 'No'}
                </Btn>
              </span>
              <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                <Meta size={9}>NIL $K</Meta>
                <span style={{ width: 78 }}>
                  <Input value={String(nilK ?? player.nilK)} onChange={(e) => setNilK(Number(e.target.value) || 0)} />
                </span>
              </span>
              <Btn variant="primary" disabled={!dirty || busy} onClick={commit}>
                {busy ? 'Writing…' : 'Commit to the save'}
              </Btn>
              <Btn disabled={!dirty} onClick={() => { setEdits({}); setRedshirt(null); setNilK(null) }}>Discard</Btn>
            </div>
          ) : null}
          {note ? <div style={{ marginBottom: 10 }}><Meta size={9}>{note.toUpperCase()}</Meta></div> : null}

          <div className="row" style={{ gap: 10, alignItems: 'baseline', marginBottom: 8 }}>
            <Meta size={9} color="var(--ink4)">OVERALL</Meta>
            {editing ? (
              <span style={{ width: 64 }}>
                <Input value={String(edits.overall ?? player.overall)}
                  onChange={(e) => setEdits({ ...edits, overall: Number(e.target.value) || 0 })} />
              </span>
            ) : <span className="num" style={{ color: ovrColour(player.overall) }}>{player.overall}</span>}
          </div>

          {GROUPS.map(([group, keys]) => {
            const have = keys.filter((k) => placed.has(k))
            if (!have.length) return null
            return (
              <div key={group} style={{ marginTop: 14 }}>
                <Meta size={9} color="var(--ink4)">{group}</Meta>
                <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2px 18px' }}>
                  {have.map((k) => (
                    <div key={k} className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <Meta size={9}>{k.replace(/([A-Z])/g, ' $1').trim()}</Meta>
                      </span>
                      {editing ? (
                        <span style={{ width: 58 }}>
                          <Input value={String(valueOf(k))}
                            onChange={(e) => setEdits({ ...edits, [k]: Number(e.target.value) || 0 })} />
                        </span>
                      ) : (
                        <span className="num" style={{ color: ovrColour(player.ratings[k]) }}>{player.ratings[k]}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
