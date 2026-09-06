/**
 * The shape of a recruit's record, with nothing that reads a file.
 *
 * Pure so the renderer can import it: `saveAnalysis` pulls in `node:zlib` and
 * cannot cross the bridge. The reader and the writer both take the layout from
 * here, so a bit position exists once rather than twice.
 */

/** How far along a recruitment is, in the game's own order. */
export const RECRUIT_STAGES = [
  'Top10', 'Top5', 'Top3', 'Battle', 'SoftCommitted', 'HardCommitted', 'Signed',
] as const

export type RecruitStage = typeof RECRUIT_STAGES[number]

/** What the game calls each stage on its own screen. */
export const STAGE_LABEL: Record<string, string> = {
  Top10: 'Top 10', Top5: 'Top 5', Top3: 'Top 3', Battle: 'Battle',
  SoftCommitted: 'Soft commit', HardCommitted: 'Committed', Signed: 'Signed',
}

/** A player, where one record points at another. Read off the Heisman table. */
export const PLAYER_TAG = 0x213e

/** One prospect's record: twenty-four bytes, outside the store directory. */
export const RECRUIT_STRIDE = 24
/** Byte offset of the player reference inside the record. */
export const RECRUIT_PLAYER_AT = 8

/**
 * First bit and width of each field inside the record, found against the game's
 * own class export and checked on three saves.
 */
export const RECRUIT_FIELDS = {
  stage: [96, 4], nationalRank: [100, 13], positionRank: [136, 12],
  stateRank: [148, 12], recruitClass: [162, 4], totalOffers: [176, 6],
  commitScore: [182, 10],
} as const

/**
 * Where a recruit is coming from, in the game's own enum order.
 *
 * The player record has a class too, but it speaks the roster's language: it
 * calls every high-school prospect a Freshman, which is what they will be, not
 * what they are. This is the recruiting class, and it separates a high-school
 * signee from a junior-college transfer the way the game's own board does.
 */
export const RECRUIT_CLASSES = [
  'HighSchool', 'JuniorCollege_Sophomore', 'JuniorCollege_Junior', 'JuniorCollege_Senior',
  'Transfer_Freshman', 'Transfer_Sophomore', 'Transfer_Junior', 'Transfer_Senior',
] as const

/** What to call each on screen. */
export const CLASS_LABEL: Record<string, string> = {
  HighSchool: 'High school',
  JuniorCollege_Sophomore: 'JUCO sophomore',
  JuniorCollege_Junior: 'JUCO junior',
  JuniorCollege_Senior: 'JUCO senior',
  Transfer_Freshman: 'Transfer freshman',
  Transfer_Sophomore: 'Transfer sophomore',
  Transfer_Junior: 'Transfer junior',
  Transfer_Senior: 'Transfer senior',
}

/** Interest rows are grouped this many to a prospect, in national-rank order. */
export const TOP_SCHOOLS_PER_RECRUIT = 10

/** The commit score's own range, from the schema. */
export const COMMIT_MAX = 1023
/** Interest is sixteen bits. */
export const INTEREST_MAX = 65535

/* ------------------------------------------------------------ class rankings */

/** One recruit, as far as a class table cares. */
export interface ClassCommit {
  school: string
  stars: number
  nationalRank: number
  /** Signed, hard or soft — a soft commit still counts, and is marked. */
  firm: boolean
}

export interface ClassRow {
  school: string
  commits: number
  /** Of those, the ones who could still flip. */
  soft: number
  /** How many at each star rating, five down to one. */
  byStar: [number, number, number, number, number]
  /** The best commit's national rank, which is the class's headline. */
  best: number
  points: number
}

/**
 * What one commit is worth to a class.
 *
 * A class is not a headcount — one national top-ten recruit outweighs a dozen
 * two-stars, and every real ranking works that way. This falls off with the
 * national rank rather than stepping at the star boundaries, because the gap
 * between the 20th and 200th recruit is real and both are four stars.
 *
 * The shape is arbitrary in the way any such formula is; what it is not is a
 * guess at the game's own number. The game keeps its own class ranking and DCC
 * has not found it, so this is DCC's ordering of your save's own commits and
 * the screens say so.
 */
export const commitPoints = (nationalRank: number, stars: number): number =>
  (1000 / (Math.max(1, nationalRank) + 45)) + Math.max(0, stars - 1) * 1.5

/** Every school with a commit, strongest class first. */
export function classTable(commits: ClassCommit[]): ClassRow[] {
  const rows = new Map<string, ClassRow>()
  for (const c of commits) {
    if (!c.school) continue
    let row = rows.get(c.school)
    if (!row) {
      row = {
        school: c.school, commits: 0, soft: 0,
        byStar: [0, 0, 0, 0, 0], best: Number.MAX_SAFE_INTEGER, points: 0,
      }
      rows.set(c.school, row)
    }
    row.commits++
    if (!c.firm) row.soft++
    const star = Math.min(5, Math.max(1, c.stars))
    row.byStar[5 - star]++
    if (c.nationalRank > 0 && c.nationalRank < row.best) row.best = c.nationalRank
    row.points += commitPoints(c.nationalRank, star)
  }
  return [...rows.values()]
    .map((r) => ({ ...r, best: r.best === Number.MAX_SAFE_INTEGER ? 0 : r.best }))
    .sort((a, b) => b.points - a.points || a.best - b.best || a.school.localeCompare(b.school))
}

/** The stages that put a recruit in somebody's class. */
export const COMMITTED_STAGES = ['SoftCommitted', 'HardCommitted', 'Signed']
export const isCommitted = (stage: string): boolean => COMMITTED_STAGES.includes(stage)
/** A soft commit counts toward a class but can still flip. */
export const isFirm = (stage: string): boolean => stage === 'HardCommitted' || stage === 'Signed'
