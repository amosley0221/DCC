/** Domain types for the seed dynasty. Mirrors shared/data/dcc-data.json. */

export interface Team {
  id: string; name: string; abbr: string; monogram: string
  conference: string; pipeline: string; isUser: boolean
  tone: number; rank: number; wins: number; losses: number
  prestige: number; trend: 'up' | 'down' | 'flat'
}

export interface Player {
  id: string; name: string; teamId: string; pos: string; ovr: number
  depth: number; year: string; dev: string; archetype: string
  height: string; weight: number; redshirt: boolean; hometown: string
  dealbreaker: string; nil: number
}

export type Stage =
  | 'TOP 8' | 'TOP 5' | 'TOP 3' | 'SOFT COMMIT'
  | 'COMMITTED' | 'HARD COMMIT' | 'SIGNED' | 'DECOMMITTED'

export interface Prospect {
  id: string; name: string; pos: string; stars: number
  natlRank: number; posRank: number; stateRank: number
  ovr: number; ovrRevealed: boolean; archetype: string
  height: string; weight: number; town: string; state: string
  pipeline: string; stage: Stage; commitPoints: number; nil: number
  topSchools: string[]; watchlist: boolean
}

export interface Game {
  id: string; teamId: string; week: number; opponentId: string
  home: boolean; ranked: boolean; rivalry: boolean; kickoff: string
  result: 'W' | 'L' | 'NEXT' | null; score: string | null; storyId: string | null
}

export interface StoryEffect {
  label: string
  targets: { playerId: string; stat: string; delta: number }[]
}

export interface Story {
  id: string; kicker: string; week: number; time: string
  headline: string; body: string
  effect: StoryEffect | null
  status: 'open' | 'approved' | 'dismissed'
  media: string[]
}

export interface Dynasty {
  meta: {
    seed: number; generated: string; season: number
    currentWeek: number; userTeamId: string; rosterLimit: number
  }
  teams: Team[]
  players: Player[]
  prospects: Prospect[]
  schedule: Game[]
  stories: Story[]
  coach: {
    name: string
    record: { wins: number; losses: number }
    titles: number
    drafted: number
    timeline: { school: string; years: string; record: string; note: string }[]
    draftPicks: { name: string; pos: string; round: number; year: number; team: string }[]
    honors: { tag: string; text: string }[]
  }
  national: {
    leaders: { cat: string; rows: { name: string; team: string; value: string }[] }[]
    scores: { home: string; away: string; score: string | null; final: boolean }[]
  }
  devices: {
    holder: string
    machines: { id: string; name: string; role: string; hash: string; lastUpload: string; online: boolean }[]
    history: { version: string; when: string; size: string; machine: string }[]
  }
  seededBoard: string[]
}

// ── mutable app state ─────────────────────────────────────────────────────────

export type QueueType = 'STORY' | 'RECRUIT' | 'ROSTER' | 'TRADE' | 'DEPTH' | 'PORTAL' | 'OFFBOOKS'
export type QueueState = 'HELD' | 'APPLIED' | 'FAILED'

export interface QueueItem {
  id: string
  type: QueueType
  title: string
  detail: string
  state: QueueState
  origin: 'desktop' | 'android'
  at: number
  needsConfirm?: boolean
  /** Set when applying the item should change the underlying data. */
  apply?: { kind: 'ovr'; playerId: string; ovr: number }
       | { kind: 'stage'; prospectId: string; stage: Stage }
       | { kind: 'depth'; teamId: string; pos: string; order: string[] }
       | { kind: 'noop' }
}

export interface ChatMessage { from: 'me' | 'them' | 'system'; text: string; at: number }

export interface Convo {
  playerId: string
  messages: ChatMessage[]
  interest: number
  status: 'open' | 'pledged' | 'burned'
  role: string
  promises: string[]
  nilOffer: number
  contacted: boolean
}

export interface LogLine { at: number; text: string; kind: 'info' | 'good' | 'warn' | 'bad' }

export interface Persisted {
  theme: 'night' | 'field'
  week: number
  heat: number
  gameRunning: boolean
  leaseHolder: string
  queue: QueueItem[]
  storyStatus: Record<string, Story['status']>
  board: string[]
  playerOverrides: Record<string, Partial<Player>>
  prospectOverrides: Record<string, Partial<Prospect>>
  depthOverrides: Record<string, string[]>
  convos: Record<string, Convo>
  recaps: Record<string, string>
  extraStories: Story[]
  log: LogLine[]
}
