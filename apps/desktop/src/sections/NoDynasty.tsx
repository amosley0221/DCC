import { Btn, Card, Kicker, Meta, SectionHeader } from '../ui'
import { useStore } from '../store'

/**
 * What every section shows before a dynasty exists. The app holds no data of
 * its own: it shows the user's save, or it shows nothing.
 */
export default function NoDynasty({ section, onOpenSettings }: {
  section: string
  onOpenSettings: () => void
}) {
  const { state } = useStore()
  return (
    <>
      <SectionHeader title={section} sub={<Meta>NO DYNASTY LOADED</Meta>} />
      <div className="col" style={{ gap: 12, maxWidth: 640 }}>
        <Card className="card-pad">
          <Kicker>Waiting on your save</Kicker>
          <p className="body-serif" style={{ marginTop: 7 }}>
            This app shows your dynasty and nothing else, so it stays empty until a save is
            read. The PC agent is what reads <code>DYNASTY-*.sav</code> off this machine,
            hashes it, and hands the parsed data to the rest of the app.
          </p>
          <div style={{ marginTop: 10 }}>
            <Meta color={state.relayUrl ? 'var(--ink3)' : 'var(--warn)'}>
              {state.relayUrl ? `RELAY ${state.relayUrl}` : 'RELAY NOT CONFIGURED'}
            </Meta>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <Btn variant="primary" onClick={onOpenSettings}>Open settings</Btn>
          </div>
        </Card>

        <Card className="card-pad">
          <Kicker color="var(--ink3)">Not built yet</Kicker>
          <p className="body-serif" style={{ marginTop: 7, marginBottom: 0 }}>
            The save agent and the relay service do not exist yet, so there is no way for real
            data to arrive. Until they do, Settings can load a sample dynasty so you can see how
            the screens work — it is invented data, not your save.
          </p>
        </Card>
      </div>
    </>
  )
}
