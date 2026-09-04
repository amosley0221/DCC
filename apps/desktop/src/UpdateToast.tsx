import { useEffect, useState } from 'react'
import { Btn, Kicker, Meta, Track } from './ui'
import type { UpdateStatus } from './updates'

const RELEASES = 'https://github.com/amosley0221/DCC/releases'

/** GitHub sends release notes as HTML; the toast wants a few plain lines. */
function plainNotes(notes: unknown): string[] {
  if (typeof notes !== 'string') return []
  return notes
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<li>/gi, '· ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4)
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

      <div className="hero-headline" style={{ marginTop: 5 }}>
        Version {version ?? '—'}
      </div>

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
            <span key={i} className="body-serif" style={{ fontSize: 12.5 }}>{n}</span>
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
