import { useEffect, useState } from 'react'
import { Btn, Kicker, Meta, Track } from './ui'
import type { UpdateStatus } from './updates'

const RELEASES = 'https://github.com/amosley0221/DCC/releases'

const decode = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')

/**
 * GitHub sends release notes as HTML, and a 320px panel is not where a release
 * body is read.
 *
 * Only the list items are taken — the section headings became bare words like
 * "Added" on their own line — and each is reduced to its lead: the notes are
 * written with the point in bold at the front, so that bold run is the whole
 * summary. Anything else falls back to its first sentence. The full text is a
 * click away on Notes, which is what that button is for.
 */
function plainNotes(notes: unknown): string[] {
  if (typeof notes !== 'string') return []
  const items = notes.match(/<li>[\s\S]*?<\/li>/gi) ?? []
  const lines = items.map((raw) => {
    const bold = /<(strong|b)>([\s\S]*?)<\/\1>/i.exec(raw)
    const text = decode((bold ? bold[2] : raw).replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.:]$/, '')
    return text.length > 68 ? `${text.slice(0, 66).trimEnd()}…` : text
  })
  // A body with no list at all still deserves a line or two.
  if (!lines.length) {
    return decode(notes.replace(/<[^>]+>/g, '\n')).split('\n')
      .map((l) => l.trim()).filter(Boolean).slice(0, 3)
  }
  return lines.filter(Boolean).slice(0, 3)
}

/**
 * Prompt shown when a new version exists. Downloading is a deliberate click
 * rather than something the app does behind the user's back, and the same
 * panel carries progress and the restart.
 */
export default function UpdateToast({ status }: { status: UpdateStatus | null }) {
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Progress events carry no version, so the one first offered is remembered
  // and shown for the whole download.
  const [version, setVersion] = useState<string | null>(null)

  const offered =
    status && 'version' in status && typeof status.version === 'string' ? status.version : null

  useEffect(() => {
    if (offered) setVersion(offered)
  }, [offered])

  // A newly-offered version should reappear even if an older one was dismissed.
  useEffect(() => {
    if (offered && dismissed && dismissed !== offered) setDismissed(null)
  }, [offered, dismissed])

  useEffect(() => {
    if (status?.state === 'downloading' || status?.state === 'ready') setBusy(false)
  }, [status?.state])

  if (!status) return null
  const show =
    status.state === 'available' || status.state === 'downloading' || status.state === 'ready'
  if (!show) return null
  if (version && dismissed === version) return null

  const notes = plainNotes('notes' in status ? status.notes : undefined)

  return (
    <div className="update-toast fade-in" role="dialog" aria-label="Update available">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Kicker>
          {status.state === 'ready' ? 'Update ready' : status.state === 'downloading' ? 'Downloading' : 'Update available'}
        </Kicker>
        <button
          className="meta"
          aria-label="Dismiss"
          style={{ color: 'var(--ink4)', fontSize: 13, lineHeight: 1 }}
          onClick={() => setDismissed(version ?? 'x')}
        >
          ✕
        </button>
      </div>

      {/* Its own size: the hero headline is 36px under Gold Standard, which is
          right for a page and absurd in a 320px panel. */}
      <div className="update-toast-version">Version {version ?? '—'}</div>

      {status.state === 'downloading' ? (
        <div style={{ marginTop: 11 }}>
          <Meta color="var(--warn)">{status.percent}%</Meta>
          <div style={{ marginTop: 5 }}>
            <Track value={status.percent} fill="var(--accent)" height={5} />
          </div>
        </div>
      ) : notes.length ? (
        <div className="col" style={{ gap: 3, marginTop: 8 }}>
          {notes.map((n, i) => (
            <span key={i} className="update-toast-note">{n}</span>
          ))}
        </div>
      ) : null}

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        {status.state === 'ready' ? (
          <Btn variant="primary" style={{ flex: 1 }} onClick={() => window.dcc.installUpdate()}>
            Restart and install
          </Btn>
        ) : status.state === 'available' ? (
          <Btn
            variant="primary"
            style={{ flex: 1 }}
            disabled={busy}
            onClick={() => { setBusy(true); void window.dcc.downloadUpdate() }}
          >
            {busy ? 'Starting…' : 'Download'}
          </Btn>
        ) : null}
        <Btn size="sm" onClick={() => window.dcc.openExternal(RELEASES)}>Notes</Btn>
      </div>

      {status.state === 'ready' ? (
        <div style={{ marginTop: 8 }}>
          <Meta size={9}>INSTALLS OVER THIS VERSION — YOUR SETTINGS ARE KEPT</Meta>
        </div>
      ) : null}
    </div>
  )
}
