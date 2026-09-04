import { useStore } from '../store'
import { Btn, Card, Kicker, Meta, SectionHeader } from '../ui'

const THIS_MACHINE = 'gaming-pc'

export default function Devices() {
  const { dynasty, state, dispatch } = useStore()
  const holds = state.leaseHolder === THIS_MACHINE
  const holder = dynasty.devices.machines.find((m) => m.id === state.leaseHolder)
  const other = dynasty.devices.machines.find((m) => m.id !== THIS_MACHINE && m.id !== 'den-server')!

  return (
    <>
      <SectionHeader
        title="Devices"
        sub={<Meta>ONE WRITER AT A TIME — THE HOME SERVER HOLDS THE AUTHORITATIVE COPY</Meta>}
      />

      <Card
        className="card-pad"
        style={{ borderColor: holds ? 'var(--good)' : 'var(--accent)', marginBottom: 14, maxWidth: 900 }}
      >
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="col" style={{ gap: 4 }}>
            <Kicker color={holds ? 'var(--good)' : 'var(--accent)'}>
              {holds ? 'This PC holds the save — safe to play' : `Save checked out — ${holder?.name}`}
            </Kicker>
            <Meta size={10}>
              {holds
                ? 'Writes apply here. Release the lease before playing on the other machine.'
                : 'Writes are blocked on this machine until the lease comes back.'}
            </Meta>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {holds ? (
              <Btn onClick={() => dispatch({ type: 'lease', holder: other.id })}>Release to {other.name}</Btn>
            ) : (
              <>
                <Btn onClick={() => dispatch({ type: 'lease', holder: THIS_MACHINE })}>Request handoff</Btn>
                <Btn
                  variant="accent"
                  onClick={() => {
                    dispatch({ type: 'lease', holder: THIS_MACHINE })
                    dispatch({ type: 'log', line: { text: `force take — ${holder?.name}'s newer version kept as a restore point`, kind: 'warn' } })
                  }}
                >
                  Force take — keep a restore point
                </Btn>
              </>
            )}
          </div>
        </div>
      </Card>

      <div className="rail">
        <div className="col" style={{ gap: 10 }}>
          {dynasty.devices.machines.map((m) => (
            <Card key={m.id} className="card-pad">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row" style={{ gap: 10 }}>
                  <span className="dot" style={{ background: m.online ? 'var(--good)' : 'var(--ink4)' }} />
                  <div className="col">
                    <span className="row-title" style={{ color: 'var(--ink)' }}>{m.name}</span>
                    <Meta size={10}>{m.role} · hash {m.hash} · uploaded {m.lastUpload}</Meta>
                  </div>
                </div>
                {state.leaseHolder === m.id ? (
                  <span className="pill" style={{ color: 'var(--good)' }}>Holds the save</span>
                ) : null}
              </div>
            </Card>
          ))}

          <Card className="card-pad">
            <Kicker>Media watcher</Kicker>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink2)' }}>
                C:\Users\You\Videos\Captures
              </span>
              <span className="row" style={{ gap: 7 }}>
                <span className="dot" style={{ background: 'var(--good)' }} />
                <Meta size={9.5}>0 STILLS · 0 CLIPS · CURRENT</Meta>
              </span>
            </div>
          </Card>
        </div>

        <Card className="card-pad" style={{ position: 'sticky', top: 0 }}>
          <Kicker>Cloud version history</Kicker>
          <div className="col" style={{ gap: 8, marginTop: 10 }}>
            {dynasty.devices.history.map((h) => (
              <div key={h.version} className="row" style={{ gap: 10 }}>
                <span className="num" style={{ width: 42, color: 'var(--ink)' }}>{h.version}</span>
                <span className="col" style={{ flex: 1 }}>
                  <Meta size={10}>{h.when} · {h.machine}</Meta>
                </span>
                <Meta size={9.5}>{h.size}</Meta>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}
