#!/usr/bin/env node
/**
 * Generates the Android colour tokens from shared/tokens.json.
 *
 * Android used to carry its whole palette as hand-written `Color(0xFF…)`
 * literals whose only link to the shared tokens was a comment saying so. That
 * is a mirror, not a source, and it drifts the moment either side is edited —
 * which is exactly what happened when the desktop gained Gold Standard and the
 * phone did not. Compose needs Kotlin `Color` objects rather than a JSON read
 * at runtime, so the tokens are compiled into Kotlin here instead, and CI
 * fails if the committed file no longer matches its generator.
 *
 * Everything about *how* the theme is assembled — fonts, composition locals,
 * the accent derivation — stays hand-written in Theme.kt. This file only
 * carries values.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tokens = JSON.parse(readFileSync(resolve(root, 'shared/tokens.json'), 'utf8'))
const OUT = resolve(root, 'apps/android/app/src/main/java/com/dcc/app/ui/theme/Tokens.kt')

/** `#RRGGBB` or an `rgba(r,g,b,a)` from the web tokens to a Compose 0xAARRGGBB. */
function argb(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim())
  if (hex) return `0xFF${hex[1].toUpperCase()}`
  const rgba = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/i.exec(value.trim())
  if (rgba) {
    const [, r, g, b, a] = rgba
    const byte = (n) => Math.round(Number(n)).toString(16).padStart(2, '0').toUpperCase()
    const alpha = Math.round((a === undefined ? 1 : Number(a)) * 255)
    return `0x${alpha.toString(16).padStart(2, '0').toUpperCase()}${byte(r)}${byte(g)}${byte(b)}`
  }
  throw new Error(`cannot express ${value} as a Compose colour`)
}

const color = (v) => `Color(${argb(v)})`

/**
 * The fields a palette carries, and where each comes from in the web tokens.
 *
 * A field with no source in a given theme is emitted as null rather than
 * guessed at. That is how Gold Standard says "this one is mixed from the
 * accent at runtime": the two working themes name every border explicitly, and
 * Gold Standard cannot, because the accent is not known until the user picks
 * one. Theme.kt fills the nulls.
 */
const FIELDS = [
  ['bg0', ['bg0']],
  ['bar', ['bg1']],
  ['surface', ['surface']],
  ['surfaceStrong', ['surfaceStrong', 'surface']],
  ['surfaceLine', ['surfaceLine', 'line']],
  ['line', ['line']],
  ['track', ['track']],
  ['rule', ['rule', 'line']],
  ['sheet', ['sheet', 'surface']],
  ['ink', ['ink']],
  ['ink2', ['ink2']],
  ['ink3', ['ink3']],
  ['ink4', ['ink4']],
  ['accent', ['accent']],
  ['onAccent', ['onAccent']],
  ['good', ['good']],
  ['warn', ['warn']],
  ['btnBg', ['btnBg', 'accent']],
  ['btnInk', ['btnInk', 'onAccent']],
  ['btn2Line', ['btn2Line', 'line']],
  ['btn2Ink', ['btn2Ink', 'ink2']],
  ['heroBg', ['heroBg', 'surfaceStrong', 'surface']],
  ['heroInk', ['heroInk', 'ink']],
  ['heroInk2', ['heroInk2', 'ink2']],
  ['effectBg', ['effectBg', 'surface']],
  ['effectInk', ['effectInk', 'ink2']],
  ['heatBoxBg', ['heatBoxBg', 'surfaceStrong', 'surface']],
]

/** A theme's colours, with a mode's overrides applied when there is one. */
function palette(theme, overrides = {}) {
  const src = { ...theme.colors, ...overrides }
  return FIELDS.map(([field, keys]) => {
    const key = keys.find((k) => src[k] !== undefined)
    return `    ${field} = ${key ? color(src[key]) : 'null'},`
  }).join('\n')
}

/** True when no theme leaves this field to be derived, so it can stay non-null. */
const alwaysSet = ([, keys]) =>
  [tokens.themes.night, tokens.themes.field, tokens.themes.gold]
    .every((t) => keys.some((k) => t.colors[k] !== undefined))

const tones = (theme) => `listOf(${theme.tones.map(color).join(', ')})`
const stops = (theme) => `listOf(${theme.heatFill.stops.map(color).join(', ')})`

const themeBlock = (name, theme, overrides) => `
/** ${theme.label}${overrides ? ' — light mode' : ''}. */
val ${name} = DccPalette(
${palette(theme, overrides)}
    heatStops = ${stops(theme)},
    tones = ${tones(theme)},
)
`

const gold = tokens.themes.gold
const accents = Object.entries(gold.accents)
  .map(([id, a]) => `    DccAccent("${id}", "${a.label}", Color(${argb(a.dark)}), Color(${argb(a.light)})),`)
  .join('\n')

const radii = Object.entries(tokens.radii)
  .map(([name, r]) => `    "${name}" to DccShapes(button = ${r.button}.dp, card = ${r.card}.dp, bubble = ${r.bubble}.dp),`)
  .join('\n')

const out = `package com.dcc.app.ui.theme

// GENERATED FROM shared/tokens.json BY scripts/generate-theme.mjs — DO NOT EDIT.
// Run \`node scripts/generate-theme.mjs\` after changing the shared tokens; CI
// fails if this file and the generator disagree.

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** One theme's fixed colours. Gold Standard's accent-derived values are not
 *  here — they are mixed at runtime from whichever accent the user picked. */
@Immutable
data class DccPalette(
${FIELDS.map((f) => `    val ${f[0]}: Color${alwaysSet(f) ? '' : '?'},`).join('\n')}
    val heatStops: List<Color>,
    val tones: List<Color>,
)

/** A seeded accent: one hex for the dark ground, one darkened for the light. */
@Immutable
data class DccAccent(val id: String, val label: String, val dark: Color, val light: Color)

@Immutable
data class DccShapes(val button: Dp, val card: Dp, val bubble: Dp)
${['night', 'field'].map((n) => themeBlock(n === 'night' ? 'NightWirePalette' : 'FieldOfficePalette', tokens.themes[n])).join('')}${themeBlock('GoldDarkPalette', gold)}${themeBlock('GoldLightPalette', gold, gold.modes.light)}
/** The four presets Settings seeds the wheel with. */
val DccAccents = listOf(
${accents}
)

val DccRadii = mapOf(
${radii}
)

/** The theme ids this build knows, in the order Settings lists them. */
val DccThemeIds = listOf(${Object.keys(tokens.themes).reverse().map((k) => `"${k}"`).join(', ')})

val DccThemeLabels = mapOf(
${Object.entries(tokens.themes).map(([k, t]) => `    "${k}" to "${t.label}",`).join('\n')}
)
`

const prev = (() => { try { return readFileSync(OUT, 'utf8') } catch { return null } })()
if (process.argv.includes('--check')) {
  if (prev !== out) {
    console.error('Tokens.kt is stale — run `node scripts/generate-theme.mjs`')
    process.exit(1)
  }
  console.log('Tokens.kt is in sync with shared/tokens.json')
} else {
  writeFileSync(OUT, out)
  console.log(`wrote ${OUT.replace(root + '/', '')} — ${Object.keys(tokens.themes).length} themes, ${Object.keys(gold.accents).length} accents`)
}
