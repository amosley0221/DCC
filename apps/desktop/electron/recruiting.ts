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
  stateRank: [148, 12], totalOffers: [176, 6], commitScore: [182, 10],
} as const

/** Interest rows are grouped this many to a prospect, in national-rank order. */
export const TOP_SCHOOLS_PER_RECRUIT = 10

/** The commit score's own range, from the schema. */
export const COMMIT_MAX = 1023
/** Interest is sixteen bits. */
export const INTEREST_MAX = 65535
