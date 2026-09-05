import React, {
  createContext, useContext, useEffect, useMemo, useReducer, useRef, useState,
} from 'react'
import type {
  Convo, Dynasty, LogLine, Persisted, Player, Prospect, QueueItem, Stage, Story,
} from './model'
import { applyTheme, type ThemeMode, type ThemeName } from './theme'
import { SEMANTICS, THEMES } from './theme'

// ── initial state ─────────────────────────────────────────────────────────────

/** The state the app starts in: no dynasty, nothing to show. */
export const blankPersisted = (): Persisted => ({
  dynastySource: 'none',
  savePath: null,
  teamId: null,
  teamNames: {},
  anthropicKey: '',
  revealedRecruits: [],
  revealAllRecruits: false,
  githubToken: '',
  publishRepo: '',
  relayUrl: '',
  relayToken: '',
  theme: 'gold',
  mode: 'dark',
  accent: '#D4AF5A',
  themeChosen: false,
  week: 1,
  heat: 0,
  gameRunning: true,
  leaseHolder: 'gaming-pc',
  queue: [],
  storyStatus: {},
  board: [],
  playerOverrides: {},
  prospectOverrides: {},
  depthOverrides: {},
  convos: {},
  recaps: {},
  extraStories: [],
  log: [],
})

/** Starting state for the bundled sample dynasty. */
export const emptyPersisted = (d: Dynasty): Persisted => ({
  ...blankPersisted(),
  dynastySource: 'sample',
  theme: 'gold',
  mode: 'dark',
  accent: '#D4AF5A',
  week: d.meta.currentWeek,
  heat: 62,
  gameRunning: true,
  leaseHolder: d.devices.holder,
  queue: [],
  storyStatus: {},
  board: [...d.seededBoard],
  playerOverrides: {},
  prospectOverrides: {},
  depthOverrides: {},
  convos: {},
  recaps: {},
  extraStories: [],
  log: [{ at: Date.now(), text: 'agent online — save verified', kind: 'good' }],
})

// ── actions ───────────────────────────────────────────────────────────────────

export type Action =
  | { type: 'hydrate'; state: Persisted }
  | { type: 'theme'; theme: ThemeName }
  | { type: 'mode'; mode: ThemeMode }
  | { type: 'accent'; accent: string }
  | { type: 'week'; week: number }
  | { type: 'heat'; delta: number }
  | { type: 'story'; id: string; status: Story['status'] }
  | { type: 'queue/add'; item: Omit<QueueItem, 'id' | 'at' | 'state'> & { state?: QueueItem['state'] } }
  | { type: 'queue/applyAll' }
  | { type: 'queue/clear' }
  | { type: 'queue/remove'; id: string }
  | { type: 'game'; running: boolean }
  | { type: 'board/toggle'; id: string }
  | { type: 'player/patch'; id: string; patch: Partial<Player> }
  | { type: 'prospect/patch'; id: string; patch: Partial<Prospect> }
  | { type: 'depth/set'; teamId: string; pos: string; order: string[] }
  | { type: 'convo/set'; playerId: string; convo: Convo }
  | { type: 'lease'; holder: string }
  | { type: 'recap'; gameId: string; story: Story }
  | { type: 'log'; line: Omit<LogLine, 'at'> }
  | { type: 'reset'; dynasty: Dynasty }
  | { type: 'loadSample'; dynasty: Dynasty }
  | { type: 'clearDynasty' }
  | { type: 'relay'; url: string; token: string }
  | { type: 'savePath'; path: string | null }
  | { type: 'teamId'; id: number | null }
  | { type: 'teamName'; id: number; name: string | null }
  | { type: 'anthropicKey'; key: string }
  | { type: 'revealRecruit'; playerId: number }
  | { type: 'revealAllRecruits'; on: boolean }
  | { type: 'githubToken'; token: string }
  | { type: 'publishRepo'; repo: string }

let seq = 0
const nextId = () => `q${Date.now().toString(36)}${(seq++).toString(36)}`

function log(state: Persisted, text: string, kind: LogLine['kind'] = 'info'): LogLine[] {
  return [...state.log, { at: Date.now(), text, kind }].slice(-200)
}

export function reducer(state: Persisted, action: Action): Persisted {
  switch (action.type) {
    case 'hydrate':
      return action.state
    case 'theme':
      return { ...state, theme: action.theme, themeChosen: true }
    case 'mode':
      return { ...state, mode: action.mode }
    case 'accent':
      return { ...state, accent: action.accent }
    case 'week':
      return { ...state, week: Math.max(1, Math.min(15, action.week)) }
    case 'heat':
      return { ...state, heat: Math.max(0, Math.min(100, state.heat + action.delta)) }
    case 'story':
      return { ...state, storyStatus: { ...state.storyStatus, [action.id]: action.status } }
    case 'queue/add': {
      const item: QueueItem = {
        id: nextId(),
        at: Date.now(),
        state: action.item.state ?? 'HELD',
        ...action.item,
      }
      return {
        ...state,
        queue: [item, ...state.queue],
        log: log(state, `queued ${item.type.toLowerCase()} — ${item.title}`, 'warn'),
      }
    }
    case 'queue/remove':
      return { ...state, queue: state.queue.filter((q) => q.id !== action.id) }
    case 'queue/applyAll': {
      const held = state.queue.filter((q) => q.state === 'HELD' && !q.needsConfirm)
      if (!held.length) return state
      // Applying is what makes an edit real: overrides move from pending to data.
      let playerOverrides = { ...state.playerOverrides }
      let prospectOverrides = { ...state.prospectOverrides }
      const depthOverrides = { ...state.depthOverrides }
      for (const item of held) {
        const a = item.apply
        if (!a) continue
        if (a.kind === 'ovr') playerOverrides[a.playerId] = { ...playerOverrides[a.playerId], ovr: a.ovr }
        if (a.kind === 'stage') prospectOverrides[a.prospectId] = { ...prospectOverrides[a.prospectId], stage: a.stage }
        if (a.kind === 'depth') depthOverrides[`${a.teamId}:${a.pos}`] = a.order
      }
      const heldIds = new Set(held.map((h) => h.id))
      return {
        ...state,
        gameRunning: false,
        playerOverrides,
        prospectOverrides,
        depthOverrides,
        queue: state.queue.map((q) => (heldIds.has(q.id) ? { ...q, state: 'APPLIED' as const } : q)),
        log: [
          ...state.log,
          { at: Date.now(), text: 'game closed — save unlocked', kind: 'info' as const },
          { at: Date.now(), text: `backup written — restore point ${new Date().toISOString().slice(11, 19)}`, kind: 'good' as const },
          ...held.map((h) => ({ at: Date.now(), text: `applied ${h.type.toLowerCase()} — ${h.title}`, kind: 'good' as const })),
          { at: Date.now(), text: `${held.length} item(s) applied · queue clear`, kind: 'good' as const },
        ].slice(-200),
      }
    }
    case 'queue/clear':
      return { ...state, queue: [], log: log(state, 'queue cleared', 'info') }
    case 'game':
      return {
        ...state,
        gameRunning: action.running,
        log: log(state, action.running ? 'game launched — save locked, writes held' : 'game closed — save unlocked', action.running ? 'warn' : 'good'),
      }
    case 'board/toggle': {
      const on = state.board.includes(action.id)
      return { ...state, board: on ? state.board.filter((b) => b !== action.id) : [action.id, ...state.board] }
    }
    case 'player/patch':
      return { ...state, playerOverrides: { ...state.playerOverrides, [action.id]: { ...state.playerOverrides[action.id], ...action.patch } } }
    case 'prospect/patch':
      return { ...state, prospectOverrides: { ...state.prospectOverrides, [action.id]: { ...state.prospectOverrides[action.id], ...action.patch } } }
    case 'depth/set':
      return { ...state, depthOverrides: { ...state.depthOverrides, [`${action.teamId}:${action.pos}`]: action.order } }
    case 'convo/set':
      return { ...state, convos: { ...state.convos, [action.playerId]: action.convo } }
    case 'lease':
      return { ...state, leaseHolder: action.holder, log: log(state, `save lease → ${action.holder}`, 'warn') }
    case 'recap':
      return {
        ...state,
        extraStories: [action.story, ...state.extraStories],
        recaps: { ...state.recaps, [action.gameId]: action.story.id },
        log: log(state, `recap written — ${action.story.headline}`, 'good'),
      }
    case 'log':
      return { ...state, log: log(state, action.line.text, action.line.kind) }
    case 'reset':
      return { ...emptyPersisted(action.dynasty), theme: state.theme, savePath: state.savePath, teamId: state.teamId, teamNames: state.teamNames, relayUrl: state.relayUrl, relayToken: state.relayToken }
    case 'loadSample':
      return { ...emptyPersisted(action.dynasty), theme: state.theme, savePath: state.savePath, teamId: state.teamId, teamNames: state.teamNames, relayUrl: state.relayUrl, relayToken: state.relayToken }
    case 'clearDynasty':
      return { ...blankPersisted(), theme: state.theme, savePath: state.savePath, teamId: state.teamId, teamNames: state.teamNames, relayUrl: state.relayUrl, relayToken: state.relayToken }
    case 'relay':
      return { ...state, relayUrl: action.url, relayToken: action.token }
    case 'savePath':
      return { ...state, savePath: action.path }
    case 'teamId':
      return { ...state, teamId: action.id }
    case 'anthropicKey':
      return { ...state, anthropicKey: action.key }
    case 'revealRecruit': {
      const has = state.revealedRecruits.includes(action.playerId)
      return {
        ...state,
        revealedRecruits: has
          ? state.revealedRecruits.filter((id) => id !== action.playerId)
          : [...state.revealedRecruits, action.playerId],
      }
    }
    case 'revealAllRecruits':
      // Turning the switch off also forgets the individual reveals, so "hide"
      // means hidden rather than hidden-except-the-ones-you-forgot-about.
      return {
        ...state,
        revealAllRecruits: action.on,
        revealedRecruits: action.on ? state.revealedRecruits : [],
      }
    case 'githubToken':
      return { ...state, githubToken: action.token }
    case 'publishRepo':
      return { ...state, publishRepo: action.repo }
    case 'teamName': {
      const next = { ...state.teamNames }
      if (action.name) next[action.id] = action.name
      else delete next[action.id]
      return { ...state, teamNames: next }
    }
    default:
      return state
  }
}

// ── derived view of the dynasty with pending + applied edits folded in ────────

export interface Derived {
  players: Player[]
  playersById: Map<string, Player>
  prospects: Prospect[]
  prospectsById: Map<string, Prospect>
  teamsById: Map<string, import('./model').Team>
  stories: Story[]
  rosterOf: (teamId: string) => Player[]
  depthOf: (teamId: string, pos: string) => Player[]
  queuedPlayerIds: Set<string>
  queuedProspectIds: Set<string>
  userTeam: import('./model').Team
}

function derive(d: Dynasty, s: Persisted): Derived {
  const players = d.players.map((p) => (s.playerOverrides[p.id] ? { ...p, ...s.playerOverrides[p.id] } : p))
  const prospects = d.prospects.map((p) => (s.prospectOverrides[p.id] ? { ...p, ...s.prospectOverrides[p.id] } : p))
  const playersById = new Map(players.map((p) => [p.id, p]))
  const prospectsById = new Map(prospects.map((p) => [p.id, p]))
  const teamsById = new Map(d.teams.map((t) => [t.id, t]))

  const byTeam = new Map<string, Player[]>()
  for (const p of players) {
    const list = byTeam.get(p.teamId)
    if (list) list.push(p)
    else byTeam.set(p.teamId, [p])
  }

  const stories = [...s.extraStories, ...d.stories].map((st) => ({
    ...st,
    status: s.storyStatus[st.id] ?? st.status,
  }))

  // Anything sitting in the queue unapplied shows a sync dot wherever it appears.
  const queuedPlayerIds = new Set<string>()
  const queuedProspectIds = new Set<string>()
  for (const q of s.queue) {
    if (q.state !== 'HELD') continue
    if (q.apply?.kind === 'ovr') queuedPlayerIds.add(q.apply.playerId)
    if (q.apply?.kind === 'stage') queuedProspectIds.add(q.apply.prospectId)
  }

  return {
    players, playersById, prospects, prospectsById, teamsById, stories,
    queuedPlayerIds, queuedProspectIds,
    userTeam: teamsById.get(d.meta.userTeamId)!,
    rosterOf: (teamId) => (byTeam.get(teamId) ?? []).slice().sort((a, b) => b.ovr - a.ovr),
    depthOf: (teamId, pos) => {
      const group = (byTeam.get(teamId) ?? []).filter((p) => p.pos === pos)
      const order = s.depthOverrides[`${teamId}:${pos}`]
      if (!order) return group.sort((a, b) => b.ovr - a.ovr)
      const rank = new Map(order.map((id, i) => [id, i]))
      return group.sort(
        (a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999) || b.ovr - a.ovr,
      )
    },
  }
}

// ── context ───────────────────────────────────────────────────────────────────

interface Ctx {
  dynasty: Dynasty | null
  state: Persisted
  dispatch: React.Dispatch<Action>
  /** Null until a dynasty is loaded. */
  d: Derived | null
  /** Heat threshold and stage sizes come from the shared token file. */
  sem: typeof SEMANTICS
}

const StoreCtx = createContext<Ctx | null>(null)

export function useStore(): Ctx {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore outside StoreProvider')
  return ctx
}

/**
 * True when the running theme is one of the working ones. Gold Standard
 * is meant to read as a sports site, so screens use this to leave out the
 * notes about what has been decoded, which file is open and how a number was
 * arrived at — everything is still editable, it just does not announce itself.
 */
export function useOps(): boolean {
  return useStore().state.theme !== 'gold'
}

/**
 * For sections that only ever render with a dynasty loaded. The shell shows the
 * empty state instead of mounting them, so this narrows the types in one place
 * rather than every section asserting non-null.
 */
export function useDynasty(): Omit<Ctx, 'dynasty' | 'd'> & { dynasty: Dynasty; d: Derived } {
  const ctx = useStore()
  if (!ctx.dynasty || !ctx.d) throw new Error('useDynasty called with no dynasty loaded')
  return ctx as Omit<Ctx, 'dynasty' | 'd'> & { dynasty: Dynasty; d: Derived }
}

export function StoreProvider({ dynasty, initial, children }: {
  dynasty: Dynasty | null
  initial: Persisted
  children: React.ReactNode
}) {
  const [state, dispatch] = useReducer(reducer, initial)
  const first = useRef(true)

  useEffect(() => { applyTheme(state.theme, state.mode, state.accent) }, [state.theme, state.mode, state.accent])

  // Persist to userData so nothing is lost across an in-place upgrade.
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const t = setTimeout(() => { void window.dcc.setSettings(state as unknown as Record<string, unknown>) }, 350)
    return () => clearTimeout(t)
  }, [state])

  const d = useMemo(() => (dynasty ? derive(dynasty, state) : null), [dynasty, state])
  const value = useMemo(() => ({ dynasty, state, dispatch, d, sem: SEMANTICS }), [dynasty, state, d])

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

/** Loads the dynasty and any saved state before the app renders. */
export function useBootstrap() {
  const [boot, setBoot] = useState<{ dynasty: Dynasty | null; initial: Persisted } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const saved = await window.dcc.getSettings()
        // Merge onto the blank state, so a state file written by an older build
        // still loads after an update adds new fields.
        const merged: Persisted = saved && typeof saved.theme === 'string'
          ? { ...blankPersisted(), ...(saved as unknown as Persisted) }
          : blankPersisted()
        // A new default is worthless if it only reaches new installs, so anyone
        // who never chose a theme moves to the current one. Picking any theme
        // sets themeChosen and this stops touching it for good.
        // A theme that no longer exists would leave every CSS variable unset, so
        // a name this build does not know falls back the same way an unchosen
        // one does.
        const known = merged.theme in THEMES
        const initial: Persisted = merged.themeChosen && known
          ? merged
          : { ...merged, theme: blankPersisted().theme }
        // Nothing is read until a dynasty is actually in use.
        const dynasty = initial.dynastySource === 'none'
          ? null
          : ((await window.dcc.dynasty()) as Dynasty)
        setBoot({ dynasty, initial })
      } catch (e) {
        setError(String((e as Error)?.message ?? e))
      }
    })()
  }, [])

  return { boot, error }
}

export const stageSizeOf = (stage: Stage): number | null =>
  (SEMANTICS.stageSize as Record<string, number>)[stage] ?? null
