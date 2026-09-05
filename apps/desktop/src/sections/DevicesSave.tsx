import { useEffect, useMemo, useState } from 'react'
import { useSave } from '../saveStore'
import { buildPack } from '../art'

/** The recruiting board and the portal pool sit here rather than on a roster. */
const UNASSIGNED = 255
import { useStore } from '../store'
import { Btn, Card, Chip, Input, Kicker, Meta, SectionHeader, Toggle } from '../ui'
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
  const { save, patch } = useSave()
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

  /**
   * What the phone needs pictures of.
   *
   * Every school's marks always — 138 logos, helmets and jerseys is a couple of
   * megabytes and the phone draws them everywhere. Faces are the expensive
   * half: the game has sixteen thousand, so the choice is your own roster, that
   * plus the board, or the whole country, and the size is reported after so the
   * choice can be made on what it actually costs.
   */
  /**
   * Whose faces to carry, widening a step at a time.
   *
   * They nest on purpose: each one is the one before it plus more, so a choice
   * further down never loses anything a choice above it had. The first version
   * of these did not — "every roster" left out the board, and "my roster and the
   * board" quietly packed the whole country — which is exactly the kind of thing
   * a label has to be true about.
   */
  const faceScopes = [
    ['mine', 'MY ROSTER'],
    ['board', 'MY ROSTER AND THE BOARD'],
    ['all', 'EVERYONE'],
  ] as const
  type Scope = (typeof faceScopes)[number][0]
  const [scope, setScope] = useState<Scope>('mine')
  const [packing, setPacking] = useState(false)
  const [packNote, setPackNote] = useState<string | null>(null)

  /** Team 255 is not a roster: it is the recruiting board and the portal pool. */
  const inScope = (p: { team: number }, s: Scope) =>
    s === 'all' || (s === 'board' && (p.team === state.teamId || p.team === UNASSIGNED))
    || p.team === state.teamId

  const idsFor = (s: Scope) => {
    const ids = new Set<string>()
    for (const p of save.roster?.players ?? []) {
      if (p.assetId && inScope(p, s)) ids.add(p.assetId)
    }
    return ids
  }

  // Counted up front and shown on the chips, so the choice is made on the real
  // number rather than on how big "everyone" sounds.
  const scopeCounts = useMemo(() => {
    const out: Record<Scope, number> = { mine: 0, board: 0, all: 0 }
    for (const [id] of faceScopes) out[id] = idsFor(id).size
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.roster, state.teamId])

  const assetIds = () => [...idsFor(scope)]

  const [progress, setProgress] = useState<string | null>(null)

  /**
   * Reads and resizes every image here, in the renderer, and streams the result
   * to the main process to be zipped.
   *
   * Here because the game's art is WebP: Chromium decodes it, which is how the
   * desktop has been drawing it all along, and the first version of this pack
   * decoded PNG in the main process and skipped every single file.
   */
  const build = async () => {
    setPacking(true); setPackNote(null); setProgress(null)
    try {
      await buildAndSave()
    } catch (err) {
      // Anything that goes wrong now says so, and the button comes back. It
      // used to leave the screen stuck on "Building…" with no explanation.
      const message = String((err as Error)?.message ?? err)
      setPackNote(message)
      dispatch({ type: 'log', line: { text: `art pack failed — ${message}`, kind: 'bad' } })
    } finally {
      setPacking(false); setProgress(null)
    }
  }

  const buildAndSave = async () => {
    const out = await buildPack(
      save.schoolArt,
      save.facePaths,
      assetIds(),
      save.awardArt,
      {},
      (p) => setProgress(`${p.done} of ${p.total}${p.label ? ` · ${p.label}` : ''}`),
    )
    // The colours come out of the same pass, and the snapshot carries them.
    if (Object.keys(out.colors).length) {
      patch({ schoolColors: out.colors })
      await window.dcc.setSchoolColors(out.colors)
    }
    const res = await window.dcc.packFinish({
      id: out.id,
      publish: !!repo.trim() && !!state.githubToken,
      repo: repo.trim() || undefined,
      // The alignment you set on the Roster's card view travels with the art,
      // so the phone draws a player exactly as this screen does.
      fit: {
        jerseyScale: Number(localStorage.getItem('dcc.kit.scale') ?? 1),
        jerseyDrop: Number(localStorage.getItem('dcc.kit.y') ?? 0),
      },
    })
    if (!res.ok) { setPackNote(res.message); return }
    const mb = (res.bytes / 1024 / 1024).toFixed(1)
    const note = [
      `${mb} MB — ${res.schools} schools, ${res.players.toLocaleString()} faces`,
      out.skipped
        ? `${out.skipped.toLocaleString()} would not open (${out.skippedKinds.map((k) => k.ext).join(', ')})`
        : null,
      res.file ? `saved to ${res.file}` : null,
      res.published,
    ].filter(Boolean).join(' · ')
    setPackNote(note)
    dispatch({ type: 'log', line: { text: `art pack built — ${note}`, kind: 'good' } })
  }

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
          <Kicker>Pictures for the phone</Kicker>
          <p className="body-serif" style={{ marginTop: 7 }}>
            The phone has never seen your art folder, and it is far too big to send. This builds
            the slice your dynasty actually uses — every school's logo, helmet, jersey and gold
            mark, and the faces you choose — shrunk to the size a phone draws them at. It saves
            to a file, goes up to GitHub beside the snapshot, and is served over Wi-Fi with it.
          </p>
          <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {faceScopes.map(([id, label]) => (
              <Chip key={id} on={scope === id} onClick={() => setScope(id)}>
                {label} {scopeCounts[id].toLocaleString()}
              </Chip>
            ))}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
            <Btn variant="primary" onClick={build} disabled={packing || !save.faces}>
              {packing ? 'Building…' : 'Build the art pack'}
            </Btn>
            {progress ? <Meta size={9} color="var(--warn)">{progress.toUpperCase()}</Meta> : null}
            {!save.faces ? <Meta size={9} color="var(--warn)">POINT AT YOUR ART FOLDER FIRST</Meta> : null}
          </div>
          {packNote ? <div className="effect" style={{ marginTop: 10 }}>{packNote.toUpperCase()}</div> : null}
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
