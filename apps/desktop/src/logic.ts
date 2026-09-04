import type { ChatMessage, Convo, Player, Prospect, Stage } from './model'
import { SEMANTICS } from './theme'

// ── recruiting ────────────────────────────────────────────────────────────────

export const STAGES: Stage[] = [
  'TOP 8', 'TOP 5', 'TOP 3', 'SOFT COMMIT', 'COMMITTED', 'HARD COMMIT', 'SIGNED', 'DECOMMITTED',
]

export function stageColor(stage: Stage): string {
  const key = (SEMANTICS.recruitStage as Record<string, string>)[stage] ?? 'ink3'
  return `var(--${key})`
}

export interface Interest {
  text: string
  color: string
  /** True when the user's program sits inside the recruit's current cut. */
  inRange: boolean
}

/**
 * The interest line only appears when the user's program is inside the cut the
 * recruit is actually at — being #6 on a TOP 3 board is not interest.
 */
export function interestFor(p: Prospect, myTeamId: string): Interest | null {
  const committedStages: Stage[] = ['SOFT COMMIT', 'COMMITTED', 'HARD COMMIT', 'SIGNED']
  const idx = p.topSchools.indexOf(myTeamId)

  if (committedStages.includes(p.stage)) {
    if (idx === 0) return { text: `COMMITTED TO YOU — ${p.stage}`, color: 'var(--good)', inRange: true }
    return { text: 'COMMITTED ELSEWHERE', color: 'var(--accent)', inRange: false }
  }
  if (p.stage === 'DECOMMITTED') return { text: 'DECOMMITTED — BOARD OPEN', color: 'var(--accent)', inRange: false }
  if (idx === -1) return { text: 'NOT ON HIS BOARD', color: 'var(--ink4)', inRange: false }

  const size = (SEMANTICS.stageSize as Record<string, number>)[p.stage] ?? p.topSchools.length
  const n = idx + 1
  return n <= size
    ? { text: `INTERESTED — YOU #${n} OF THEIR TOP ${size}`, color: 'var(--good)', inRange: true }
    : { text: `NOT INTERESTED — YOU #${n}, OUTSIDE THEIR TOP ${size}`, color: 'var(--ink4)', inRange: false }
}

export const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)

// ── trade ─────────────────────────────────────────────────────────────────────

export const ROSTER_LIMIT = SEMANTICS.roster.limit

export interface TradeSide { teamId: string; out: Player[]; incoming: Player[]; current: number }

export function projectedCount(side: TradeSide): number {
  return side.current - side.out.length + side.incoming.length
}

export function countColor(n: number): string {
  if (n > ROSTER_LIMIT) return 'var(--accent)'
  if (n === ROSTER_LIMIT) return 'var(--warn)'
  return 'var(--good)'
}

/** Rough value read off OVR — steep enough that stars dominate depth pieces. */
export const playerValue = (p: Player) => Math.round(Math.pow(Math.max(0, p.ovr - 55), 1.7))

export function tradeVerdict(mine: Player[], theirs: Player[]): { text: string; color: string; balance: number } {
  const a = mine.reduce((s, p) => s + playerValue(p), 0)
  const b = theirs.reduce((s, p) => s + playerValue(p), 0)
  const total = a + b
  const balance = total === 0 ? 0.5 : b / total
  const gap = b - a
  const tol = Math.max(40, total * 0.08)
  if (Math.abs(gap) <= tol) return { text: 'BALANCED', color: 'var(--ink2)', balance }
  return gap > 0
    ? { text: 'YOU WIN THIS ONE', color: 'var(--good)', balance }
    : { text: 'YOU GIVE UP MORE', color: 'var(--warn)', balance }
}

// ── tampering ─────────────────────────────────────────────────────────────────

export const ROLES = ['Backup', 'Rotational', 'Day-One Starter', 'Featured Playmaker']
export const PROMISES = ['Guaranteed reps', 'NFL development plan', 'His jersey number', 'Collective intro']

export function nilVerdict(offer: number, current: number): { text: string; color: string } {
  if (offer <= current) return { text: 'NOT A RAISE', color: 'var(--accent)' }
  if (offer < current * 1.3) return { text: 'A RAISE', color: 'var(--warn)' }
  return { text: 'INTERESTED', color: 'var(--good)' }
}

export function standing(interest: number): { text: string; color: string } {
  if (interest >= 70) return { text: 'LEADING', color: 'var(--good)' }
  if (interest >= 35) return { text: 'IN THE MIX', color: 'var(--warn)' }
  return { text: 'NOT IN IT YET', color: 'var(--ink3)' }
}

export function newConvo(player: Player): Convo {
  return {
    playerId: player.id,
    messages: [],
    interest: 0,
    status: 'open',
    role: 'Rotational',
    promises: [],
    nilOffer: player.nil,
    contacted: false,
  }
}

/** Keywords that count as addressing each dealbreaker. */
const DEALBREAKER_CUES: Record<string, string[]> = {
  'Championship Contender': ['title', 'championship', 'ring', 'natty', 'playoff', 'contend', 'win it'],
  'Immediate Playing Time': ['start', 'snap', 'reps', 'day one', 'play right away', 'rotation', 'field'],
  'NFL Pipeline': ['nfl', 'draft', 'league', 'pro', 'combine', 'scout'],
  'Close To Home': ['home', 'family', 'mom', 'close', 'drive', 'hometown'],
  'Scheme Fit': ['scheme', 'system', 'fit', 'offense', 'defense', 'role', 'usage'],
}

const REPLIES = {
  cold: [
    'who is this',
    'idk man i’m good where i’m at',
    'we can talk i guess. not making moves rn tho',
    'heard that before ngl',
  ],
  warming: [
    'ok that’s different. keep going',
    'ngl that part matters to me',
    'aight i’m listening',
    'my people would want to hear that too',
  ],
  hot: [
    'fr? that changes things',
    'ok now we talking. what’s the timeline',
    'i’d have to tell my coach but yeah',
    'send it to my guy and let’s set something up',
  ],
  empty: [
    'that’s just words tho',
    'everybody says that',
    'ok but what’s the actual offer',
    'cool story lol',
  ],
  offended: [
    'nah don’t do that',
    'you got me messed up',
    'i’m done talking',
  ],
}

export interface CallResult {
  reply: ChatMessage
  interestDelta: number
  heatDelta: number
  note: string
  burned: boolean
}

/**
 * Local call engine. The relay's model gives richer prose, but the app has to
 * work with the server off, so the same signals are scored here: whether the
 * dealbreaker was actually addressed, whether the money is a real raise, and
 * whether the promised role beats where he already sits on his depth chart.
 */
export function scoreExchange(player: Player, convo: Convo, text: string): CallResult {
  const lower = text.toLowerCase()
  const cues = DEALBREAKER_CUES[player.dealbreaker] ?? []
  const hitsDealbreaker = cues.some((c) => lower.includes(c))
  const insulting = /\b(trash|scrub|bench|nobody|washed|overrated)\b/.test(lower)
  const money = nilVerdict(convo.nilOffer, player.nil)
  const roleIdx = ROLES.indexOf(convo.role)
  // A buried player is receptive to a starting job; a starter is not.
  const roleUpgrade = roleIdx >= 2 && player.depth > 1

  let delta = 0
  const bits: string[] = []

  if (hitsDealbreaker) { delta += 9; bits.push(`hit his dealbreaker (${player.dealbreaker.toLowerCase()})`) }
  else if (text.trim().length > 12) { delta += 1 }

  if (money.text === 'INTERESTED') { delta += 7; bits.push('the money is real') }
  else if (money.text === 'A RAISE') { delta += 3; bits.push('the money is a step up') }
  else { delta -= 3; bits.push('the money is not a raise') }

  if (roleUpgrade) { delta += 5; bits.push(`a starting job beats ${player.pos}${player.depth}`) }
  else if (roleIdx <= 1) { delta -= 2; bits.push('the role you offered is a lateral move') }

  delta += Math.min(4, convo.promises.length * 2)
  if (insulting) delta -= 16

  delta = Math.max(-15, Math.min(20, delta))

  const burned = insulting && convo.interest < 30
  const heatDelta = burned
    ? SEMANTICS.tamper.burnedHeat
    : (convo.contacted ? 0 : SEMANTICS.tamper.firstContactHeat) + (delta < 0 ? 2 : 1)

  const next = Math.max(0, Math.min(100, convo.interest + delta))
  const bank = burned || insulting ? REPLIES.offended
    : next >= 70 ? REPLIES.hot
    : next >= 35 ? REPLIES.warming
    : delta <= 0 ? REPLIES.empty
    : REPLIES.cold

  // Deterministic pick so the same exchange always reads the same way.
  let h = convo.messages.length * 7 + text.length
  const reply = bank[h % bank.length]

  return {
    reply: { from: 'them', text: reply, at: Date.now() },
    interestDelta: delta,
    heatDelta,
    note: bits.length ? `Coach's read: ${bits.join('; ')}.` : "Coach's read: nothing landed.",
    burned,
  }
}

export const TALKING_POINTS = [
  'you’d start week one',
  'we put three at your spot in the league',
  'your family can drive to every home game',
  'the collective is ready for you',
  'we’re playing for a title this year',
]
