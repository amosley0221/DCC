import { useCallback, useEffect, useRef, useState } from 'react'
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
import { Meta } from './ui'
import UpdateToast from './UpdateToast'

/**
 * DCC is built to hold more than one game. The shell says so: the top bar
 * switches between them, and every bar under it belongs to whichever one is
 * selected. College Football is the one that reads a save today; the others
 * carry what already works for them and say plainly what does not.
 */
const GAMES = [
  { id: 'CFB27', tag: 'CFB', short: 'CFB 27', name: 'College Football 27' },
  { id: 'MADDEN27', tag: 'MAD', short: 'Madden 27', name: 'Madden NFL 27' },
  { id: 'FC27', tag: 'FC', short: 'FC 27', name: 'EA Sports FC 27' },
] as const
type GameId = (typeof GAMES)[number]['id']

type Section =
  | 'WIRE' | 'SCORES' | 'TEAM' | 'RECRUIT' | 'TAMPER' | 'COACH'
  | 'QUEUE' | 'DEVICES' | 'SAVE' | 'EXPORT' | 'NATIONAL' | 'SETTINGS'

const NAV: Record<GameId, { id: Section; label: string }[]> = {
  CFB27: [
    { id: 'WIRE', label: 'Wire' },
    { id: 'SCORES', label: 'Scores' },
    { id: 'TEAM', label: 'Team' },
    { id: 'RECRUIT', label: 'Recruiting' },
    { id: 'TAMPER', label: 'Transfers' },
    { id: 'COACH', label: 'Staff' },
    { id: 'QUEUE', label: 'Queue' },
    { id: 'DEVICES', label: 'Devices' },
    { id: 'SAVE', label: 'Save' },
  ],
  MADDEN27: [{ id: 'EXPORT', label: 'Draft class' }],
  FC27: [],
}

const THIS_MACHINE = 'gaming-pc'

function Shell({ update, version }: { update: UpdateStatus | null; version: string }) {
  const { state, d } = useStore()
  const { save } = useSave()
  const [game, setGame] = useState<GameId>('CFB27')
  const [section, setSection] = useState<Section>('WIRE')

  const nav = NAV[game]
  // Switching games lands on that game's first screen; settings is reachable
  // from every one of them.
  const go = (g: GameId) => {
    setGame(g)
    setSection(NAV[g][0]?.id ?? 'SETTINGS')
  }

  const held = state.queue.filter((q) => q.state === 'HELD').length
  const lostLease = state.leaseHolder !== THIS_MACHINE
  // The press theme is the one meant to read as a sports site, so it does not
  // show the operator's plumbing — whether a save was analysed, which file is
  // open. The other two themes are the working ones and keep it.
  const ops = state.theme !== 'press'

  const me = state.teamId === null ? null : (state.teamNames[state.teamId] ?? TEAM_ID_NAMES[state.teamId] ?? null)
  const crest = me ? (save.schoolArt[`${me}|logoLight`] ?? save.schoolArt[`${me}|icon`]) : undefined

  // Their own record and the week they are living in, which is what the
  // identity bar of a real site carries.
  const record = (() => {
    const games = (save.roster?.games ?? []).filter((g) => g.played && (g.home === me || g.away === me))
    if (!me || !games.length) return null
    let w = 0, l = 0
    for (const g of games) {
      const mine = g.home === me ? g.homeScore : g.awayScore
      const them = g.home === me ? g.awayScore : g.homeScore
      if (mine > them) w++
      else if (mine < them) l++
    }
    return { w, l, week: Math.max(...games.map((g) => g.week)) }
  })()

  // The scores strip: the most recent week the dynasty has actually played,
  // their own week first since that is the one they are living in.
  const ticker = (() => {
    const games = save.roster?.games ?? []
    const played = games.filter((g) => g.played && !g.postseason)
    if (!played.length) return []
    const week = me
      ? Math.max(...played.filter((g) => g.home === me || g.away === me).map((g) => g.week), 0)
      : Math.max(...played.map((g) => g.week))
    return played.filter((g) => g.week === week).slice(0, 18)
  })()

  const active = GAMES.find((g) => g.id === game)!

  return (
    <div className="ps">
      {/* Which game. Everything below this bar belongs to it. */}
      <div className="ps-bar">
        <div className="ps-bar-in">
          <button className="ps-mark" onClick={() => go('CFB27')}>DCC</button>
          <nav className="ps-games">
            {GAMES.map((g) => (
              <button key={g.id} className="ps-game" aria-current={g.id === game} onClick={() => go(g.id)}>
                {g.short}
              </button>
            ))}
          </nav>
          <div className="ps-bar-right">
            {update?.state === 'downloading' ? (
              <span className="ps-pill">Downloading {update.percent}%</span>
            ) : update?.state === 'ready' || update?.state === 'available' ? (
              <button className="ps-pill ps-pill-live" onClick={() => setSection('SETTINGS')}>
                Update {update.version}
              </button>
            ) : null}
            <button
              className="ps-cog"
              aria-current={section === 'SETTINGS'}
              onClick={() => setSection('SETTINGS')}
              title="Settings"
            >
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Scores, on the dark chrome, the way every sports site opens. */}
      {game === 'CFB27' && ticker.length ? (
        <div className="ps-scores no-scrollbar">
          {ticker.map((g) => {
            const homeWon = g.homeScore > g.awayScore
            return (
              <button
                key={g.row}
                className="ps-score"
                onClick={() => { setGame('CFB27'); setSection('SCORES') }}
              >
                <div className={`ps-score-row${homeWon ? ' is-lost' : ''}`}>
                  <span className="ps-score-team">{g.away}</span>
                  <span className="ps-score-num">{g.awayScore}</span>
                </div>
                <div className={`ps-score-row${homeWon ? '' : ' is-lost'}`}>
                  <span className="ps-score-team">{g.home}</span>
                  <span className="ps-score-num">{g.homeScore}</span>
                </div>
                <div className="ps-score-meta">FINAL{g.overtime ? ' / OT' : ''} · WK {g.week}</div>
              </button>
            )
          })}
        </div>
      ) : null}

      {/* Who you are, and the sections of the game you are in. */}
      <header className="ps-nav">
        <div className="ps-nav-in">
          <div className="ps-id">
            {game === 'CFB27' && me ? (
              <>
                {crest ? <img className="ps-crest" src={`dcc-art://${crest}`} alt="" /> : (
                  <span className="ps-crest ps-crest-flat">{active.tag}</span>
                )}
                <span className="ps-id-name">{me}</span>
                {record ? (
                  <>
                    <span className="ps-id-rec">{record.w}-{record.l}</span>
                    <span className="ps-id-week">Week {record.week}</span>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <span className="ps-crest ps-crest-flat">{active.tag}</span>
                <span className="ps-id-name">{active.name}</span>
              </>
            )}
          </div>

          <nav className="ps-sections no-scrollbar">
            {nav.map((n) => (
              <button
                key={n.id}
                className="ps-section"
                aria-current={section === n.id}
                onClick={() => setSection(n.id)}
              >
                {n.label}
                {n.id === 'QUEUE' && held ? <span className="ps-dot">{held}</span> : null}
                {n.id === 'DEVICES' && lostLease ? <span className="ps-dot">!</span> : null}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="ps-page">
        <div className="ps-page-in">
          {section === 'SETTINGS' ? (
            <Settings update={update} version={version} />
          ) : game === 'FC27' ? (
            <Standby
              title="EA Sports FC 27"
              body="Not connected yet. DCC reads College Football 27 saves today and exports a draft class into Madden. FC joins the same shell — its own fixtures, its own squads, its own editing — once its save format is read."
            />
          ) : game === 'MADDEN27' && !d ? (
            <Standby
              title="Draft class"
              body="The exporter turns a College Football class into a Madden draft class. Its file format is read — 5,876 bytes a player, names, positions and ratings all in place — but it builds from a dynasty, so load your save or the sample from Settings first."
            />
          ) : section === 'SAVE' ? (
            <Save />
          ) : section === 'TEAM' && save.report ? (
            <TeamSave />
          ) : section === 'SCORES' && save.report ? (
            <TeamSave view="schedule" />
          ) : section === 'WIRE' && save.report ? (
            <WireSave />
          ) : section === 'RECRUIT' && save.report ? (
            <RecruitSave />
          ) : section === 'TAMPER' && save.report ? (
            <TamperSave />
          ) : section === 'DEVICES' && save.path ? (
            <DevicesSave />
          ) : !d ? (
            <NoDynasty
              section={nav.find((n) => n.id === section)?.label ?? 'This screen'}
              onOpenSettings={() => setSection('SETTINGS')}
            />
          ) : (
            <>
              {section === 'WIRE' ? <Wire /> : null}
              {section === 'SCORES' || section === 'NATIONAL' ? <National /> : null}
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

        <footer className="ps-foot">
          <span className="ps-foot-mark">Dynasty Command Center</span>
          {ops ? (
            <Meta size={9}>v{version} · {save.report ? save.report.name : 'NO SAVE LOADED'}</Meta>
          ) : null}
        </footer>
      </main>

      <UpdateToast status={update} />
    </div>
  )
}

/** A screen DCC is built for but cannot fill yet. Product copy, not a note. */
function Standby({ title, body }: { title: string; body: string }) {
  return (
    <div className="ps-soon">
      <h1 className="ps-soon-title">{title}</h1>
      <p className="ps-soon-body">{body}</p>
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
