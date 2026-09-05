/**
 * Positions, and the order football reads them in.
 *
 * Its own module, with no imports, because both the main process and the screen
 * need these as values. `saveAnalysis.ts` reaches for `node:zlib`, so anything
 * the renderer imports from it by value drags the whole save reader into the
 * browser bundle and the build fails — or worse, does not.
 */

/**
 * The save's own position enum, a 5-bit field, in the save's own order — which
 * happens to be the order the game lists them in, offense through the kicking
 * game. The index is the stored value, so nothing here may be reordered.
 */
export const POSITIONS = [
  'QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT',
  'LE', 'RE', 'DT', 'LOLB', 'MLB', 'ROLB', 'CB', 'FS', 'SS', 'K', 'P',
]

/** Where a position sorts, for any list of them. */
export const POSITION_RANK = new Map(POSITIONS.map((p, i) => [p, i]))

/** The three units, in position order, for filtering a roster by one of them. */
export const UNITS: [string, string[]][] = [
  ['OFFENSE', ['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT']],
  ['DEFENSE', ['LE', 'RE', 'DT', 'LOLB', 'MLB', 'ROLB', 'CB', 'FS', 'SS']],
  ['SPECIAL TEAMS', ['K', 'P']],
]

/**
 * The order a depth chart is read in, which is not the order it is stored in.
 *
 * The save keeps its 35 slots alphabetically — that is what identified them —
 * so `DEPTH_SLOTS` is alphabetical and must stay that way, because its index is
 * the slot number written back. This is the football order the game itself
 * shows, with each package's variants beside the position they belong to.
 */
export const DEPTH_SLOT_ORDER: string[] = [
  'QB', 'HB', 'PWHB', '3DRB', 'FB', 'WR', 'SLWR', 'GAD', 'TE',
  'LT', 'LG', 'C', 'RG', 'RT',
  'LE', 'RE', 'DT', 'NT', 'RLE', 'RRE', 'RDT',
  'LOLB', 'MLB', 'ROLB', 'SUBLB',
  'CB', 'SLCB', 'FS', 'SS',
  'K', 'KOS', 'P', 'LS', 'KR', 'PR',
]

/** Where a depth-chart slot sorts. */
export const DEPTH_SLOT_RANK = new Map(DEPTH_SLOT_ORDER.map((a, i) => [a, i]))
