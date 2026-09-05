import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { ACCENT_LIST, THEMES, type ThemeName } from '../theme'
import { Btn, Card, Chip, Input, Kicker, Meta, SectionHeader, Track } from '../ui'
import type { UpdateStatus } from '../updates'

const RELEASES = 'https://github.com/amosley0221/DCC/releases'

export default function Settings({ update, version }: { update: UpdateStatus | null; version: string }) {
  const { state, dispatch, dynasty } = useStore()
  const [info, setInfo] = useState<{ userData: string; isDev: boolean } | null>(null)
  const [checking, setChecking] = useState(false)
  const [relayUrl, setRelayUrl] = useState(state.relayUrl)
  const [relayToken, setRelayToken] = useState(state.relayToken)
  const [key, setKey] = useState(state.anthropicKey)

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
          <Kicker>Press coverage</Kicker>
          <p className="body-serif" style={{ marginTop: 7 }}>
            Previews and recaps are written by a model from the facts in your save — the teams,
            the records, the conditions and the score. It uses your own Anthropic API key, which
            is kept on this machine with the rest of your settings and sent nowhere but the API.
            Get one at console.anthropic.com.
          </p>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Input
              type="password"
              style={{ minWidth: 300 }}
              placeholder="sk-ant-…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <Btn variant="primary" onClick={() => dispatch({ type: 'anthropicKey', key: key.trim() })}>
              Save the key
            </Btn>
            {state.anthropicKey ? (
              <Btn onClick={() => { setKey(''); dispatch({ type: 'anthropicKey', key: '' }) }}>Forget it</Btn>
            ) : null}
          </div>
          <Meta size={9}>
            {state.anthropicKey ? 'A KEY IS SAVED — PRESS BUTTONS APPEAR ON EVERY GAME IN TEAM → SCHEDULE' : 'NO KEY SAVED'}
          </Meta>
        </Card>

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
            <Meta size={10}>
              Gold Standard is the default and the one built to read as a broadcast. Night Wire and
              Field Office are the working themes: the same screens, plus what has been decoded,
              which file is open and how each number was arrived at.
            </Meta>
          </div>

          {state.theme === 'gold' ? (
            <>
              <div className="rule" style={{ margin: '16px 0 14px' }} />
              <Kicker>Mode</Kicker>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                {(['dark', 'light'] as const).map((m) => (
                  <Chip key={m} accent on={state.mode === m} onClick={() => dispatch({ type: 'mode', mode: m })}>
                    {m === 'dark' ? 'Dark' : 'Light'}
                  </Chip>
                ))}
              </div>

              <div className="rule" style={{ margin: '16px 0 14px' }} />
              <Kicker>Accent</Kicker>
              <div className="gs-swatches" style={{ marginTop: 11 }}>
                {ACCENT_LIST.map((a) => (
                  <button
                    key={a.id}
                    className="gs-swatch"
                    title={a.label}
                    aria-pressed={state.accent.toLowerCase() === a.dark.toLowerCase()}
                    style={{ background: a.dark }}
                    onClick={() => dispatch({ type: 'accent', accent: a.dark })}
                  />
                ))}
                {/* One hex is stored; the light-mode value is derived from it,
                    which is what makes an arbitrary pick off the wheel safe. */}
                <input
                  className="gs-wheel"
                  type="color"
                  value={state.accent}
                  onChange={(e) => dispatch({ type: 'accent', accent: e.target.value })}
                  title="Any color"
                />
                <Meta size={10}>{state.accent.toUpperCase()}</Meta>
              </div>
            </>
          ) : null}
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
              ) : update?.state === 'available' ? (
                <Btn variant="primary" onClick={() => window.dcc.downloadUpdate()}>
                  Download {update.version}
                </Btn>
              ) : (
                <Btn onClick={check} disabled={checking}>{checking ? 'Checking…' : 'Check for updates'}</Btn>
              )}
              <Btn onClick={() => window.dcc.openExternal(RELEASES)}>Release notes</Btn>
            </div>
          </div>
        </Card>

        <Card className="card-pad">
          <Kicker>Dynasty</Kicker>
          <div className="col" style={{ gap: 8, marginTop: 10 }}>
            {state.dynastySource === 'sample' && dynasty ? (
              <>
                <Meta color="var(--warn)">SAMPLE DYNASTY LOADED — INVENTED DATA, NOT YOUR SAVE</Meta>
                <Meta size={10}>
                  Season {dynasty.meta.season} · {dynasty.teams.length} programs ·{' '}
                  {dynasty.prospects.length.toLocaleString()} prospects
                </Meta>
                <div className="row" style={{ gap: 8, marginTop: 4 }}>
                  <Btn onClick={() => dispatch({ type: 'reset', dynasty })}>Reset edits</Btn>
                  <Btn variant="accent" onClick={() => dispatch({ type: 'clearDynasty' })}>Clear dynasty</Btn>
                </div>
              </>
            ) : (
              <>
                <Meta size={10}>NO DYNASTY LOADED</Meta>
                <span className="body-serif">
                  The save agent that reads <code>DYNASTY-*.sav</code> is not built yet, so no real
                  dynasty can be loaded. The sample is invented data for looking at the screens.
                </span>
                <div className="row" style={{ gap: 8, marginTop: 4 }}>
                  <Btn
                    variant="primary"
                    onClick={async () => {
                      const d = (await window.dcc.dynasty()) as never
                      dispatch({ type: 'loadSample', dynasty: d })
                    }}
                  >
                    Load sample dynasty
                  </Btn>
                </div>
              </>
            )}
            {info ? <Meta size={10}>State file: {info.userData}</Meta> : null}
          </div>
        </Card>

        <Card className="card-pad">
          <Kicker>Relay</Kicker>
          <div className="col" style={{ gap: 8, marginTop: 10 }}>
            <span className="body-serif">
              The home server that holds the dynasty, the shared queue and the media. This machine
              pushes to it; the phone reads from it.
            </span>
            <Meta size={9}>SERVER ADDRESS</Meta>
            <Input
              placeholder="http://den-server.local:8080"
              value={relayUrl}
              onChange={(e) => setRelayUrl(e.target.value)}
            />
            <Meta size={9}>PAIRING TOKEN</Meta>
            <Input
              placeholder="shared with the phone"
              value={relayToken}
              onChange={(e) => setRelayToken(e.target.value)}
            />
            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              <Btn onClick={() => dispatch({ type: 'relay', url: relayUrl.trim(), token: relayToken.trim() })}>
                Save
              </Btn>
            </div>
            <Meta color="var(--warn)">RELAY SERVICE NOT BUILT YET — NOTHING TO CONNECT TO</Meta>
          </div>
        </Card>
      </div>
    </>
  )
}
