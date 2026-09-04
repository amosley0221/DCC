#!/usr/bin/env node
/**
 * Downloads the design's typefaces from Google Fonts so both apps render them
 * offline. Desktop gets woff2; Android gets static ttf (Compose loads font
 * files, not CSS). Run once; the files are committed.
 *
 * All five families are OFL/Apache licensed and redistributable — see
 * shared/fonts/LICENSES.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WOFF2_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
// Google Fonts serves plain TTF to user agents too old to know woff2.
const TTF_UA = 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)'

const FAMILIES = [
  { css: 'Newsreader:wght@400;500;600', file: 'Newsreader', weights: [400, 500, 600] },
  { css: 'IBM+Plex+Mono:wght@400;600', file: 'IBMPlexMono', weights: [400, 600] },
  { css: 'Public+Sans:wght@400;600', file: 'PublicSans', weights: [400, 600] },
  { css: 'Zilla+Slab:wght@400;500;600', file: 'ZillaSlab', weights: [400, 500, 600] },
  { css: 'Courier+Prime:wght@400;700', file: 'CourierPrime', weights: [400, 700] },
]

const get = async (url, ua) => {
  const res = await fetch(url, { headers: { 'User-Agent': ua } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res
}

async function fetchWoff2(fam) {
  const css = await (await get(`https://fonts.googleapis.com/css2?family=${fam.css}&display=swap`, WOFF2_UA)).text()
  // Keep only the latin block; the design has no non-latin copy.
  const blocks = css.split('@font-face').slice(1)
  const out = []
  for (const w of fam.weights) {
    const block = blocks.find(
      (b) => new RegExp(`font-weight:\\s*${w}\\b`).test(b) && /U\+0000-00FF/.test(b),
    ) ?? blocks.find((b) => new RegExp(`font-weight:\\s*${w}\\b`).test(b))
    if (!block) { console.warn(`  ! no latin face for ${fam.file} ${w}`); continue }
    const url = /src:\s*url\(([^)]+)\)/.exec(block)?.[1]
    if (!url) { console.warn(`  ! no src for ${fam.file} ${w}`); continue }
    const buf = Buffer.from(await (await get(url, WOFF2_UA)).arrayBuffer())
    const name = `${fam.file}-${w}.woff2`
    writeFileSync(resolve(root, 'shared/fonts/woff2', name), buf)
    out.push({ name, weight: w, bytes: buf.length })
  }
  return out
}

async function fetchTtf(fam) {
  // The v1 endpoint collapses a variable family to weight 400 when several
  // weights are asked for at once, so each weight is requested on its own.
  const out = []
  for (const w of fam.weights) {
    const css = await (await get(`https://fonts.googleapis.com/css?family=${fam.css.split(':')[0]}:${w}`, TTF_UA)).text()
    const url = /src:\s*url\(([^)]+)\)/.exec(css)?.[1]
    if (!url) { console.warn(`  ! no ttf for ${fam.file} ${w}`); continue }
    const buf = Buffer.from(await (await get(url, TTF_UA)).arrayBuffer())
    // Android resource names must be lowercase with underscores.
    const name = `${fam.file.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()}_${w}.ttf`
    writeFileSync(resolve(root, 'shared/fonts/ttf', name), buf)
    out.push({ name, weight: w, bytes: buf.length })
  }
  return out
}

mkdirSync(resolve(root, 'shared/fonts/woff2'), { recursive: true })
mkdirSync(resolve(root, 'shared/fonts/ttf'), { recursive: true })

for (const fam of FAMILIES) {
  console.log(fam.file)
  const w = await fetchWoff2(fam)
  const t = await fetchTtf(fam)
  console.log(`  woff2: ${w.map((x) => `${x.weight} (${(x.bytes / 1024) | 0}k)`).join(', ') || 'none'}`)
  console.log(`  ttf:   ${t.map((x) => `${x.weight} (${(x.bytes / 1024) | 0}k)`).join(', ') || 'none'}`)
}
