import { useState } from 'react'
import { indexArt, useSave } from '../saveStore'
import { useStore } from '../store'
import { Btn, Card, Chip, Input, Kicker, Meta } from '../ui'

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
  const [look, setLook] = useState('')
  const [found, setFound] = useState<{ hits: string[]; total: number } | null>(null)
  const [dirs, setDirs] = useState(false)

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

  const search = async (q: string) => {
    const res = await window.dcc.searchArt(q)
    setFound({ hits: res.hits, total: res.total })
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

      {/* What is in the folder that DCC has not learned to read yet.
          Faces, logos, helmets and jerseys are matched by pattern; bowl crests,
          trophies and stadiums are not, because nobody has seen what they are
          called. Guessing a pattern is how the art pack once shipped at 208
          bytes, so this looks instead. */}
      {faces ? (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <Kicker>Look inside the folder</Kicker>
          <p className="body-serif" style={{ marginTop: 7 }}>
            DCC reads faces, logos, helmets and jerseys because it knows how they are named.
            Bowl crests, trophies and stadiums it does not — so search for one and tell me what
            comes back, and it can be matched the same way.
          </p>
          <div className="row" style={{ gap: 8, marginTop: 8, alignItems: 'center' }}>
            <span style={{ flex: 1 }}>
              <Input
                placeholder="bowl, playoff, trophy, stadium…"
                value={look}
                onChange={(e) => setLook(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void search(look) }}
              />
            </span>
            <Btn onClick={() => void search(look)}>Look</Btn>
          </div>
          <div className="row" style={{ gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
            {['bowl', 'playoff', 'cfp', 'trophy', 'stadium', 'venue', 'field', 'campus', 'award']
              .map((w) => (
                <Chip key={w} on={look === w} onClick={() => { setLook(w); void search(w) }}>{w}</Chip>
              ))}
          </div>
          {/* When a word finds nothing, the folder names are the next question,
              and they are already in the index — no reason to make anyone go
              and look in Explorer for them. */}
          <div style={{ marginTop: 10 }}>
            <button onClick={() => setDirs((d) => !d)} style={{ all: 'unset', cursor: 'pointer' }}>
              <Meta size={9} color="var(--accent)">
                {dirs ? 'HIDE THE FOLDERS' : `WHAT FOLDERS ARE IN HERE (${faces.dirs.length})`}
              </Meta>
            </button>
            {dirs ? (
              <pre style={{
                marginTop: 6, maxHeight: 200, overflow: 'auto', fontSize: 11,
                color: 'var(--ink2)', background: 'var(--surface)',
                border: '1px solid var(--line)', borderRadius: 6, padding: 10,
              }}>{faces.dirs
                .map((d) => `${d.dir || '(root)'}  —  ${d.files.toLocaleString()} files\n    ${d.sample.slice(0, 3).join('  ')}`)
                .join('\n')}</pre>
            ) : null}
          </div>
          {found ? (
            <div style={{ marginTop: 10 }}>
              <Meta size={9}>
                {found.total.toLocaleString()} FILES MATCH
                {found.total > found.hits.length ? ` — FIRST ${found.hits.length}` : ''}
              </Meta>
              {found.hits.length ? (
                <pre style={{
                  marginTop: 6, maxHeight: 220, overflow: 'auto', fontSize: 11,
                  color: 'var(--ink2)', background: 'var(--surface)',
                  border: '1px solid var(--line)', borderRadius: 6, padding: 10,
                }}>{found.hits.join('\n')}</pre>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
