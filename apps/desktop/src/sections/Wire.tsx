import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { Btn, Card, Empty, HeatMeter, Kicker, Meta, SectionHeader, Tab } from '../ui'
import type { Story } from '../model'

export default function Wire() {
  const { state, dispatch, d, sem } = useStore()
  const [mode, setMode] = useState<'stories' | 'reel'>('stories')

  const stories = useMemo(
    () => d.stories.slice().sort((a, b) => b.week - a.week || b.time.localeCompare(a.time)),
    [d.stories],
  )
  const critical = state.heat >= sem.heat.threshold

  const approve = (s: Story) => {
    dispatch({ type: 'story', id: s.id, status: 'approved' })
    dispatch({
      type: 'queue/add',
      item: {
        type: 'STORY',
        title: s.headline,
        detail: s.effect?.label ?? 'Story acknowledged',
        origin: 'desktop',
        apply: { kind: 'noop' },
      },
    })
  }

  return (
    <>
      <SectionHeader
        title="The Wire"
        sub={<Meta>WEEK {state.week} · {d.userTeam.wins}–{d.userTeam.losses} · RANK {d.userTeam.rank}</Meta>}
        right={
          <div className="row" style={{ gap: 20, alignItems: 'flex-end' }}>
            <div className="subtabs">
              <Tab on={mode === 'stories'} onClick={() => setMode('stories')}>Stories</Tab>
              <Tab on={mode === 'reel'} onClick={() => setMode('reel')}>Reel</Tab>
            </div>
            <HeatMeter heat={state.heat} threshold={sem.heat.threshold} />
          </div>
        }
      />

      {critical ? (
        <Card
          className="card-pad"
          style={{ borderColor: 'var(--accent)', background: 'var(--heatBoxBg)', marginBottom: 12 }}
        >
          <Kicker>Critical — heat {state.heat}</Kicker>
          <div className="body-serif" style={{ marginTop: 5 }}>
            Past the threshold. Compliance is looking at the program. The next mishandled contact
            triggers a portal-board event and a pending penalty.
          </div>
        </Card>
      ) : null}

      {mode === 'reel' ? (
        <Card className="card-pad">
          <Empty>captures from your PC land here</Empty>
        </Card>
      ) : (
        <div className="col" style={{ gap: 10, maxWidth: 720 }}>
          {stories.map((s) => {
            const dismissed = s.status === 'dismissed'
            return (
              <Card
                key={s.id}
                className="card-pad fade-in"
                style={{ opacity: dismissed ? 0.45 : 1 }}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <Kicker>{s.kicker}</Kicker>
                  <Meta size={9}>WK {s.week} · {s.time}</Meta>
                </div>

                <h2 className="hero-headline" style={{ marginTop: 6 }}>{s.headline}</h2>
                <p className="body-serif" style={{ marginTop: 7, marginBottom: 0 }}>{s.body}</p>

                {s.effect && s.status === 'open' ? (
                  <>
                    <div className="effect" style={{ marginTop: 12 }}>{s.effect.label}</div>
                    <div className="row" style={{ gap: 8, marginTop: 11 }}>
                      <Btn variant="primary" style={{ flex: 1 }} onClick={() => approve(s)}>Approve</Btn>
                      <Btn style={{ flex: 1 }} onClick={() => dispatch({ type: 'story', id: s.id, status: 'dismissed' })}>
                        Dismiss
                      </Btn>
                    </div>
                  </>
                ) : null}

                {s.status === 'approved' ? (
                  <div className="mono" style={{ marginTop: 11, color: 'var(--good)', fontSize: 9.5, letterSpacing: 1.4 }}>
                    ✓ APPROVED — IN QUEUE
                  </div>
                ) : null}
                {dismissed ? (
                  <div className="mono" style={{ marginTop: 11, color: 'var(--ink4)', fontSize: 9.5, letterSpacing: 1.4 }}>
                    ✕ DISMISSED
                  </div>
                ) : null}
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
