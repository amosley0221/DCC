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

console.log(failed ? 'ASSET CHECK FAILED' : 'ASSET CHECK OK')
process.exit(failed ? 1 : 0)
