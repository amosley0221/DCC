import { useCallback, useEffect, useRef, useState } from 'react'
import { StoreProvider, useBootstrap, useStore } from './store'
import { SaveProvider, useSave } from './saveStore'
import { applyTheme } from './theme'
import type { UpdateStatus } from './updates'
import Wire from './sections/Wire'
import National from './sections/National'
import Recruit from './sections/Recruit'
import Team from './sections/Team'
import Tamper from './sections/Tamper'
import Coach from './sections/Coach'
import Queue from './sections/Queue'
import Export from './sections/Export'
import Devices from './sections/Devices'
import Settings from './sections/Settings'
import NoDynasty from './sections/NoDynasty'
import Save from './sections/Save'
import Roster from './sections/Roster'
import { Meta } from './ui'
import UpdateToast from './UpdateToast'

const SECTIONS = [
  'WIRE', 'NATIONAL', 'RECRUIT', 'ROSTER', 'TEAM', 'TAMPER', 'COACH', 'QUEUE', 'EXPORT', 'DEVICES', 'SAVE', 'SETTINGS',
] as const
type Section = (typeof SECTIONS)[number]

const THIS_MACHINE = 'gaming-pc'

function Shell({ update, version }: { update: UpdateStatus | null; version: string }) {
  const { state, d, sem } = useStore()
  const { save } = useSave()
  const [section, setSection] = useState<Section>('WIRE')

  const held = state.queue.filter((q) => q.state === 'HELD').length
  const lostLease = state.leaseHolder !== THIS_MACHINE

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-name">Dynasty Command Center</div>
          <div className="brand-ver">v{version}</div>
        </div>

        <nav className="nav">
          {SECTIONS.map((s) => (
            <button
              key={s}
              className="nav-item"
              aria-current={section === s}
              onClick={() => setSection(s)}
            >
              {s}
              {s === 'QUEUE' && held ? <span className="nav-badge mono">{held}</span> : null}
              {s === 'DEVICES' && lostLease ? <span className="nav-alert mono">!</span> : null}
            </button>
          ))}
        </nav>

        {/* Agent status. None of these are connected yet, and the strip says
            so rather than showing green for something that does not exist. */}
        <div className="agent-strip">
          <div className="agent-row">
            <span className="dot" style={{ background: save.report ? 'var(--good)' : d ? 'var(--warn)' : 'var(--ink4)' }} />
            {save.roster ? 'ROSTER READ' : save.report ? 'SAVE ANALYSED' : d ? 'SAVE NOT READ' : 'NO SAVE'}
          </div>
          <div className="agent-row">
            <span className="dot" style={{ background: 'var(--ink4)' }} />AGENT OFFLINE
          </div>
          <div className="agent-row">
            <span className="dot" style={{ background: state.relayUrl ? 'var(--warn)' : 'var(--ink4)' }} />
            {state.relayUrl ? 'RELAY UNREACHABLE' : 'NO RELAY'}
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="titlebar">
          <span className="titlebar-name">Dynasty Command Center</span>
          <Meta size={9}>v{version}</Meta>
          <span className="spacer" />
          {update?.state === 'ready' ? (
            <Meta size={9} color="var(--accent)">UPDATE {update.version} READY</Meta>
          ) : update?.state === 'downloading' ? (
            <Meta size={9} color="var(--warn)">DOWNLOADING {update.percent}%</Meta>
          ) : update?.state === 'available' ? (
            <Meta size={9} color="var(--accent)">UPDATE {update.version} AVAILABLE</Meta>
          ) : null}
          {d ? (
            <>
              <Meta size={9}>
                HEAT {state.heat}
                {state.heat >= sem.heat.threshold ? ' — CRITICAL' : ''}
              </Meta>
              <Meta size={9}>{d.userTeam.wins}–{d.userTeam.losses} · WK {state.week}</Meta>
            </>
          ) : save.report ? (
            // A save has been read. Once the roster has been pulled out of it,
            // say so with the player count rather than repeating "analysed".
            <Meta size={9}>
              {save.report.name}
              {save.roster
                ? ` · ${save.roster.count.toLocaleString()} PLAYERS`
                : ' · ANALYSED'}
            </Meta>
          ) : (
            <Meta size={9}>NO SAVE LOADED</Meta>
          )}
        </div>

        <div className="content">
          <div className="content-narrow">
            {/* Settings is always reachable; every other section needs a
                dynasty to have anything to show. */}
            {section === 'SETTINGS' ? (
              <Settings update={update} version={version} />
            ) : section === 'SAVE' ? (
              <Save />
            ) : section === 'ROSTER' ? (
              <Roster />
            ) : !d ? (
              <NoDynasty
                section={section.charAt(0) + section.slice(1).toLowerCase()}
                onOpenSettings={() => setSection('SETTINGS')}
              />
            ) : (
              <>
                {section === 'WIRE' ? <Wire /> : null}
                {section === 'NATIONAL' ? <National /> : null}
                {section === 'RECRUIT' ? <Recruit /> : null}
                {section === 'TEAM' ? <Team /> : null}
                {section === 'TAMPER' ? <Tamper /> : null}
                {section === 'COACH' ? <Coach /> : null}
                {section === 'QUEUE' ? <Queue /> : null}
                {section === 'EXPORT' ? <Export /> : null}
                {section === 'DEVICES' ? <Devices /> : null}
              </>
            )}
          </div>
        </div>
      </main>

      <UpdateToast status={update} />
    </div>
  )
}

/**
 * Sits between the store and the shell so the analysed save outlives section
 * switches, and so the path it remembers is written back to settings.
 */
function SaveGate({ update, version }: { update: UpdateStatus | null; version: string }) {
  const { state, dispatch } = useStore()
  const remembered = useRef(state.savePath).current
  const forget = useCallback(() => dispatch({ type: 'savePath', path: null }), [dispatch])

  return (
    <SaveProvider remembered={remembered} onPathChange={forget}>
      <Shell update={update} version={version} />
    </SaveProvider>
  )
}

export default function App() {
  const { boot, error } = useBootstrap()
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  const [version, setVersion] = useState('—')

  useEffect(() => {
    // Paint the default theme before the dynasty finishes loading so the first
    // frame is never unstyled.
    applyTheme('night')
    void window.dcc.info().then((i) => setVersion(i.version))
    // Pick up anything the updater reported before this subscribed.
    void window.dcc.lastUpdateStatus().then((s) => { if (s) setUpdate((cur) => cur ?? s) })
    return window.dcc.onUpdateStatus(setUpdate)
  }, [])

  if (error) {
    return (
      <div style={{ padding: 40 }}>
        <div className="kicker">Could not start</div>
        <p className="body-serif" style={{ maxWidth: 620 }}>{error}</p>
      </div>
    )
  }

  if (!boot) {
    return (
      <div style={{ padding: 40 }}>
        <div className="mono" style={{ color: 'var(--ink4)', fontSize: 11, letterSpacing: 1.4 }}>
          LOADING DYNASTY…
        </div>
      </div>
    )
  }

  return (
    <StoreProvider dynasty={boot.dynasty} initial={boot.initial}>
      <SaveGate update={update} version={version} />
    </StoreProvider>
  )
}
