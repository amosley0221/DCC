import { useEffect, useState } from 'react'
import { StoreProvider, useBootstrap, useStore } from './store'
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
import { Meta } from './ui'

const SECTIONS = [
  'WIRE', 'NATIONAL', 'RECRUIT', 'TEAM', 'TAMPER', 'COACH', 'QUEUE', 'EXPORT', 'DEVICES', 'SETTINGS',
] as const
type Section = (typeof SECTIONS)[number]

const THIS_MACHINE = 'gaming-pc'

function Shell({ update, version }: { update: UpdateStatus | null; version: string }) {
  const { state, d, sem } = useStore()
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

        {/* Agent status: save verified / game running / relay + phone. */}
        <div className="agent-strip">
          <div className="agent-row">
            <span className="dot" style={{ background: 'var(--good)' }} />SAVE VERIFIED
          </div>
          <div className="agent-row">
            <span className="dot" style={{ background: state.gameRunning ? 'var(--warn)' : 'var(--ink4)' }} />
            {state.gameRunning ? 'GAME RUNNING' : 'GAME CLOSED'}
          </div>
          <div className="agent-row">
            <span className="dot" style={{ background: 'var(--good)' }} />RELAY · PHONE
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="titlebar">
          <span className="titlebar-name">Dynasty Command Center</span>
          <Meta size={9}>v{version}</Meta>
          <span className="spacer" />
          {update?.state === 'ready' ? (
            <button className="chip chip-accent" aria-pressed onClick={() => window.dcc.installUpdate()}>
              Update {update.version} ready — restart
            </button>
          ) : update?.state === 'downloading' ? (
            <Meta size={9} color="var(--warn)">DOWNLOADING UPDATE {update.percent}%</Meta>
          ) : null}
          <Meta size={9}>
            HEAT {state.heat}
            {state.heat >= sem.heat.threshold ? ' — CRITICAL' : ''}
          </Meta>
          <Meta size={9}>{d.userTeam.wins}–{d.userTeam.losses} · WK {state.week}</Meta>
        </div>

        <div className="content">
          <div className="content-narrow">
            {section === 'WIRE' ? <Wire /> : null}
            {section === 'NATIONAL' ? <National /> : null}
            {section === 'RECRUIT' ? <Recruit /> : null}
            {section === 'TEAM' ? <Team /> : null}
            {section === 'TAMPER' ? <Tamper /> : null}
            {section === 'COACH' ? <Coach /> : null}
            {section === 'QUEUE' ? <Queue /> : null}
            {section === 'EXPORT' ? <Export /> : null}
            {section === 'DEVICES' ? <Devices /> : null}
            {section === 'SETTINGS' ? <Settings update={update} version={version} /> : null}
          </div>
        </div>
      </main>
    </div>
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
      <Shell update={update} version={version} />
    </StoreProvider>
  )
}
