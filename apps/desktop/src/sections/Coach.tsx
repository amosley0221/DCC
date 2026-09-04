import { useStore } from '../store'
import { Btn, Card, Kicker, Meta, SectionHeader, Stat } from '../ui'

export default function Coach() {
  const { dynasty, dispatch } = useStore()
  const c = dynasty.coach

  const exportPage = async () => {
    const text = [
      `# ${c.name} — career page`,
      '',
      `Record ${c.record.wins}–${c.record.losses} · ${c.titles} national titles · ${c.drafted} players drafted`,
      '',
      '## Timeline',
      ...c.timeline.map((t) => `- ${t.school} (${t.years}) — ${t.record}. ${t.note}`),
      '',
      '## Honors',
      ...c.honors.map((h) => `- [${h.tag}] ${h.text}`),
      '',
      '## Players drafted',
      ...c.draftPicks.map((p) => `- RD ${p.round} ${p.year} — ${p.name}, ${p.pos}`),
    ].join('\n')
    const path = await window.dcc.saveText('career-page.md', text)
    if (path) dispatch({ type: 'log', line: { text: `career page written — ${path}`, kind: 'good' } })
  }

  return (
    <>
      <SectionHeader
        title="Coach"
        sub={<Meta>ALL-TIME {c.record.wins}–{c.record.losses}</Meta>}
        right={<Btn onClick={exportPage}>Export career page</Btn>}
      />

      <div className="grid-3" style={{ maxWidth: 720, marginBottom: 14 }}>
        <Stat label="ALL-TIME RECORD" value={`${c.record.wins}–${c.record.losses}`} />
        <Stat label="NATIONAL TITLES" value={c.titles} color="var(--warn)" />
        <Stat label="PLAYERS DRAFTED" value={c.drafted} />
      </div>

      <div className="rail">
        <div className="col" style={{ gap: 12 }}>
          <Card className="card-pad">
            <Kicker>Career timeline</Kicker>
            <div className="col" style={{ gap: 11, marginTop: 10 }}>
              {c.timeline.map((t) => (
                <div key={t.school} className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 3, alignSelf: 'stretch', background: 'var(--accent)', borderRadius: 2 }} />
                  <div className="col" style={{ gap: 2 }}>
                    <span className="row-title" style={{ color: 'var(--ink)' }}>{t.school}</span>
                    <Meta size={10}>{t.years} · {t.record}</Meta>
                    <span className="body-serif">{t.note}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="card-pad">
            <Kicker>Players drafted</Kicker>
            <div className="col" style={{ gap: 7, marginTop: 10 }}>
              {c.draftPicks.map((p) => (
                <div key={p.name} className="row" style={{ gap: 10 }}>
                  <span
                    className="num"
                    style={{ width: 44, fontWeight: 600, color: p.round === 1 ? 'var(--warn)' : 'var(--ink3)' }}
                  >
                    RD {p.round}
                  </span>
                  <span className="row-title" style={{ flex: 1 }}>{p.name}</span>
                  <Meta size={10}>{p.pos} · {p.year}</Meta>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="col" style={{ gap: 12 }}>
          <Card className="card-pad">
            <Kicker>Honors</Kicker>
            <div className="col" style={{ gap: 8, marginTop: 10 }}>
              {c.honors.map((h) => (
                <div key={h.text} className="row" style={{ gap: 10 }}>
                  <span
                    className="mono"
                    style={{
                      width: 46, fontSize: 9, letterSpacing: 1.2, fontWeight: 600,
                      color: h.tag === 'CHAMP' ? 'var(--good)' : h.tag === 'MILE' ? 'var(--warn)' : 'var(--ink3)',
                    }}
                  >
                    {h.tag}
                  </span>
                  <span className="body-serif" style={{ flex: 1 }}>{h.text}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="card-pad" style={{ border: '1px dashed var(--accent)' }}>
            <Kicker>Off the books</Kicker>
            <div className="body-serif" style={{ marginTop: 6 }}>
              Every use posts a scandal-risk story to the Wire and adds heat. The agent asks for a second
              confirmation before it writes one of these.
            </div>
            <div className="row" style={{ gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
              {[
                { label: 'Bump a recruit +4 OVR', detail: 'Off-the-books rating boost' },
                { label: 'Clear a suspension', detail: 'Off-the-books eligibility edit' },
              ].map((b) => (
                <Btn
                  key={b.label}
                  size="sm"
                  onClick={() => {
                    dispatch({
                      type: 'queue/add',
                      item: {
                        type: 'OFFBOOKS', title: b.label, detail: b.detail,
                        origin: 'desktop', needsConfirm: true, apply: { kind: 'noop' },
                      },
                    })
                    dispatch({ type: 'heat', delta: 3 })
                  }}
                >
                  {b.label}
                </Btn>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
