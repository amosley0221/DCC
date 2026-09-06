/**
 * Boils the game's type schema down to the part DCC reads.
 *
 * The dump is 32 MB of JSON and carries every enum table and every method on
 * every type. What the app needs is far smaller: for each type, its members in
 * declaration order with a name, a type and — where the schema states one — the
 * range that gives the field its width.
 *
 * Run after replacing the dump:
 *   node scripts/schema-index.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'shared/schema/C27_486_1.gz')
const dest = join(root, 'shared/data/schema-index.json.gz')

if (!existsSync(src)) {
  console.error(`no schema dump at ${src}`)
  process.exit(1)
}

const dump = JSON.parse(gunzipSync(readFileSync(src)).toString('utf8'))

/** Bits a field needs, from the range the schema states. */
const widthOf = (a) => {
  if (a.enum?._members?.length) return Math.max(1, Math.ceil(Math.log2(a.enum._members.length)))
  if (a.type === 'bool') return 1
  if (a.type === 'float') return 32
  if (a.type === 'int' && a.minValue !== undefined) {
    const span = Number(a.maxValue) - Number(a.minValue) + 1
    return Math.max(1, Math.ceil(Math.log2(span)))
  }
  return null
}

const types = {}
for (const [name, t] of Object.entries(dump.schemaMap)) {
  // Every attribute, methods included. The store header counts all of them, so
  // dropping the methods here would make the member count fail to line up with
  // the one the save reports — which is what identifies the type.
  const members = (t.originalAttributesOrder ?? t.attributes ?? [])
    .map((a) => {
      const m = { i: Number(a.index), n: a.name, t: a.type }
      // A method rather than a stored field: nothing to read out of a row.
      if (a.default === undefined && !a.enum && /\(\)$/.test(a.type ?? '')) m.fn = true
      const w = widthOf(a)
      if (w !== null) m.w = w
      if (a.minValue !== undefined) { m.lo = Number(a.minValue); m.hi = Number(a.maxValue) }
      if (a.enum?._members) m.e = a.enum._members.map((x) => x._name)
      return m
    })
  if (members.length) types[name] = members
}

const out = { meta: dump.meta, types }
const bytes = gzipSync(Buffer.from(JSON.stringify(out), 'utf8'), { level: 9 })
writeFileSync(dest, bytes)
console.log(
  `schema index: ${Object.keys(types).length} types, ` +
  `${(bytes.length / 1024).toFixed(0)} KB gzipped -> ${dest}`,
)
