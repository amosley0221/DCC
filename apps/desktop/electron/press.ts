/**
 * Press coverage for a dynasty: previews before a game and recaps after one.
 *
 * The writing is done by a model, but everything it writes about comes from the
 * save. The prompt carries the decoded facts — the teams, records, date,
 * kickoff, conditions, the score and the quarter line when it has been played,
 * and a handful of each roster's best players — and the model is told to use
 * those and invent nothing else. That distinction is the whole point: a story
 * that gets the score wrong is worse than no story.
 *
 * The key is the user's own. It is stored with the app's settings and sent only
 * to Anthropic's API, never anywhere else.
 */
import { net } from 'electron'
import type { SeasonGame } from './saveAnalysis'
import { WEATHER, dateLabel, kickoffLabel } from './gameEnums'

export interface PressPlayer { first: string; last: string; position: string; overall: number }

export interface PressRequest {
  game: SeasonGame
  /** Season record for each side, as far as the save shows. */
  homeRecord?: { wins: number; losses: number }
  awayRecord?: { wins: number; losses: number }
  homePlayers?: PressPlayer[]
  awayPlayers?: PressPlayer[]
  /** The user's own team, so the piece can be written from their side. */
  userTeam?: string | null
  kind: 'preview' | 'recap'
}

export interface PressStory { headline: string; standfirst: string; body: string }

const MODEL = 'claude-sonnet-4-5'
const ENDPOINT = 'https://api.anthropic.com/v1/messages'

/** Everything the model is allowed to know, written out plainly. */
export function factSheet(req: PressRequest): string {
  const g = req.game
  const lines: string[] = []
  const rec = (r?: { wins: number; losses: number }) => (r ? ` (${r.wins}-${r.losses})` : '')
  lines.push(`Week ${g.week}${g.postseason ? ', bowl season' : ''}, ${dateLabel(g.month, g.day)}.`)
  lines.push(`${g.away}${rec(req.awayRecord)} at ${g.home}${rec(req.homeRecord)}.`)
  const k = kickoffLabel(g.kickoff)
  if (k) lines.push(`Kickoff ${k}.`)
  const w = WEATHER[g.weather]
  if (w) lines.push(`Conditions ${w.toLowerCase()}, ${g.temperatureF}°F, wind ${g.windMph} mph.`)
  if (g.attendance) lines.push(`Attendance ${g.attendance.toLocaleString()}.`)
  if (req.kind === 'recap' && g.played) {
    lines.push(`Final: ${g.away} ${g.awayScore}, ${g.home} ${g.homeScore}${g.overtime ? ' after overtime' : ''}.`)
    lines.push(`By quarter — ${g.away}: ${g.awayQ.join(', ')}${g.awayOT ? `, OT ${g.awayOT}` : ''}.`)
    lines.push(`By quarter — ${g.home}: ${g.homeQ.join(', ')}${g.homeOT ? `, OT ${g.homeOT}` : ''}.`)
    lines.push(g.userPlayed ? 'The head coach was on the sideline for this one.' : 'This game was simulated.')
  }
  const roster = (name: string | null, list?: PressPlayer[]) => {
    if (!name || !list?.length) return
    lines.push(`${name}'s best: ${list.slice(0, 6).map((p) => `${p.first} ${p.last} (${p.position}, ${p.overall})`).join('; ')}.`)
  }
  roster(g.away, req.awayPlayers)
  roster(g.home, req.homePlayers)
  if (req.userTeam) lines.push(`The reader coaches ${req.userTeam}.`)
  return lines.join('\n')
}

function prompt(req: PressRequest): string {
  const kind = req.kind === 'preview'
    ? 'a preview written the week before the game'
    : 'a recap written the night of the game'
  return [
    `Write ${kind}, as a college football beat writer would.`,
    '',
    'Facts, which are the only things you know:',
    factSheet(req),
    '',
    'Rules:',
    '- Use only the facts above. Do not invent statistics, quotes, injuries, plays or names.',
    '- If you want to say something you cannot support, leave it out.',
    '- No score prediction in a recap; the score is given.',
    '- Around 180 words of body text. Short paragraphs.',
    '- A headline of at most nine words, and a one-sentence standfirst beneath it.',
    '',
    'Reply as JSON only, in this exact shape:',
    '{"headline": "...", "standfirst": "...", "body": "..."}',
  ].join('\n')
}

/**
 * Calls the API and returns the story. Any failure comes back as a message the
 * user can act on rather than an exception, since a missing or wrong key is the
 * likeliest outcome and is not an error in the program.
 */
export async function writeStory(apiKey: string, req: PressRequest):
Promise<{ ok: true; story: PressStory } | { ok: false; message: string }> {
  if (!apiKey.trim()) return { ok: false, message: 'No API key set. Add one in Settings.' }
  let res: Response
  try {
    res = await net.fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt(req) }],
      }),
    })
  } catch (err) {
    return { ok: false, message: `Could not reach the API: ${String((err as Error)?.message ?? err)}` }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const detail = (() => { try { return JSON.parse(text)?.error?.message } catch { return null } })()
    return { ok: false, message: `The API refused the request (${res.status}). ${detail ?? ''}`.trim() }
  }
  const body = await res.json().catch(() => null) as { content?: { text?: string }[] } | null
  const text = body?.content?.map((c) => c.text ?? '').join('') ?? ''
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  try {
    const story = JSON.parse(json) as PressStory
    if (!story.headline || !story.body) throw new Error('missing fields')
    return { ok: true, story }
  } catch {
    return { ok: false, message: 'The model did not reply with a story DCC could read.' }
  }
}
