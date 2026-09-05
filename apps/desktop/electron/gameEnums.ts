/**
 * Enumerations from the game's published schema (C27_486_1), kept free of
 * imports so the renderer can use them without pulling node modules in.
 */

/** `Weather`, 4 bits in a game row. Values past the list are unset. */
export const WEATHER = [
  'Clear', 'Overcast', 'Partly cloudy', 'Windy', 'Light rain', 'Rain', 'Heavy rain',
  'Light snow', 'Snow', 'Heavy snow', 'Dynamic rain', 'Dynamic snow', 'Random',
]

export const weatherName = (v: number): string | null => WEATHER[v] ?? null

/** Kickoff is minutes after midnight; 2047 is the schema's "unset". */
export function kickoffLabel(minutes: number): string | null {
  if (minutes < 0 || minutes >= 1440) return null
  const h = Math.floor(minutes / 60), m = minutes % 60
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const dateLabel = (month: number, day: number) => (MONTHS[month] ? `${MONTHS[month]} ${day}` : '')
