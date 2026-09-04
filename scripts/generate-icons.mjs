#!/usr/bin/env node
/**
 * Generates the app icons from the design tokens so no binary art has to be
 * hand-maintained. Windows gets a .ico (256px PNG-in-ICO, which every modern
 * Windows shell reads); Android uses an adaptive vector icon and needs nothing
 * from here.
 *
 * The mark is the Wire feed itself: a header rule in accent over three stacked
 * story bars in ink, on the Night Wire background.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tokens = JSON.parse(
  (await import('node:fs')).readFileSync(resolve(root, 'shared/tokens.json'), 'utf8'),
)
const c = tokens.themes.night.colors
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

const S = 256
const px = Buffer.alloc(S * S * 4)
const put = (x, y, [r, g, b], a = 255) => {
  if (x < 0 || y < 0 || x >= S || y >= S) return
  const o = (y * S + x) * 4
  px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a
}
const rect = (x, y, w, h, col) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(i, j, col)
}

rect(0, 0, S, S, hex(c.bg0))
// header rule
rect(40, 54, S - 80, 10, hex(c.accent))
// three story bars, decreasing width like a feed
rect(40, 96, S - 80, 20, hex(c.ink))
rect(40, 138, S - 116, 20, hex(c.ink2))
rect(40, 180, S - 150, 20, hex(c.ink3))

// ── minimal PNG encoder ──────────────────────────────────────────────────────
const crcTable = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c2 = n
    for (let k = 0; k < 8; k++) c2 = c2 & 1 ? 0xedb88320 ^ (c2 >>> 1) : c2 >>> 1
    t[n] = c2
  }
  return t
})()
const crc32 = (buf) => {
  let c2 = -1
  for (const b of buf) c2 = crcTable[(c2 ^ b) & 0xff] ^ (c2 >>> 8)
  return (c2 ^ -1) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
// each scanline is prefixed with filter byte 0
const raw = Buffer.alloc(S * (S * 4 + 1))
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0
  px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

// ── ICO wrapper (one 256x256 PNG entry) ──────────────────────────────────────
const icoHeader = Buffer.alloc(6)
icoHeader.writeUInt16LE(0, 0); icoHeader.writeUInt16LE(1, 2); icoHeader.writeUInt16LE(1, 4)
const entry = Buffer.alloc(16)
entry[0] = 0; entry[1] = 0            // 0 means 256
entry[2] = 0; entry[3] = 0
entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6)
entry.writeUInt32LE(png.length, 8)
entry.writeUInt32LE(22, 12)
const ico = Buffer.concat([icoHeader, entry, png])

for (const [p, buf] of [
  ['apps/desktop/build/icon.ico', ico],
  ['apps/desktop/build/icon.png', png],
]) {
  const out = resolve(root, p)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, buf)
  console.log(`wrote ${p} (${buf.length} bytes)`)
}
