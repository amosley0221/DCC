import { useState } from 'react'
import { indexArt, useSave } from '../saveStore'
import { useStore } from '../store'
import { Btn, Card, Kicker, Meta } from '../ui'

/**
 * Where the game's extracted art is, and whether it matched.
 *
 * Faces are used on every roster screen, the depth chart and the front page,
 * but the only way to point at the folder used to be a rail inside Recruiting —
 * so the usual reason someone sees initials everywhere is that they never found
 * it. This says plainly whether a folder is set and how many players it
 * matched, which is the difference between "not set up" and "set up and not
 * working".
 */
export default function ArtFolder() {
  const { save, patch } = useSave()
  const { state, dispatch } = useStore()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const pick = async () => {
    if (!save.roster) { setNote('Read your save first — the art is matched against your players.'); return }
    const dir = await window.dcc.pickFaces()
    if (!dir) return
    setBusy(true)
    setNote(null)
    const art = await indexArt(dir, save.roster)
    setBusy(false)
    if (!art.ok) { setNote(art.message); dispatch({ type: 'log', line: { text: art.message, kind: 'bad' } }); return }
    patch(art.patch)
    dispatch({ type: 'artPath', path: dir })
    const msg = `matched ${art.matched.toLocaleString()} of ${art.players.toLocaleString()} players` +
      ` and ${art.schools} schools`
    setNote(msg)
    dispatch({ type: 'log', line: { text: msg, kind: art.matched ? 'good' : 'bad' } })
  }

  const faces = save.faces
  return (
    <Card className="card-pad">
      <Kicker>Player and school art</Kicker>
      <p className="body-serif" style={{ marginTop: 7 }}>
        The save carries each player's art name but not the art. Point DCC at your folder of
        extracted game art and the faces, helmets and logos appear everywhere players do. It is
        remembered and re-read on launch.
      </p>

      {faces ? (
        <div style={{ marginTop: 10 }}>
          <Meta size={9} color={faces.matched ? 'var(--good)' : 'var(--warn)'}>
            {faces.matched.toLocaleString()} OF {faces.players.toLocaleString()} PLAYERS MATCHED
            {' · '}{Object.keys(save.schoolArt).length} SCHOOL IMAGES
          </Meta>
          <div style={{ marginTop: 4 }}>
            <Meta size={9} color="var(--ink4)">{faces.root}</Meta>
          </div>
          {!faces.matched ? (
            <p className="body-serif" style={{ marginTop: 7 }}>
              The folder was read but nothing matched your roster, which usually means it is the
              wrong folder — DCC wants the folder the art was extracted <em>to</em>, not the game's
              install.
            </p>
          ) : null}
        </div>
      ) : (
        <Meta size={9} color="var(--warn)" >NO ART FOLDER SET — PLAYERS SHOW THEIR INITIALS</Meta>
      )}

      <div className="row" style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
        <Btn variant="primary" disabled={busy || save.facesBusy} onClick={pick}>
          {busy || save.facesBusy ? 'Reading…' : faces ? 'Change the art folder' : 'Choose the art folder'}
        </Btn>
        {state.artPath && faces ? (
          <Btn onClick={() => { dispatch({ type: 'artPath', path: null }); patch({ faces: null, facePaths: {}, schoolArt: {}, schoolColors: {} }) }}>
            Forget it
          </Btn>
        ) : null}
      </div>
      {note ? <div style={{ marginTop: 9 }}><Meta size={9}>{note.toUpperCase()}</Meta></div> : null}
    </Card>
  )
}
