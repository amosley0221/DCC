import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StoreProvider, useBootstrap, useStore } from './store'
import { SaveProvider, useSave } from './saveStore'
import { TEAM_ID_NAMES } from '../electron/teamIds'
import { applyTheme } from './theme'
import type { UpdateStatus } from './updates'
import Wire from './sections/Wire'
import WireSave from './sections/WireSave'
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
import RecruitSave from './sections/RecruitSave'
import TeamSave from './sections/TeamSave'
import TamperSave from './sections/TamperSave'
import DevicesSave from './sections/DevicesSave'
import { Meta, Tab } from './ui'
import UpdateToast from './UpdateToast'

/**
 * DCC is built to hold more than one game, so the wordmark names the one you
 * are in and opens the switcher. The other two are listed but not selectable —
 * nothing reads their saves yet, and a nav item that leads nowhere is worse
 * than one that says so.
 */
const GAMES = [
  { id: 'CFB27', name: 'College Football 27', mark: 'DYNASTY', accentWord: 'HQ', live: true },
  { id: 'MADDEN27', name: 'Madden NFL 27', mark: 'MADDEN', accentWord: 'HQ', live: false },
  { id: 'FC27', name: 'EA Sports FC 27', mark: 'CLUB', accentWord: 'HQ', live: false },
] as const
type GameId = (typeof GAMES)[number]['id']

type Section =
  | 'HOME' | 'PROGRAM' | 'RECRUITING' | 'PORTAL' | 'LEAGUE' | 'LEGACY'
  | 'SETTINGS' | 'SAVE' | 'DEVICES' | 'QUEUE' | 'EXPORT'

/** The editorial nav. Everything operational lives behind the gear. */
const NAV: { id: Section; label: string }[] = [
  { id: 'HOME', label: 'Home' },
  { id: 'PROGRAM', label: 'The Program' },
  { id: 'RECRUITING', label: 'Recruiting' },
  { id: 'PORTAL', label: 'Portal' },
  { id: 'LEAGUE', label: 'League' },
  { id: 'LEGACY', label: 'Legacy' },
]

/** Reachable from Settings only, in every theme. */
const OPS: { id: Section; label: string }[] = [
  { id: 'SETTINGS', label: 'Appearance' },
  { id: 'SAVE', label: 'Dynasty file' },
  { id: 'DEVICES', label: 'Devices' },
  { id: 'QUEUE', label: 'Queue' },
  { id: 'EXPORT', label: 'Draft export' },
]
const isOps = (s: Section) => OPS.some((o) => o.id === s)

const THIS_MACHINE = 'gaming-pc'

const Icon = {
  caret: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
  ),
  search: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
      <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  gear: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  ),
}

function Shell({ update, version }: { update: UpdateStatus | null; version: string }) {
  const { state, d } = useStore()
  const { save } = useSave()
  const [game, setGame] = useState<GameId>('CFB27')
  const [games, setGames] = useState(false)
  const [section, setSection] = useState<Section>('HOME')

  const active = GAMES.find((g) => g.id === game)!
  const held = state.queue.filter((q) => q.state === 'HELD').length
  const lostLease = state.leaseHolder !== THIS_MACHINE
  // Gold Standard is the one meant to read as a sports site, so it does not
  // show the operator's plumbing — whether a save was analysed, which file is
  // open. The other two themes are the working ones and keep it.
  const ops = state.theme !== 'gold'

  const me = state.teamId === null ? null : (state.teamNames[state.teamId] ?? TEAM_ID_NAMES[state.teamId] ?? null)

  // The week the dynasty has actually reached, for the bar.
  const week = (() => {
    const played = (save.roster?.games ?? []).filter((g) => g.played && !g.postseason)
    if (!played.length) return null
    return me
      ? Math.max(...played.filter((g) => g.home === me || g.away === me).map((g) => g.week), 0)
      : Math.max(...played.map((g) => g.week))
  })()

  return (
    <div className="gs" onClick={() => games && setGames(false)}>
      <header className="gs-topbar">
        <button
          className="gs-mark"
          aria-expanded={games}
          onClick={(e) => { e.stopPropagation(); setGames(!games) }}
        >
          <span className="gs-mark-name">{active.mark} <em>{active.accentWord}</em></span>
          <span className="gs-mark-caret">{Icon.caret}</span>
        </button>

        {games ? (
          <div className="gs-games" onClick={(e) => e.stopPropagation()}>
            {GAMES.map((g) => (
              <button
                key={g.id}
                className="gs-game"
                aria-current={g.id === game}
                disabled={!g.live}
                onClick={() => { if (g.live) { setGame(g.id); setSection('HOME') } setGames(false) }}
              >
                <span className="gs-game-name">{g.name}</span>
                {g.live ? null : <span className="gs-game-soon">Coming soon</span>}
              </button>
            ))}
          </div>
        ) : null}

        <nav className="gs-nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className="gs-nav-item"
              aria-current={section === n.id}
              onClick={() => setSection(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>

        <div className="gs-topbar-right">
          <Search onOpen={(s) => setSection(s)} />
          {week !== null ? <span className="gs-week">Week {week}</span> : null}
          <button
            className="gs-gear"
            aria-current={isOps(section)}
            title="Settings"
            onClick={() => setSection('SETTINGS')}
          >
            {Icon.gear}
          </button>
        </div>
      </header>

      <main className="gs-page">
        <div className="gs-page-in">
          {isOps(section) ? (
            <>
              <div className="subtabs" style={{ marginBottom: 18 }}>
                {OPS.map((o) => (
                  <Tab key={o.id} on={section === o.id} onClick={() => setSection(o.id)}>
                    {o.label}
                    {o.id === 'QUEUE' && held ? ` · ${held}` : ''}
                    {o.id === 'DEVICES' && lostLease ? ' · !' : ''}
                  </Tab>
                ))}
              </div>
              {section === 'SETTINGS' ? <Settings update={update} version={version} /> : null}
              {section === 'SAVE' ? <Save /> : null}
              {section === 'DEVICES' ? (save.path ? <DevicesSave /> : d ? <Devices /> : <NoDynasty section="Devices" onOpenSettings={() => setSection('SETTINGS')} />) : null}
              {section === 'QUEUE' ? (d ? <Queue /> : <NoDynasty section="Queue" onOpenSettings={() => setSection('SETTINGS')} />) : null}
              {section === 'EXPORT' ? (d ? <Export /> : <NoDynasty section="Draft export" onOpenSettings={() => setSection('SETTINGS')} />) : null}
            </>
          ) : game !== 'CFB27' ? (
            <Standby
              title={active.name}
              body="Not connected yet. DCC reads College Football 27 saves today and exports a draft class into Madden. This game joins the same shell once its save format is read."
            />
          ) : section === 'HOME' && save.report ? (
            <WireSave />
          ) : section === 'PROGRAM' && save.report ? (
            <TeamSave />
          ) : section === 'LEAGUE' && save.report ? (
            <TeamSave view="schedule" />
          ) : section === 'RECRUITING' && save.report ? (
            <RecruitSave />
          ) : section === 'PORTAL' && save.report ? (
            <TamperSave />
          ) : !d ? (
            <NoDynasty
              section={NAV.find((n) => n.id === section)?.label ?? 'This screen'}
              onOpenSettings={() => setSection('SETTINGS')}
            />
          ) : (
            <>
              {section === 'HOME' ? <Wire /> : null}
              {section === 'LEAGUE' ? <National /> : null}
              {section === 'RECRUITING' ? <Recruit /> : null}
              {section === 'PROGRAM' ? <Team /> : null}
              {section === 'PORTAL' ? <Tamper /> : null}
              {section === 'LEGACY' ? <Coach /> : null}
            </>
          )}
          {section === 'LEGACY' && save.report ? <Coach /> : null}
        </div>
      </main>

      <UpdateToast status={update} />
      {/* The version and the open file are operator detail: the working themes
          keep them, Gold Standard carries no footer at all. */}
      {ops ? (
        <footer className="gs-foot">
          <Meta size={9}>DYNASTY COMMAND CENTER v{version}</Meta>
          <Meta size={9}>{save.report ? save.report.name : 'NO SAVE LOADED'}</Meta>
        </footer>
      ) : null}
    </div>
  )
}

/**
 * One field that reaches every team, player and recruit the save holds.
 *
 * The save carries 16,448 players across 138 rosters, which is far too many to
 * page through; typing a name is the only way most of them are ever reachable.
 */
function Search({ onOpen }: { onOpen: (s: Section) => void }) {
  const { save } = useSave()
  const { state } = useStore()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  const nameOf = (id: number) => state.teamNames[id] ?? TEAM_ID_NAMES[id] ?? null

  const hits = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (term.length < 2) return []
    const out: { key: string; num?: string; name: string; sub: string; kind: string; go: Section }[] = []

    for (let id = 0; id < TEAM_ID_NAMES.length && out.length < 4; id++) {
      const n = nameOf(id)
      if (n && n.toLowerCase().includes(term)) {
        out.push({ key: `t${id}`, name: n, sub: 'Programme', kind: 'Team', go: 'PROGRAM' })
      }
    }

    for (const p of save.roster?.players ?? []) {
      if (out.length >= 9) break
      const full = `${p.first} ${p.last}`
      if (!full.toLowerCase().includes(term)) continue
      const recruit = p.team === 255 && p.recruitFlag
      const team = recruit ? 'Recruiting class' : (nameOf(p.team) ?? 'Unassigned')
      out.push({
        key: `p${p.index}`,
        num: recruit ? undefined : String(p.overall),
        name: full,
        sub: `${p.position} · ${team}`,
        kind: recruit ? 'Recruit' : 'Player',
        go: recruit ? 'RECRUITING' : 'PORTAL',
      })
    }
    return out
  }, [q, save.roster, state.teamNames])

  return (
    <div className="gs-search" onClick={(e) => e.stopPropagation()}>
      <div className="gs-search-field">
        {Icon.search}
        <input
          value={q}
          placeholder="Search a team, player, recruit"
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && q.trim().length >= 2 ? (
        <div className="gs-search-results">
          {hits.length === 0 ? (
            <div className="gs-search-empty">Nothing matches “{q.trim()}”.</div>
          ) : hits.map((h) => (
            <button key={h.key} className="gs-result" onClick={() => { onOpen(h.go); setOpen(false); setQ('') }}>
              {h.num ? <span className="gs-result-num">{h.num}</span> : null}
              <span style={{ minWidth: 0 }}>
                <span className="gs-result-name">{h.name}</span>
                <span className="gs-result-sub" style={{ display: 'block' }}>{h.sub}</span>
              </span>
              <span className="gs-result-kind">{h.kind}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** A game DCC is built for but does not read yet. Product copy, not a note. */
function Standby({ title, body }: { title: string; body: string }) {
  return (
    <div className="gs-soon">
      <h1 className="gs-soon-title">{title}</h1>
      <p className="gs-soon-body">{body}</p>
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
