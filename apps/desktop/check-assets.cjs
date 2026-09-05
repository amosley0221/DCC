// Checks the obfuscated-table reader against files we build ourselves, so the
// expected plaintext is known exactly. Run after `npx esbuild electron/
// gameAssets.ts --bundle --platform=node --format=cjs --outfile=...`.
const crypto = require('crypto')
const G = require(process.argv[2])

const WORDS = ['superBundles', 'installChunks', 'totalSize', 'Win32/cranium_sb',
  'Win32/imageassetlibrarysb', 'football_installpackage_00', 'chunks', 'bundles']
function plaintext(reps) {
  const parts = []
  for (let i = 0; i < reps; i++) parts.push(Buffer.from(WORDS[i % WORDS.length], 'latin1'), Buffer.alloc(6 + (i % 9)))
  return Buffer.concat(parts)
}
function obfuscate(plain, key, { header, offset = 0 }) {
  const f = Buffer.alloc(0x22c + plain.length)
  crypto.randomFillSync(f, 8, 0x22c - 8)
  f.writeUInt32BE(0x00d1ce01, 0)
  // `offset` writes the stored key masked by a constant, the way the real
  // files do. The reader has to find that constant rather than assume one.
  if (header) for (let i = 0; i < key.length; i++) f[0x128 + i] = key[i] ^ offset
  for (let i = 0; i < plain.length; i++) f[0x22c + i] = plain[i] ^ key[i % key.length]
  return f
}

let failed = 0
function check(name, ok, detail) {
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? '  — ' + detail : ''))
  if (!ok) failed++
}

// The layout Frostbite actually writes: the key is in the file, so there is
// nothing to search for and nothing to get wrong.
for (const offset of [0x00, 0x7b, 0xa5]) {
  const plain = plaintext(2000)
  const f = obfuscate(plain, crypto.randomBytes(257), { header: true, offset })
  const t = Date.now(); const d = G.deobfuscate(f); const ms = Date.now() - t
  const out = d.best ? G.unscramble(f, d.best) : null
  const tag = 'header key, stored masked with 0x' + offset.toString(16).padStart(2, '0')
  check(tag + ': read, not guessed', !!d.best && d.best.how === 'header' && d.best.keyLength === 257,
    d.best ? d.best.how + '/' + d.best.keyLength : 'unsolved')
  // The whole point: a key that is right except for a constant decodes to text
  // that looks perfect and is wrong in every byte.
  check(tag + ': byte-exact', !!out && out.subarray(0, plain.length).equals(plain))
  check(tag + ': no search', d.tried === 1 && ms < 500, d.tried + ' tried, ' + ms + ' ms')
}

// A header that holds something other than the key must not win on the
// strength of being in the right place. This is layout.toc: it cleared the old
// acceptance bar with 240 long printable runs and decoded to nothing.
{
  const plain = plaintext(2000)
  const real = crypto.randomBytes(13)
  const f = obfuscate(plain, real, { header: false })
  crypto.randomFillSync(f, 0x128, 257)      // a header full of the wrong bytes
  const d = G.deobfuscate(f)
  const out = d.best ? G.unscramble(f, d.best) : null
  check('wrong header key falls through to the search',
    !!d.best && d.best.how === 'search' && out.subarray(0, plain.length).equals(plain),
    d.best ? d.best.how + '/' + d.best.keyLength : 'unsolved')
}

// A file that does not carry a usable key still has to be recovered.
for (const len of [17, 257]) {
  const plain = plaintext(2000)
  const f = obfuscate(plain, crypto.randomBytes(len), { header: false })
  const d = G.deobfuscate(f)
  const out = d.best ? G.unscramble(f, d.best) : null
  check('fallback search, key of ' + len,
    !!d.best && d.best.how === 'search' && d.best.keyLength === len &&
      out.subarray(0, plain.length).equals(plain),
    d.best ? d.best.how + '/' + d.best.keyLength : 'unsolved')
}

// Noise carrying the marker must be refused, or the app reports a solution it
// does not have.
{
  let solved = 0
  for (let i = 0; i < 8; i++) {
    const j = crypto.randomBytes(400000)
    j.writeUInt32BE(0x00d1ce01, 0)
    if (G.deobfuscate(j).best) solved++
  }
  check('noise refused', solved === 0, solved + ' of 8 wrongly solved')
}

// Joining a save to a folder of extracted art. The names are not equal — the
// portraits are dumped as `nilpp_<id>` while the save stores `<id>` — so this
// asserts the id is found inside the filename, and that unrelated images do
// not match anything.
{
  const fs = require('fs'), os = require('os'), path = require('path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcc-faces-'))
  const named = [
    'nilpp_Generic_0001_P_T0000_D_1_1.png',
    'nilpp_Generic_0877_P_T0042_H_6_3.png',
    'nilpp_Unique_AdamsAmare_1.png',
    'nilpp_Blank.png',
    'bowl_rose.png',
  ]
  for (const n of named) fs.writeFileSync(path.join(dir, n), '')
  fs.mkdirSync(path.join(dir, 'nested'))
  fs.writeFileSync(path.join(dir, 'nested', 'nilpp_Generic_0002_P_T0000_D_1_1.png'), '')

  const idx = G.indexFaces(dir)
  check('art folder: walks subdirectories', idx.files === 6, idx.files + ' images')

  const ids = [
    'Generic_0001_P_T0000_D_1_1', 'Generic_0877_P_T0042_H_6_3',
    'Unique_AdamsAmare_1', 'Generic_0002_P_T0000_D_1_1',
    'Generic_9999_P_T0099_D_9_9',
  ]
  const m = G.matchFaces(idx, ids)
  check('art folder: matches through the extractor prefix', m.matched === 4, m.matched + ' of 5')
  check('art folder: a face the save does not name is not invented',
    m.unmatchedSample.length === 1 && m.unmatchedSample[0] === 'Generic_9999_P_T0099_D_9_9')
  // A folder of unrelated pictures must match nothing, or "it worked" means
  // nothing.
  const empty = G.matchFaces(G.indexFaces(dir), ['Generic_1234_P_T0001_D_1_1'])
  check('art folder: no fuzzy matching', empty.matched === 0, empty.matched + ' wrongly matched')
  fs.rmSync(dir, { recursive: true, force: true })
}

/* --------------------------------------------- a school's colour, from a PNG */
// The card behind a player is his school's own colour, read out of its logo.
// That means a PNG decoder, and a decoder that only handles the None filter
// reads as noise rather than failing — so every filter a real PNG uses is
// checked, on a mark shaped the way a logo is: colour on a hole, with white in
// the middle.
{
  const fs = require('fs'), os = require('os'), path = require('path'), zlib = require('node:zlib')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcc-png-'))

  const CRC = (() => {
    const t = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c >>> 0
    }
    return (b) => {
      let c = 0xffffffff
      for (const x of b) c = t[(c ^ x) & 0xff] ^ (c >>> 8)
      return (c ^ 0xffffffff) >>> 0
    }
  })()
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const c = Buffer.alloc(4); c.writeUInt32BE(CRC(td))
    return Buffer.concat([len, td, c])
  }
  const png = (w, h, colorType, pixels, filter) => {
    const ch = colorType === 6 ? 4 : 3
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
    ihdr[8] = 8; ihdr[9] = colorType
    const stride = w * ch
    const raw = Buffer.alloc((stride + 1) * h)
    for (let y = 0; y < h; y++) {
      raw[y * (stride + 1)] = filter
      for (let i = 0; i < stride; i++) {
        const v = pixels[y * stride + i]
        const a = i >= ch ? pixels[y * stride + i - ch] : 0
        const b = y > 0 ? pixels[(y - 1) * stride + i] : 0
        raw[y * (stride + 1) + 1 + i] = (filter === 1 ? v - a : filter === 2 ? v - b : v) & 0xff
      }
    }
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
    ])
  }

  const W = 24, H = 24, NAVY = [0x04, 0x1e, 0x42]
  const rgba = Buffer.alloc(W * H * 4)
  const rgb = Buffer.alloc(W * H * 3)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const mark = x > 3 && x < 20 && y > 3 && y < 20
      const white = x > 9 && x < 14 && y > 9 && y < 14
      const o = (y * W + x) * 4
      rgba[o] = white ? 255 : NAVY[0]
      rgba[o + 1] = white ? 255 : NAVY[1]
      rgba[o + 2] = white ? 255 : NAVY[2]
      rgba[o + 3] = mark ? 255 : 0
      const q = (y * W + x) * 3
      rgb[q] = mark ? NAVY[0] : 255
      rgb[q + 1] = mark ? NAVY[1] : 255
      rgb[q + 2] = mark ? NAVY[2] : 255
    }
  }

  for (const [label, filter] of [['none', 0], ['sub', 1], ['up', 2]]) {
    const p = path.join(dir, `rgba-${filter}.png`)
    fs.writeFileSync(p, png(W, H, 6, rgba, filter))
    check(`school colour: transparent logo, ${label} filter`,
      G.dominantColor(p) === '#041e42', G.dominantColor(p))
  }
  const solid = path.join(dir, 'rgb.png')
  fs.writeFileSync(solid, png(W, H, 2, rgb, 0))
  check('school colour: the paper it is drawn on is not the colour',
    G.dominantColor(solid) === '#041e42', G.dominantColor(solid))

  fs.writeFileSync(path.join(dir, 'junk.png'), Buffer.from('not a png at all'))
  check('school colour: a file that is not a PNG is no colour rather than a wrong one',
    G.dominantColor(path.join(dir, 'junk.png')) === null)
  check('school colour: a file that is not there is no colour',
    G.dominantColor(path.join(dir, 'missing.png')) === null)

  fs.rmSync(dir, { recursive: true, force: true })
}

console.log(failed ? 'ASSET CHECK FAILED' : 'ASSET CHECK OK')
process.exit(failed ? 1 : 0)
