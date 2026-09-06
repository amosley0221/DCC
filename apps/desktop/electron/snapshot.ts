/**
 * A dynasty snapshot: everything DCC has decoded out of a save, in one JSON
 * document that any client can read.
 *
 * The desktop app is the only thing that can read a save — the file lives on
 * the gaming PC and the format work is all here. The phone therefore needs the
 * data handed to it, and a snapshot is that hand-off. Today it is written to a
 * file the user moves across; when the relay exists it will carry the identical
 * document, so nothing downstream has to change.
 *
 * Ratings are the one thing not included wholesale. Sixteen thousand players
 * with fifty-two ratings each is tens of megabytes of mostly unread numbers, so
 * full ratings come only for the user's own roster and everyone else carries
 * the fields a list view actually shows.
 */
import {
  RATING_BITS, readCoaches, readRecruitBoard, readRoster, readSeasonGames, readTeamNames,
} from './saveAnalysis'
import type { RosterPlayer, SeasonGame, TeamRecord } from './saveAnalysis'
import { teamTableOrder } from './saveAnalysis'
import { TEAM_ID_NAMES } from './teamIds'
import { currentWeek } from './season'

export const SNAPSHOT_VERSION = 3

export interface SnapshotTeam {
  /** Row in the save's own team table, which is how games refer to a team. */
  index: number
  /** The team id players carry, when it is known. */
  teamId: number | null
  name: string
  fullName: string | null
  abbr: string | null
  nickname: string | null
  conference: string | null
  division: string | null
  coach: string | null
  wins: number
  losses: number
}

export interface SnapshotPlayer {
  index: number
  playerId: number
  first: string
  last: string
  team: number
  position: string
  overall: number
  year: string | null
  dev: string | null
  archetype: string | null
  heightIn: number | null
  weightLb: number | null
  redshirt: boolean
  hometown: string
  state: string | null
  stars: number | null
  nilK: number | null
  assetId: string | null
  /** Only for the user's own roster; everyone else omits it. */
  ratings?: Record<string, number>
}

export interface SnapshotRecruit extends SnapshotPlayer {
  pipeline: string | null
  dealbreaker: string | null
  idealPitch: string | null
  /**
   * The game's own board, read out of the save rather than guessed at from
   * ratings. Null for a prospect with no record, which is how the eight the
   * pool holds beyond the class of 4,100 read.
   */
  nationalRank: number | null
  positionRank: number | null
  stateRank: number | null
  commitScore: number | null
  totalOffers: number | null
  stage: string | null
}

/** One transfer, as the phone reads it: names rather than team ids. */
export interface SnapshotMove {
  key: string
  first: string
  last: string
  position: string
  fromSeason: number
  toSeason: number
  from: string
  to: string
  overallBefore: number
  overallAfter: number
}

/** One tampering conversation, read-only on the phone. */
export interface SnapshotThread {
  key: string
  first: string
  last: string
  position: string
  overall: number
  team: string
  interest: number
  resistance: number
  because: string[]
  mood: string
  committed: boolean
  standing: string
  turns: { from: 'coach' | 'player'; text: string; move?: number }[]
}

export interface DynastySnapshot {
  version: number
  generated: string
  meta: {
    /** The week the save is sitting on: the first with an unplayed game. */
    currentWeek: number | null
    userTeamName: string | null
    userTeamIndex: number | null
    userTeamId: number | null
    ratingNames: string[]
    playerCount: number
  }
  teams: SnapshotTeam[]
  games: SeasonGame[]
  players: SnapshotPlayer[]
  recruits: SnapshotRecruit[]
  /**
   * Everything the desktop keeps beside the save rather than in it: the
   * transfer ledger's moves and the tampering threads. The phone cannot build
   * either — one needs two seasons of saves, the other needs the API key — so
   * they travel with the snapshot or they do not exist there at all.
   */
  transfers: SnapshotMove[]
  threads: SnapshotThread[]
  /**
   * School name to the colour read out of its own logo, and the schools the
   * user has marked as national champions. Neither is in the save — team
   * colours are not decoded and last season's bracket is not in this season's
   * file — so both are worked out on the PC and travel with the snapshot.
   */
  schoolColors: Record<string, string>
  champions: string[]
  /**
   * The game's own ranking, school name to rank, and its Heisman shortlist.
   *
   * Both are found on the PC — a rank is a column of `TeamStore` identified by
   * the shape only a ranking has, and the shortlist is the save's own five-row
   * table — so they travel rather than being worked out twice. Empty when the
   * save did not give them up, and the phone falls back to the same arithmetic
   * the PC would.
   */
  ranks: Record<string, number>
  heisman: SnapshotHeisman[]
}

/** One name on the save's Heisman shortlist. */
export interface SnapshotHeisman {
  rank: number
  /** Roster row, so the phone can find the player it already has. */
  index: number
  first: string
  last: string
  position: string
  overall: number
  team: string | null
}

const UNASSIGNED = 255

/**
 * Whether a player is a recruit rather than someone on a roster.
 *
 * All three conditions are needed, and the team one is what makes it correct.
 * `recruitFlag` is set on more than ten thousand players in a save, because it
 * stays set on everyone who arrived as a recruit — fifty-nine of Penn State's
 * eighty-five have it. What actually separates a recruit from a player is that
 * a recruit is on nobody's roster. With the team check the pool comes out at
 * 4,108, matching an export of the class; without it, at 10,790, and rosters
 * lose two-thirds of their players to it.
 */
export function isRecruit(p: RosterPlayer): boolean {
  return p.team === UNASSIGNED && p.recruitFlag && /^Generic_/.test(p.assetId ?? '')
}

/** Everything a list view shows, without the ratings block. */
function slim(p: RosterPlayer): SnapshotPlayer {
  return {
    index: p.index, playerId: p.playerId, first: p.first, last: p.last,
    team: p.team, position: p.position, overall: p.overall,
    year: p.classYear ?? null,
    dev: p.devTrait ?? null, archetype: p.archetype ?? null,
    heightIn: p.heightIn ?? null, weightLb: p.weightLb ?? null,
    redshirt: p.redshirt, hometown: p.hometown, state: p.homeState ?? null,
    stars: p.stars ?? null, nilK: p.nilK ?? null, assetId: p.assetId ?? null,
  }
}

/**
 * Builds the snapshot. `userTeamId` is the team id the user picked in the
 * desktop app, since the save does not record which roster is theirs.
 */
export function buildSnapshot(
  payload: Buffer,
  userTeamId: number | null,
  extra?: {
    transfers?: SnapshotMove[]; threads?: SnapshotThread[]
    schoolColors?: Record<string, string>; champions?: string[]
    ranks?: Record<string, number>; heisman?: SnapshotHeisman[]
  },
): DynastySnapshot {
  const schools = readTeamNames(payload)
  const order: TeamRecord[] = teamTableOrder(schools)
  const coaches = readCoaches(payload)
  const games = readSeasonGames(payload, schools)
  const players = readRoster(payload)

  // The team table and the team ids players carry are two different orderings;
  // the names are what join them.
  const idByName = new Map<string, number>()
  TEAM_ID_NAMES.forEach((n, i) => { if (n) idByName.set(n, i) })
  const coachById = new Map(coaches.map((c) => [c.teamId, c]))

  const record = new Map<string, { wins: number; losses: number }>()
  for (const g of games) {
    if (!g.played || g.postseason || !g.home || !g.away) continue
    const homeWon = g.homeScore > g.awayScore
    for (const [name, won] of [[g.home, homeWon], [g.away, !homeWon]] as [string, boolean][]) {
      const r = record.get(name) ?? { wins: 0, losses: 0 }
      if (won) r.wins++; else r.losses++
      record.set(name, r)
    }
  }

  const teams: SnapshotTeam[] = order.map((t, index) => {
    const teamId = idByName.get(t.name) ?? null
    const c = teamId === null ? undefined : coachById.get(teamId)
    const r = record.get(t.name) ?? { wins: 0, losses: 0 }
    return {
      index, teamId, name: t.name, fullName: t.fullName, abbr: t.abbr,
      nickname: t.nickname, conference: c?.conference ?? null, division: c?.division ?? null,
      coach: c?.coach ?? null, wins: r.wins, losses: r.losses,
    }
  })

  const userTeamName = userTeamId === null ? null : (TEAM_ID_NAMES[userTeamId] ?? null)
  const userTeamIndex = userTeamName === null ? null
    : (teams.find((t) => t.name === userTeamName)?.index ?? null)

  const week = currentWeek(games, userTeamName)

  const board = new Map(readRecruitBoard(payload, players).map((b) => [b.playerIndex, b]))

  const roster: SnapshotPlayer[] = []
  const recruits: SnapshotRecruit[] = []
  for (const p of players) {
    if (isRecruit(p)) {
      recruits.push({
        ...slim(p),
        // Recruits carry their ratings so the phone has something to reveal when
        // one is scouted. Without them the overall is the whole payoff there,
        // while the desktop shows the full card off the same save.
        ratings: p.ratings,
        pipeline: p.pipeline ?? null, dealbreaker: p.dealbreaker ?? null,
        idealPitch: p.idealPitch ?? null,
        nationalRank: board.get(p.index)?.nationalRank ?? null,
        positionRank: board.get(p.index)?.positionRank ?? null,
        stateRank: board.get(p.index)?.stateRank ?? null,
        commitScore: board.get(p.index)?.commitScore ?? null,
        totalOffers: board.get(p.index)?.totalOffers ?? null,
        stage: board.get(p.index)?.stage ?? null,
      })
      continue
    }
    if (p.team === UNASSIGNED) continue
    const row = slim(p)
    if (userTeamId !== null && p.team === userTeamId) row.ratings = p.ratings
    roster.push(row)
  }

  return {
    version: SNAPSHOT_VERSION,
    generated: new Date().toISOString(),
    meta: {
      currentWeek: week, userTeamName, userTeamIndex, userTeamId,
      ratingNames: Object.keys(RATING_BITS), playerCount: players.length,
    },
    teams, games, players: roster, recruits,
    transfers: extra?.transfers ?? [],
    threads: extra?.threads ?? [],
    schoolColors: extra?.schoolColors ?? {},
    champions: extra?.champions ?? [],
    ranks: extra?.ranks ?? {},
    heisman: extra?.heisman ?? [],
  }
}
