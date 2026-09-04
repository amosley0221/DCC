import { useDynasty } from '../store'
import { Btn, Card, Empty, Kicker, Meta, SectionHeader, StateTag } from '../ui'

export default function Queue() {
  const { state, dispatch } = useDynasty()
  const held = state.queue.filter((q) => q.state === 'HELD')
  const blocked = state.gameRunning

  return (
    <>
      <SectionHeader
        title="Queue"
        sub={
          <Meta color={blocked ? 'var(--warn)' : 'var(--good)'}>
            {blocked
              ? 'GAME RUNNING ON PC — SAVE LOCKED, WRITES HELD'
              : 'SAVE UNLOCKED — WRITES CAN APPLY'}
          </Meta>
        }
        right={
          <div className="row" style={{ gap: 8 }}>
            {blocked ? (
              <Btn
                variant={held.length ? 'primary' : 'secondary'}
                disabled={!held.length}
                onClick={() => dispatch({ type: 'queue/applyAll' })}
              >
                Close game + apply all ({held.length})
              </Btn>
            ) : (
              <>
                <Btn
                  variant={held.length ? 'primary' : 'secondary'}
                  disabled={!held.length}
                  onClick={() => dispatch({ type: 'queue/applyAll' })}
                >
                  Apply all ({held.length})
                </Btn>
                <Btn onClick={() => dispatch({ type: 'game', running: true })}>Launch game</Btn>
              </>
            )}
          </div>
        }
      />

      <div className="rail-wide">
        <div className="col" style={{ gap: 8 }}>
          {state.queue.length === 0 ? (
            <Card className="card-pad"><Empty>nothing waiting — every edit you make lands here first</Empty></Card>
          ) : null}

          {state.queue.map((q) => (
            <Card key={q.id} className="card-pad fade-in">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row" style={{ gap: 9 }}>
                  <Kicker>{q.type}</Kicker>
                  {q.origin === 'android' ? <Meta size={9}>FROM ANDROID</Meta> : null}
                  {q.needsConfirm ? <Meta size={9} color="var(--accent)">NEEDS CONFIRM</Meta> : null}
                </div>
                <StateTag state={q.state} />
              </div>
              <div className="row-title" style={{ marginTop: 5, color: 'var(--ink)' }}>{q.title}</div>
              <div className="meta" style={{ marginTop: 4 }}>{q.detail}</div>
              {q.state === 'HELD' ? (
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <Btn size="sm" onClick={() => dispatch({ type: 'queue/remove', id: q.id })}>Discard</Btn>
                </div>
              ) : null}
            </Card>
          ))}
        </div>

        <Card style={{ background: 'var(--bg1)', overflow: 'hidden', position: 'sticky', top: 0 }}>
          <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
            <Kicker>Agent log</Kicker>
          </div>
          <div className="card-pad" style={{ maxHeight: 520, overflowY: 'auto' }}>
            {state.log.slice().reverse().map((l, i) => (
              <div
                key={i}
                className="logline"
                style={{
                  color:
                    l.kind === 'good' ? 'var(--good)'
                    : l.kind === 'warn' ? 'var(--warn)'
                    : l.kind === 'bad' ? 'var(--accent)'
                    : 'var(--ink3)',
                }}
              >
                <span style={{ color: 'var(--ink4)' }}>
                  {new Date(l.at).toISOString().slice(11, 19)}{' '}
                </span>
                {l.text}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}
