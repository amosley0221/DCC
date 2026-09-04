import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { THEMES, type ThemeName } from '../theme'
import { Btn, Card, Chip, Kicker, Meta, SectionHeader, Track } from '../ui'
import type { UpdateStatus } from '../updates'

const RELEASES = 'https://github.com/amosley0221/DCC/releases'

export default function Settings({ update, version }: { update: UpdateStatus | null; version: string }) {
  const { state, dispatch, dynasty } = useStore()
  const [info, setInfo] = useState<{ userData: string; isDev: boolean } | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => { void window.dcc.info().then((i) => setInfo({ userData: i.userData, isDev: i.isDev })) }, [])

  const check = async () => {
    setChecking(true)
    await window.dcc.checkForUpdate()
    setTimeout(() => setChecking(false), 1200)
  }

  return (
    <>
      <SectionHeader title="Settings" sub={<Meta>VERSION {version}</Meta>} />

      <div className="col" style={{ gap: 12, maxWidth: 720 }}>
        <Card className="card-pad">
          <Kicker>Appearance</Kicker>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            {(Object.keys(THEMES) as ThemeName[]).map((t) => (
              <Chip key={t} accent on={state.theme === t} onClick={() => dispatch({ type: 'theme', theme: t })}>
                {THEMES[t].label}
              </Chip>
            ))}
          </div>
          <div style={{ marginTop: 9 }}>
            <Meta size={10}>Night Wire is the default. The choice is saved and applies to both apps independently.</Meta>
          </div>
        </Card>

        <Card className="card-pad">
          <Kicker>Updates</Kicker>
          <div className="col" style={{ gap: 8, marginTop: 10 }}>
            <Meta size={10}>
              New versions install over this one — you never have to uninstall first, and your
              queue, board and settings are kept.
            </Meta>

            {update?.state === 'downloading' ? (
              <>
                <Meta color="var(--warn)">DOWNLOADING {update.percent}%</Meta>
                <Track value={update.percent} fill="var(--warn)" />
              </>
            ) : null}
            {update?.state === 'available' ? <Meta color="var(--warn)">VERSION {update.version} AVAILABLE</Meta> : null}
            {update?.state === 'current' ? <Meta color="var(--good)">UP TO DATE</Meta> : null}
            {update?.state === 'error' ? <Meta color="var(--accent)">{update.message}</Meta> : null}
            {update?.state === 'dev' ? <Meta size={10}>updates are disabled in a dev build</Meta> : null}

            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              {update?.state === 'ready' ? (
                <Btn variant="primary" onClick={() => window.dcc.installUpdate()}>
                  Restart and install {update.version}
                </Btn>
              ) : (
                <Btn onClick={check} disabled={checking}>{checking ? 'Checking…' : 'Check for updates'}</Btn>
              )}
              <Btn onClick={() => window.dcc.openExternal(RELEASES)}>Release notes</Btn>
            </div>
          </div>
        </Card>

        <Card className="card-pad">
          <Kicker>Data</Kicker>
          <div className="col" style={{ gap: 7, marginTop: 10 }}>
            <Meta size={10}>Season {dynasty.meta.season} · {dynasty.teams.length} programs · {dynasty.prospects.length.toLocaleString()} prospects</Meta>
            {info ? <Meta size={10}>State file: {info.userData}</Meta> : null}
            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              <Btn
                variant="accent"
                onClick={() => {
                  if (confirm('Reset the queue, board and every local edit back to the seed dynasty?')) {
                    dispatch({ type: 'reset', dynasty })
                  }
                }}
              >
                Reset local state
              </Btn>
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}
