import { useState } from 'react'
import { useDynasty } from '../store'
import { Btn, Card, Empty, Kicker, Meta, SectionHeader, Tab, Toggle, Track } from '../ui'

const STEPS = ['reading save…', 'resolving roster…', 'scrubbing identities…', 'mapping archetypes…', 'writing file…']

export default function Export() {
  const { dynasty, dispatch, d } = useDynasty()
  const [tab, setTab] = useState<'DRAFT CLASS' | 'PLAY NOW ROSTER'>('DRAFT CLASS')
  const [step, setStep] = useState(-1)
  const [result, setResult] = useState<string | null>(null)

  const [earlyDeclares, setEarlyDeclares] = useState(true)
  const [scrub, setScrub] = useState(true)
  const [mapArchetypes, setMapArchetypes] = useState(true)
  const [combine, setCombine] = useState(false)

  const [useDepth, setUseDepth] = useState(true)
  const [includeInjured, setIncludeInjured] = useState(false)
  const [freeze, setFreeze] = useState(true)
  const [springMode, setSpringMode] = useState(false)

  const roster = d.rosterOf(dynasty.meta.userTeamId)
  const departing = roster.filter((p) => p.year === 'SR' || (earlyDeclares && p.ovr >= 88 && p.year === 'JR'))

  const scrubbed = (name: string) => {
    const [first, ...rest] = name.split(' ')
    return scrub ? `${first[0]}. ${rest.join(' ')}`.toUpperCase() : name.toUpperCase()
  }

  const run = async () => {
    setResult(null)
    // The export never touches the dynasty save; it only reads it.
    for (let i = 0; i < STEPS.length; i++) {
      setStep(i)
      await new Promise((r) => setTimeout(r, 320))
    }
    setStep(-1)
    const body = tab === 'DRAFT CLASS'
      ? [
          `# Draft class — ${dynasty.meta.season}`,
          '',
          'player,pos,ovr,year,archetype,round,exports_as',
          ...departing.map((p, i) =>
            `${p.name},${p.pos},${p.ovr},${p.year},${mapArchetypes ? p.archetype : '-'},${i < 3 ? 1 : i < 8 ? 2 : Math.min(7, 3 + (i % 5))},${scrubbed(p.name)}`),
          '',
          combine ? '# combine estimates included' : '# combine estimates omitted',
        ].join('\n')
      : [
          `# Play Now roster — ${d.userTeam.name}, week ${dynasty.meta.currentWeek}`,
          // The options ride along in the header so the file records how the
          // snapshot was taken.
          `# depth chart as played: ${useDepth} · include injured: ${includeInjured} ·` +
            ` progression frozen: ${freeze} · spring training: ${springMode}`,
          '',
          'player,pos,depth,ovr,year,dev',
          ...roster
            .filter((p) => !springMode || p.year !== 'SR')
            .map((p) => `${p.name},${p.pos},${useDepth ? p.depth : '-'},${p.ovr},${p.year},${p.dev}`),
        ].join('\n')

    const name = tab === 'DRAFT CLASS' ? 'draft-class.csv' : 'play-now-roster.csv'
    const path = await window.dcc.saveText(name, body)
    if (path) {
      setResult(path)
      dispatch({ type: 'log', line: { text: `export written — ${path}`, kind: 'good' } })
    }
  }

  return (
    <>
      <SectionHeader
        title="Export"
        sub={<Meta>THE DYNASTY SAVE IS NEVER MODIFIED BY AN EXPORT</Meta>}
        right={
          <div className="subtabs">
            <Tab on={tab === 'DRAFT CLASS'} onClick={() => { setTab('DRAFT CLASS'); setResult(null) }}>Draft class → Madden</Tab>
            <Tab on={tab === 'PLAY NOW ROSTER'} onClick={() => { setTab('PLAY NOW ROSTER'); setResult(null) }}>Roster → Play Now</Tab>
          </div>
        }
      />

      <div className="rail">
        <Card style={{ overflow: 'hidden' }}>
          {tab === 'DRAFT CLASS' ? (
            <div style={{ maxHeight: 520, overflowY: 'auto' }}>
              <table className="tbl">
                <thead><tr><th>Player</th><th style={{ width: 44 }}>Pos</th><th style={{ width: 46 }}>OVR</th><th style={{ width: 66 }}>Year</th><th>Archetype</th><th style={{ width: 62 }}>Round</th><th>Exports as</th></tr></thead>
                <tbody>
                  {departing.map((p, i) => (
                    <tr key={p.id}>
                      <td><span className="row-title" style={{ color: 'var(--ink)' }}>{p.name}</span></td>
                      <td className="num">{p.pos}</td>
                      <td className="num" style={{ color: p.ovr >= 90 ? 'var(--ink)' : 'var(--ink2)' }}>{p.ovr}</td>
                      <td className="num">{p.year}</td>
                      <td><Meta size={10}>{mapArchetypes ? p.archetype : '—'}</Meta></td>
                      <td className="num" style={{ color: i < 3 ? 'var(--accent)' : 'var(--ink3)' }}>RD {i < 3 ? 1 : i < 8 ? 2 : Math.min(7, 3 + (i % 5))}</td>
                      <td><Meta size={10}>EXPORTS AS {scrubbed(p.name)}</Meta></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {departing.length === 0 ? <div className="card-pad"><Empty>nobody is departing yet</Empty></div> : null}
            </div>
          ) : (
            <div className="card-pad col" style={{ gap: 10 }}>
              <Kicker>Snapshot</Kicker>
              <div className="grid-3">
                <div><Meta size={9}>PLAYERS</Meta><div className="serif" style={{ fontSize: 24, fontWeight: 600 }}>{roster.filter((p) => !springMode || p.year !== 'SR').length}</div></div>
                <div><Meta size={9}>AVG OVR</Meta><div className="serif" style={{ fontSize: 24, fontWeight: 600 }}>{Math.round(roster.reduce((s, p) => s + p.ovr, 0) / Math.max(1, roster.length))}</div></div>
                <div><Meta size={9}>WEEK</Meta><div className="serif" style={{ fontSize: 24, fontWeight: 600 }}>{dynasty.meta.currentWeek}</div></div>
              </div>
              <Meta size={10}>
                Snapshots the live dynasty roster as a standalone roster file. Spring-training mode drops
                outgoing seniors so you scrimmage next year's team.
              </Meta>
            </div>
          )}
        </Card>

        <Card className="card-pad" style={{ position: 'sticky', top: 0 }}>
          <Kicker>Options</Kicker>
          <div className="col" style={{ gap: 4, marginTop: 9 }}>
            {tab === 'DRAFT CLASS' ? (
              <>
                <Toggle on={earlyDeclares} onChange={setEarlyDeclares} label="INCLUDE EARLY DECLARES" />
                <Toggle on={scrub} onChange={setScrub} label="SCRUB NAMES TO INITIALS" />
                <Toggle on={mapArchetypes} onChange={setMapArchetypes} label="MAP ARCHETYPES TO MADDEN" />
                <Toggle on={combine} onChange={setCombine} label="CARRY COMBINE ESTIMATES" />
              </>
            ) : (
              <>
                <Toggle on={useDepth} onChange={setUseDepth} label="USE DEPTH CHART AS PLAYED" />
                <Toggle on={includeInjured} onChange={setIncludeInjured} label="INCLUDE INJURED" />
                <Toggle on={freeze} onChange={setFreeze} label="FREEZE PROGRESSION AT TODAY" />
                <Toggle on={springMode} onChange={setSpringMode} label="SPRING-TRAINING MODE" />
              </>
            )}
          </div>

          <div style={{ marginTop: 14 }}>
            {step >= 0 ? (
              <div className="col" style={{ gap: 7 }}>
                <Meta color="var(--warn)">{STEPS[step]}</Meta>
                <Track value={step + 1} max={STEPS.length} fill="var(--warn)" />
              </div>
            ) : (
              <Btn variant="primary" style={{ width: '100%' }} onClick={run}>
                {tab === 'DRAFT CLASS' ? 'Export draft class' : 'Export roster'}
              </Btn>
            )}
          </div>

          {result ? (
            <div className="effect" style={{ marginTop: 12 }}>WROTE {result}</div>
          ) : null}

          <div style={{ marginTop: 12 }}>
            <Meta size={9}>GENERATED PLAYERS ONLY — NO REAL NAMES OR LIKENESSES</Meta>
          </div>
        </Card>
      </div>
    </>
  )
}
