/**
 * The half of tampering that talks to the model.
 *
 * Split from `tamper.ts` because the screen imports that one — the week it
 * opens, the resistance and what the number means are all shown to the user —
 * and a renderer bundle that reaches `electron` does not start.
 */
import { net } from 'electron'
import { capMove, resistance } from './tamper'
import type { TamperCoach, TamperTarget, TamperTurn } from './tamper'

const MODEL = 'claude-sonnet-4-5'
const ENDPOINT = 'https://api.anthropic.com/v1/messages'

export interface TamperReply {
  reply: string
  move: number
  /** One word for how he is taking it, for the thread to show. */
  mood: string
  /** True once he has said he is entering the portal. */
  committed?: boolean
}

const ord = (n: number) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th')

/** Everything the model is told, and the only things it is allowed to know. */
export function brief(t: TamperTarget, coach: TamperCoach, interest: number, resist: number): string {
  const lines = [
    `You are ${t.first} ${t.last}, a ${t.position} at ${t.team}. You are between 18 and 21.`,
    `You are rated ${t.overall} overall. ${t.team} are ${t.teamWins}-${t.teamLosses} this season.`,
    t.depth
      ? `You are ${t.depth.string}${ord(t.depth.string)} on the depth chart at ${t.depth.slot}, out of ${t.depth.of}.`
      : 'You are not on the depth chart.',
    '',
    `The head coach at ${coach.team} (${coach.wins}-${coach.losses}) is texting you directly.`,
    'This is against the rules. He is not allowed to contact you, you both know it,',
    'and neither of you will say so outright.',
    '',
    `How willing you are to listen, right now, is ${interest} out of 100.`,
    `How hard you are to move is ${resist} out of 100.`,
  ]
  return lines.join('\n')
}

function systemPrompt(t: TamperTarget, coach: TamperCoach, interest: number, resist: number): string {
  return [
    brief(t, coach, interest, resist),
    '',
    'Reply as him, by text message. Rules:',
    '- One to three sentences. Texting, not speech-writing. Lower case is fine.',
    '- Sound your age. Guarded at first with a stranger, warmer if he earns it.',
    '- The higher your resistance, the more you have to lose by leaving, and the',
    '  more it should take to interest you. If you start, say so. If you are',
    '  buried on the chart, you are more willing to hear him out.',
    '- Never mention ratings, numbers, resistance or interest. You do not know them.',
    '- Do not invent facts about your season, your family or your coaches beyond',
    '  what you are told above. Vague is better than made up.',
    '- If he insults you, is boring, or promises something absurd, react like it.',
    '',
    'Then judge the message you just received:',
    '- move: how much further it moved you toward the portal, -8 to +12.',
    '  0 for a message that landed flat. Negative if it put you off.',
    '- mood: one lower-case word for how you are taking it.',
    '- committed: true only if you have just told him you are entering the portal.',
    '',
    'Reply as JSON only, in this exact shape:',
    '{"reply": "...", "move": 0, "mood": "...", "committed": false}',
  ].join('\n')
}

/**
 * Sends one text and gets his answer.
 *
 * Failures come back as a message rather than an exception: a missing key is
 * the likeliest one and it is not a fault in the program.
 */
export async function sendText(
  apiKey: string,
  t: TamperTarget,
  coach: TamperCoach,
  history: TamperTurn[],
  message: string,
  interest: number,
): Promise<{ ok: true; reply: TamperReply } | { ok: false; message: string }> {
  if (!apiKey.trim()) return { ok: false, message: 'No API key set. Add one in Settings.' }
  if (!message.trim()) return { ok: false, message: 'Write something first.' }

  const { score } = resistance(t, coach)

  const messages = [
    ...history.map((h) => ({
      role: h.from === 'coach' ? 'user' as const : 'assistant' as const,
      content: h.from === 'coach' ? h.text : JSON.stringify({ reply: h.text, move: h.move ?? 0, mood: '', committed: false }),
    })),
    { role: 'user' as const, content: message },
  ]

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
        max_tokens: 512,
        system: systemPrompt(t, coach, interest, score),
        messages,
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
    const parsed = JSON.parse(json) as TamperReply
    if (!parsed.reply) throw new Error('no reply')
    return {
      ok: true,
      reply: {
        reply: String(parsed.reply),
        move: capMove(Number(parsed.move) || 0, score),
        mood: String(parsed.mood ?? '').slice(0, 24),
        committed: parsed.committed === true,
      },
    }
  } catch {
    return { ok: false, message: 'He replied with something DCC could not read. Try again.' }
  }
}
