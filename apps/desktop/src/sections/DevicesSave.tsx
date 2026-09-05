import { useEffect, useState } from 'react'
import { useSave } from '../saveStore'
import { useStore } from '../store'
import { Btn, Card, Input, Kicker, Meta, SectionHeader, Toggle } from '../ui'
import type { RelayState } from '../../electron/relay'

/**
 * Getting the dynasty onto the phone, by whichever route suits where you are.
 *
 * At home the desktop can serve the phone directly over the network, which needs
 * nothing in the middle and is instant. Away from home something has to hold the
 * data while the PC is unreachable, so the snapshot is published to a repository
 * the user owns — free, private, and nothing to run.
 *
 * The PC stays the only thing that writes to a save either way. That is not a
 * limitation of the transport; it is the rule that keeps one writer on the file.
 */
export default function DevicesSave() {
  const { save } = useSave()
  const { state, dispatch } = useStore()
  const { path } = save
  const [relay, setRelay] = useState<RelayState | null>(null)
  const [token, setToken] = useState(state.githubToken)
  const [repo, setRepo] = useState(state.publishRepo)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => { void window.dcc.relayState().then(setRelay) }, [])

  const toggle = async () => {
    setRelay(relay?.running ? await window.dcc.relayStop() : await window.dcc.relayStart(path, state.teamId))
  }
  // The relay keeps serving while the user is elsewhere in the app, so the
  // screen re-reads its state rather than trusting what it last set.
  useEffect(() => {
    if (!relay?.running) return
    const t = setInterval(() => { void window.dcc.relayState().then(setRelay) }, 4000)
    return () => clearInterval(t)
  }, [relay?.running])

  const publish = async () => {
    if (!path) return
    setBusy(true); setNote(null)
    const res = await window.dcc.publishSnapshot(path, state.teamId, repo.trim())
    setBusy(false)
    setNote(res.message)
    dispatch({ type: 'log', line: { text: res.message, kind: res.ok ? 'good' : 'bad' } })
  }

  return (
    <>
      <SectionHeader title="Devices" sub={<Meta>THE PC IS THE ONLY THING THAT WRITES TO THE SAVE</Meta>} />

      <div className="col" style={{ gap: 12, maxWidth: 760 }}>
        <Card className="card-pad">
          <Kicker>At home — serve the phone directly</Kicker>
          <p className="body-serif" style={{ marginTop: 7 }}>
            While this is on, the phone can read the dynasty straight off this machine over your
            own network. Nothing leaves the house and nothing is stored anywhere else. Every
            request has to carry the code below, and a new code is made each time you switch it on.
          </p>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <Btn variant="primary" onClick={toggle} disabled={!path && !relay?.running}>
              {relay?.running ? 'Stop serving' : 'Start serving'}
            </Btn>
            {!path ? <Meta size={9} color="var(--warn)">OPEN A SAVE FIRST</Meta> : null}
          </div>
          {relay?.running ? (
            <div style={{ marginTop: 10 }}>
              <Meta size={9}>ADDRESS</Meta>
              {relay.urls.map((u) => (
                <div key={u} className="num" style={{ color: 'var(--ink)', fontSize: 13 }}>{u}</div>
              ))}
              <div style={{ marginTop: 6 }}><Meta size={9}>CODE</Meta></div>
              <div className="num" style={{ color: 'var(--accent)', fontSize: 13, wordBreak: 'break-all' }}>{relay.token}</div>
              {relay.lastRequest ? <Meta size={9}>LAST REQUEST {relay.lastRequest}</Meta> : null}
            </div>
          ) : null}
          {relay?.error ? <Meta size={9} color="var(--warn)">{relay.error}</Meta> : null}
        </Card>

        <Card className="card-pad">
          <Kicker>Away from home — publish the snapshot</Kicker>
          <p className="body-serif" style={{ marginTop: 7 }}>
            Your PC is not reachable from a phone on mobile data, so something has to hold the
            dynasty in between. This puts a compressed snapshot on a repository you own, which
            costs nothing and needs no server running. Make a private repository for it, give a
            token with repo access, and publish whenever you want the phone to catch up.
          </p>
          <div className="col" style={{ gap: 8, marginTop: 8 }}>
            <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Meta size={9}>REPOSITORY</Meta>
              <Input
                style={{ minWidth: 220 }}
                placeholder="your-name/dcc-dynasty"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                onBlur={() => dispatch({ type: 'publishRepo', repo: repo.trim() })}
              />
            </div>
            <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Meta size={9}>TOKEN</Meta>
              <Input
                type="password"
                style={{ minWidth: 260 }}
                placeholder="github_pat_…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <Btn onClick={() => dispatch({ type: 'githubToken', token: token.trim() })}>Save the token</Btn>
            </div>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Btn variant="primary" onClick={publish} disabled={busy || !path || !repo.trim() || !state.githubToken}>
              {busy ? 'Publishing…' : 'Publish the snapshot'}
            </Btn>
            <Toggle
              on={state.autoPublish}
              onChange={(on) => dispatch({ type: 'autoPublish', on })}
              label="Publish on launch"
            />
          </div>
          <Meta size={9} color="var(--ink4)">
            {state.autoPublish
              ? 'THE SAVE IS RE-READ WHEN THE APP OPENS AND THE SNAPSHOT GOES UP WITH IT, ONCE A RUN'
              : 'NOTHING IS PUBLISHED UNTIL YOU PRESS THE BUTTON'}
          </Meta>
          {!state.githubToken ? <Meta size={9} color="var(--warn)">SAVE A TOKEN FIRST</Meta> : null}
          {note ? <div className="effect" style={{ marginTop: 10 }}>{note.toUpperCase()}</div> : null}
        </Card>

        <Card className="card-pad">
          <Kicker>Why the PC writes</Kicker>
          <p className="body-serif" style={{ marginTop: 7, marginBottom: 0 }}>
            A save is a single file that has to be rebuilt whole. Two writers means a lost
            dynasty, so edits made on the phone are carried back and applied here, where the file
            is. That holds whichever route the data took to get to the phone.
          </p>
        </Card>
      </div>
    </>
  )
}
