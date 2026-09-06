/**
 * The game's own type schema, as DCC reads it.
 *
 * The game ships a dump of every type it stores — 3,526 of them, with member
 * names, declared ranges and full enum tables. It is not a map: it gives no
 * offsets, and the layout rule that turns a member list into bit positions is
 * not cracked. What it does give is the thing that was missing from every
 * decode in this project so far — the *names*.
 *
 * A store that reports four members stops being four anonymous columns and
 * becomes `CurrentRank`, `LastWeekRank`, `Player`, `Team`, each with the range
 * that gives it its width. That is the difference between recognising a field
 * and guessing at one.
 *
 * The dump is 32 MB, so a slim index is built from it by
 * `scripts/schema-index.mjs` and read here.
 */
import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

export interface SchemaMember {
  /** The schema's own index, which is alphabetical within a type. */
  i: number
  /** Member name. */
  n: string
  /** Declared type: int, bool, float, an enum name, another type, an array. */
  t: string
  /** Bits the declared range needs, where the schema states one. */
  w?: number
  lo?: number
  hi?: number
  /** Enum member names, in order. */
  e?: string[]
}

export interface SchemaIndex {
  meta: { major: number; minor: number; gameYear: number }
  types: Record<string, SchemaMember[]>
}

let cache: SchemaIndex | null | undefined

/** The index, or null when the dump has not been built into one. */
export function loadSchema(paths: string[]): SchemaIndex | null {
  if (cache !== undefined) return cache
  for (const p of paths) {
    if (!p || !existsSync(p)) continue
    try {
      cache = JSON.parse(gunzipSync(readFileSync(p)).toString('utf8')) as SchemaIndex
      return cache
    } catch {
      // A corrupt index is the same as none: the app works without it.
    }
  }
  cache = null
  return cache
}

/**
 * The type a store holds, and its members.
 *
 * Most stores are their type plus "Store" — `TeamStore` holds `Team` — but not
 * all: `HeismanRankingStore` holds `HeismanAwardRanking`. Where the name does
 * not resolve, the member count does: a store reporting four members can only
 * hold a type with four, and among those the one whose name shares the most
 * with the store's is the answer. A tie is left unresolved rather than picked.
 */
export function typeForStore(
  schema: SchemaIndex,
  store: string,
  memberCount: number,
): { type: string; members: SchemaMember[] } | null {
  const direct = store.replace(/Store$/, '')
  if (schema.types[direct]) return { type: direct, members: schema.types[direct] }

  const stem = direct.toLowerCase()
  const scored = Object.entries(schema.types)
    .filter(([, members]) => members.length === memberCount)
    .map(([type, members]) => {
      const t = type.toLowerCase()
      // How much of the store's name the type accounts for, from either end.
      let head = 0
      while (head < t.length && head < stem.length && t[head] === stem[head]) head++
      let tail = 0
      while (tail < t.length - head && tail < stem.length - head &&
             t[t.length - 1 - tail] === stem[stem.length - 1 - tail]) tail++
      return { type, members, score: head + tail }
    })
    .sort((a, b) => b.score - a.score)

  if (!scored.length || scored[0].score < 4) return null
  if (scored.length > 1 && scored[1].score === scored[0].score) return null
  return { type: scored[0].type, members: scored[0].members }
}
