// The art pack is a ZIP written by hand, so it is checked by reading it back
// through Node's own unzipper — the same format the phone's java.util.zip
// opens. The images themselves are resized in the renderer on a canvas, which
// is why nothing here decodes one: the game's art is WebP, and the version of
// this that decoded images in the main process skipped every file and shipped a
// 208-byte pack.
const assert = require('node:assert/strict')
const zlib = require('node:zlib')
const P = require(process.argv[2])

/* ---------------------------------------------------------------- the names */
{
  // The phone builds the same name from the school it is drawing, so an awkward
  // one has to land somewhere predictable on both sides.
  assert.equal(P.safe("Hawai'i"), 'Hawai_i')
  assert.equal(P.safe('App St.'), 'App_St.')
  assert.equal(P.safe('Miami (OH)'), 'Miami_OH_')
  assert.equal(P.safe('Generic_0001_P_T0000_D_1_1'), 'Generic_0001_P_T0000_D_1_1')
  assert.equal(P.schoolEntryName('Penn State', 'helmet'), 'schools/Penn_State__helmet.png')
  assert.equal(P.playerEntryName('Generic_0001_P_T0000_D_1_1'),
    'players/Generic_0001_P_T0000_D_1_1.png')
  // A colon is not a filename on Windows, so the kind and the name are joined
  // the same way a school and its mark are.
  assert.equal(P.awardEntryName('trophy:heisman'), 'awards/trophy__heisman.png')
  assert.equal(P.awardEntryName('bowl:rosebowltrophy'), 'awards/bowl__rosebowltrophy.png')
}

/* ------------------------------------------------------- what to carry, once */
{
  // icon and logoLight both mean "the logo", and the icon set is the better
  // mark, so it wins however the two are ordered in the input.
  const plan = P.schoolPlan({
    'Penn State|logoLight': 'a.webp',
    'Penn State|icon': 'b.webp',
    'Penn State|helmet': 'c.webp',
    'Penn State|logoGold': 'd.webp',
    'Penn State|jersey': 'e.webp',
    'Penn State|logoDark': 'f.webp',
    "Hawai'i|icon": 'g.webp',
  })
  const psu = plan.get('Penn State')
  assert.deepEqual([...psu.keys()].sort(), ['gold', 'helmet', 'jersey', 'logo'])
  assert.equal(psu.get('logo'), 'icon', 'the flat icon set is the better mark')
  assert.ok(![...psu.values()].includes('logoDark'), 'the white-on-dark mark is not carried')
  assert.deepEqual([...plan.get("Hawai'i").keys()], ['logo'])
}

/* ---------------------------------------------------------------- the archive */
{
  const png = (n) => Buffer.from(`fake png ${n}`.repeat(4), 'utf8')
  const entries = [
    { name: P.schoolEntryName('Penn State', 'logo'), data: png(1) },
    { name: P.schoolEntryName('Penn State', 'helmet'), data: png(2) },
    { name: P.schoolEntryName("Hawai'i", 'logo'), data: png(3) },
    { name: P.playerEntryName('Generic_0001_P_T0000_D_1_1'), data: png(4) },
    { name: P.awardEntryName('trophy:heisman'), data: png(5) },
    { name: P.awardEntryName('playoff:round1'), data: png(6) },
  ]
  const built = new Date('2026-09-05T12:00:00.000Z')
  const res = P.packEntries(entries, built)

  assert.equal(res.manifest.version, P.PACK_VERSION)
  assert.equal(res.manifest.built, built.toISOString())
  assert.deepEqual([...res.manifest.schools['Penn_State']].sort(), ['helmet', 'logo'])
  assert.deepEqual(res.manifest.players, ['Generic_0001_P_T0000_D_1_1'])
  assert.deepEqual([...res.manifest.awards].sort(), ['playoff:round1', 'trophy:heisman'],
    'the award keys come back out of the entry names')
  assert.equal(res.manifest.bytes, entries.reduce((n, e) => n + e.data.length, 0))

  const back = readZip(res.bytes)
  assert.deepEqual([...back.keys()].sort(), [
    'awards/playoff__round1.png',
    'awards/trophy__heisman.png',
    'manifest.json',
    'players/Generic_0001_P_T0000_D_1_1.png',
    'schools/Hawai_i__logo.png',
    'schools/Penn_State__helmet.png',
    'schools/Penn_State__logo.png',
  ], 'entry names are the ones the phone looks for')

  for (const e of entries) {
    assert.deepEqual(back.get(e.name), e.data, `${e.name} comes back byte for byte`)
  }
  const manifest = JSON.parse(back.get('manifest.json').toString('utf8'))
  assert.deepEqual(manifest, res.manifest, 'the manifest in the archive is the one reported')
}

/* --------------------------------------------------------------- empty pack */
{
  // The failure that shipped: every file skipped, so the archive holds only the
  // manifest. It must still be a valid archive, and must say it has nothing.
  const res = P.packEntries([])
  const back = readZip(res.bytes)
  assert.deepEqual([...back.keys()], ['manifest.json'])
  assert.deepEqual(res.manifest.schools, {})
  assert.deepEqual(res.manifest.players, [])
  assert.deepEqual(res.manifest.awards, [])
}

console.log('check-pack: names round-trip, the plan picks one mark each, the ZIP reads back')

/** Reads a stored-entry ZIP the way any unzipper does: from the end. */
function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  assert.ok(eocd > 0, 'the archive ends with a central directory record')
  const count = buf.readUInt16LE(eocd + 10)
  let at = buf.readUInt32LE(eocd + 16)
  const out = new Map()
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(at), 0x02014b50, 'central directory entry ' + i)
    const method = buf.readUInt16LE(at + 10)
    const crc = buf.readUInt32LE(at + 16)
    const size = buf.readUInt32LE(at + 24)
    const nameLen = buf.readUInt16LE(at + 28)
    const extraLen = buf.readUInt16LE(at + 30)
    const commentLen = buf.readUInt16LE(at + 32)
    const local = buf.readUInt32LE(at + 42)
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen)
    assert.equal(buf.readUInt32LE(local), 0x04034b50, 'local header for ' + name)
    const lNameLen = buf.readUInt16LE(local + 26)
    const lExtraLen = buf.readUInt16LE(local + 28)
    const start = local + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(start, start + size)
    const data = method === 0 ? raw : zlib.inflateRawSync(raw)
    assert.equal(P.crc32(data), crc, 'the CRC in the directory matches ' + name)
    out.set(name, data)
    at += 46 + nameLen + extraLen + commentLen
  }
  return out
}
