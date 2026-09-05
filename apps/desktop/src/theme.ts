import tokens from '@shared/tokens.json'

export type ThemeName = 'night' | 'field' | 'gold'
export type ThemeMode = 'dark' | 'light'
export type AccentName = keyof typeof tokens.themes.gold.accents
export type Tokens = typeof tokens
export type ThemeColors = Record<string, string>

export const THEMES = tokens.themes
export const SEMANTICS = tokens.semantics
export const RADII = tokens.radii

const FONT_STACK: Record<ThemeName, { serif: string; mono: string; sans: string }> = {
  night: {
    serif: "'Newsreader', Georgia, 'Times New Roman', serif",
    mono: "'IBM Plex Mono', 'Cascadia Mono', Consolas, monospace",
    sans: "'Public Sans', 'Segoe UI', system-ui, sans-serif",
  },
  field: {
    serif: "'Zilla Slab', Georgia, 'Times New Roman', serif",
    mono: "'Courier Prime', 'Cascadia Mono', Consolas, monospace",
    sans: "'Public Sans', 'Segoe UI', system-ui, sans-serif",
  },
  // Bodoni Moda is the whole personality: a high-contrast didone for anything
  // editorial or numeric. Manrope carries everything functional. The mono slot
  // is Manrope too — Gold Standard has no monospace register.
  gold: {
    serif: "'Bodoni Moda', 'Times New Roman', Georgia, serif",
    mono: "'Manrope', 'Segoe UI', system-ui, sans-serif",
    sans: "'Manrope', 'Segoe UI', system-ui, sans-serif",
  },
}

export const ACCENTS = tokens.themes.gold.accents

/** The four seeded accents, in the order Settings shows them. */
export const ACCENT_LIST = Object.entries(ACCENTS).map(([id, a]) => ({ id: id as AccentName, ...a }))

/**
 * Darkens a hex toward the same hue for use on Gold Standard's paper ground.
 *
 * The wheel lets the user pick any colour, and one that reads well on
 * near-black is usually far too light on cream. Dropping luminance keeps the
 * hue they chose while holding contrast, which is why only one hex is stored.
 */
export function darken(hex: string, amount = 0.42): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const f = (c: number) => Math.round(c * (1 - amount)).toString(16).padStart(2, '0')
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`
}

/**
 * Writes the active theme onto :root so every rule can read it as a CSS var.
 *
 * Gold Standard is the one theme with a mode and a user-chosen accent, so its
 * neutrals come from the mode and everything accent-derived — borders, washes,
 * rules — is computed in CSS from the two hexes set here.
 */
export function applyTheme(name: ThemeName, mode: ThemeMode = 'dark', accent?: string) {
  const t = THEMES[name]
  const root = document.documentElement.style
  const base = t.colors as Record<string, string>
  const over = name === 'gold' && mode === 'light'
    ? (THEMES.gold.modes.light as Record<string, string>)
    : {}
  for (const [k, v] of Object.entries({ ...base, ...over })) root.setProperty(`--${k}`, v)
  for (const [k, v] of Object.entries(FONT_STACK[name])) root.setProperty(`--${k}`, v)
  if (name === 'gold') {
    const hex = accent && /^#?[0-9a-f]{6}$/i.test(accent.trim()) ? accent.trim() : ACCENTS.champagne.dark
    root.setProperty('--accent', hex)
    root.setProperty('--accent-light', darken(hex))
    document.body.dataset.mode = mode
  } else {
    document.body.removeAttribute('data-mode')
  }
  const r = RADII[name]
  root.setProperty('--r-btn', `${r.button}px`)
  root.setProperty('--r-card', `${r.card}px`)
  root.setProperty('--r-bubble', `${r.bubble}px`)
  root.setProperty(
    '--heatFill',
    t.heatFill.kind === 'gradient'
      ? `linear-gradient(90deg, ${t.heatFill.stops.join(', ')})`
      : t.heatFill.stops[0],
  )
  document.body.dataset.theme = name
}

export const colors = (name: ThemeName): ThemeColors => THEMES[name].colors as ThemeColors
export const tones = (name: ThemeName): string[] => THEMES[name].tones

/** Stable per-person tone so a player always gets the same avatar colour. */
export function toneFor(name: string, theme: ThemeName): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const t = tones(theme)
  return t[h % t.length]
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase()
}
