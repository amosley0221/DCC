// The art pack is written with nothing but zlib — a PNG encoder, a box
// downscale and a ZIP writer — so all three are checked by reading them back:
// the PNGs through the app's own decoder, and the ZIP through Node's, which is
// the same format the phone's java.util.zip opens.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')
const P = require(process.argv[2])
const G = require(process.argv[3])

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcc-pack-'))

/* ------------------------------------------------ a source image to work from */
// Four quadrants of flat colour with a transparent corner, so a downscale has
// something whose average is known, and so the alpha handling is exercised.
const W = 64, H = 64
const src = Buffer.alloc(W * H * 4)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4
    const right = x >= W / 2, low = y >= H / 2
    const [r, g, b] = low ? (right ? [0, 0, 255] : [0, 255, 0]) : (right ? [255, 0, 0] : [4, 30, 66])
    src[o] = r; src[o + 1] = g; src[o + 2] = b
    src[o + 3] = right && !low ? 0 : 255   // the top-right quadrant is a hole
  }
}
fs.writeFileSync(path.join(dir, 'PennState_OL.png'), P.encodePng(src, W, H))

/* ------------------------------------------------------- the encoder decodes */
{
  const back = G.decodePng(fs.readFileSync(path.join(dir, 'PennState_OL.png')))
  assert.ok(back, 'a PNG this app wrote is one this app can read')
  assert.equal(back.width, W)
  assert.equal(back.height, H)
  assert.deepEqual([...back.px.slice(0, 4)], [4, 30, 66, 255], 'top left is the navy, opaque')
  const tr = ((0 * W) + (W - 1)) * 4
  assert.equal(back.px[tr + 3], 0, 'the top-right corner is still a hole')
}

/* ------------------------------------------------------------- the downscale */
{
  // Halving a 64x64 of four flat quadrants must leave four flat quadrants.
  const half = P.box(src, W, H, 32, 32)
  const at = (x, y) => [...half.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 4)]
  assert.deepEqual(at(0, 0), [4, 30, 66, 255], 'flat colour survives a halving unchanged')
  assert.deepEqual(at(0, 31), [0, 255, 0, 255])
  assert.deepEqual(at(31, 31), [0, 0, 255, 255])
  assert.equal(at(31, 0)[3], 0, 'a fully transparent region stays transparent')

  // A quarter-size box straddles the seam, and the average must be the average
  // — the point of a box filter over nearest neighbour.
  const tiny = P.box(src, W, H, 2, 2)
  assert.deepEqual([...tiny.slice(0, 4)], [4, 30, 66, 255])
  assert.equal(tiny[7], 0, 'the transparent quadrant averages to nothing')

  // An odd size must not read off the end or leave a row blank.
  const odd = P.box(src, W, H, 7, 13)
  assert.equal(odd.length, 7 * 13 * 4)
  assert.ok([...odd].some((v) => v !== 0), 'an odd downscale is not empty')
}

/* ----------------------------------------------------------------- the pack */
{
  fs.writeFileSync(path.join(dir, 'helmet.png'), P.encodePng(src, W, H))
  fs.writeFileSync(path.join(dir, 'face.png'), P.encodePng(src, W, H))
  // Something that is not a PNG at all: it must be counted, not crash the build.
  fs.writeFileSync(path.join(dir, 'broken.dds'), Buffer.from('DDS not a png'))

  const res = P.buildPack({
    root: dir,
    schoolArt: {
      "Penn State|logoLight": 'PennState_OL.png',
      "Penn State|helmet": 'helmet.png',
      "Hawai'i|logoLight": 'broken.dds',
    },
    facePaths: { 'Generic_0001_P_T0000_D_1_1': 'face.png' },
    schoolPx: 32,
    playerPx: 16,
  })

  assert.equal(res.skipped, 1, 'the file that is not a PNG is reported, not hidden')
  assert.deepEqual(res.manifest.schools['Penn State'].sort(), ['helmet', 'logo'])
  assert.ok(!res.manifest.schools["Hawai'i"], 'a school whose art would not read is not claimed')
  assert.deepEqual(res.manifest.players, ['Generic_0001_P_T0000_D_1_1'])

  // Read the ZIP back the way the phone will: central directory, then entries.
  const entries = readZip(res.bytes)
  const names = [...entries.keys()].sort()
  assert.deepEqual(names, [
    'manifest.json',
    'players/Generic_0001_P_T0000_D_1_1.png',
    'schools/Penn_State__helmet.png',
    'schools/Penn_State__logo.png',
  ], 'entry names are the ones the phone looks for')

  const manifest = JSON.parse(entries.get('manifest.json').toString('utf8'))
  assert.equal(manifest.version, P.PACK_VERSION)

  const logo = G.decodePng(entries.get('schools/Penn_State__logo.png'))
  assert.equal(logo.width, 32, 'a school mark comes out at the size asked for')
  assert.deepEqual([...logo.px.slice(0, 4)], [4, 30, 66, 255])

  const face = G.decodePng(entries.get('players/Generic_0001_P_T0000_D_1_1.png'))
  assert.equal(face.width, 16, 'a face comes out at its own size')
}

/* ------------------------------------------------------------------- naming */
{
  // The phone applies the identical rule to find a file, so awkward names have
  // to land somewhere predictable.
  assert.equal(P.safe("Hawai'i"), 'Hawai_i')
  assert.equal(P.safe('App St.'), 'App_St.')
  assert.equal(P.safe('Miami (OH)'), 'Miami_OH_')
  assert.equal(P.safe('Generic_0001_P_T0000_D_1_1'), 'Generic_0001_P_T0000_D_1_1')
}

fs.rmSync(dir, { recursive: true, force: true })
console.log('check-pack: PNGs round-trip, a box downscale averages, the ZIP reads back')

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
