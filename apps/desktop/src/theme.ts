import tokens from '@shared/tokens.json'

export type ThemeName = 'night' | 'field' | 'broadcast'
export type Tokens = typeof tokens
export type ThemeColors = Tokens['themes']['night']['colors']

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
  // One family for everything. The serif headlines and monospace labels are
  // what make the other two themes read as a newspaper and a terminal; a sports
  // broadcast uses a single grotesk at several weights and lets size and weight
  // carry the hierarchy instead.
  broadcast: {
    serif: "'Public Sans', 'Segoe UI', system-ui, sans-serif",
    mono: "'Public Sans', 'Segoe UI', system-ui, sans-serif",
    sans: "'Public Sans', 'Segoe UI', system-ui, sans-serif",
  },
}

/** Writes the active theme onto :root so every rule can read it as a CSS var. */
export function applyTheme(name: ThemeName) {
  const t = THEMES[name]
  const root = document.documentElement.style
  for (const [k, v] of Object.entries(t.colors as Record<string, string>)) root.setProperty(`--${k}`, v)
  for (const [k, v] of Object.entries(FONT_STACK[name])) root.setProperty(`--${k}`, v)
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

export const colors = (name: ThemeName): ThemeColors => THEMES[name].colors
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
