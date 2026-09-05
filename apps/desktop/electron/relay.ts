/**
 * The relay: a small HTTP server on the home network so the phone can read the
 * dynasty without a file being copied across, and later send edits back.
 *
 * There is no cloud in this. The save is on the gaming PC, the phone is in the
 * same house, and the desktop app is the only thing that may write to a save, so
 * the shortest correct path is the desktop serving the phone directly over the
 * local network. Nothing leaves the network and nothing is stored anywhere else.
 *
 * It is off until switched on, it binds only while on, and every request must
 * carry a token generated on this machine. That token is the whole access
 * control, so it is compared in constant time and never logged.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readSavePayload } from './saveAnalysis'
import { buildSnapshot } from './snapshot'
import { readPack, snapshotExtras } from './sidecar'
import { writeGameEdits, writePlayerEdits } from './saveWrite'
import type { GameEdit, PlayerEdit } from './saveWrite'

export const DEFAULT_PORT = 7327

export interface RelayState {
  running: boolean
  port: number
  token: string
  /** Every address a phone on this network could reach, best first. */
  urls: string[]
  lastRequest: string | null
  error: string | null
}

export interface RelayContext {
  savePath: () => string | null
  teamId: () => number | null
  /** Called after a write so the app can re-read what changed. */
  onWrite?: () => void
}

let server: Server | null = null
let token = ''
let port = DEFAULT_PORT
let lastRequest: string | null = null
let error: string | null = null

/** Addresses on this machine a phone could actually reach. */
export function lanAddresses(): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list ?? []) {
      if (n.family !== 'IPv4' || n.internal) continue
      out.push(n.address)
    }
  }
  // A 192.168 or 10. address is the one a phone on the same Wi-Fi will reach.
  return out.sort((a, b) => Number(b.startsWith('192.168') || b.startsWith('10.')) - Number(a.startsWith('192.168') || a.startsWith('10.')))
}

const equalTokens = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

function readBody(req: IncomingMessage, limit = 4 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const parts: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) { reject(new Error('request too large')); req.destroy(); return }
      parts.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')))
    req.on('error', reject)
  })
}

function handle(ctx: RelayContext, req: IncomingMessage, res: ServerResponse) {
  const send = (code: number, body: unknown) => {
    const text = JSON.stringify(body)
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(text)
  }
  const url = new URL(req.url ?? '/', 'http://relay')
  lastRequest = `${new Date().toISOString()} ${req.method} ${url.pathname}`

  // The token may come as a bearer header or a query parameter, because a phone
  // opening a link in a browser cannot set headers.
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  const given = bearer || url.searchParams.get('token') || ''
  if (!token || !equalTokens(given, token)) { send(401, { ok: false, message: 'bad or missing token' }); return }

  if (url.pathname === '/ping') { send(200, { ok: true, save: Boolean(ctx.savePath()), teamId: ctx.teamId() }); return }
  // An endpoint that does not exist is a 404 whether or not a save is open;
  // answering "no save" to a typo would send someone looking in the wrong place.
  if (url.pathname !== '/snapshot' && url.pathname !== '/edits' && url.pathname !== '/art') {
    send(404, { ok: false, message: 'no such endpoint' }); return
  }

  // The art pack is not read out of the save, so it is answered before the
  // save check — a phone can be fetching faces while no save is open.
  if (url.pathname === '/art' && req.method === 'GET') {
    const pack = readPack()
    if (!pack) {
      send(409, { ok: false, message: 'no art pack has been built on the PC yet' }); return
    }
    res.writeHead(200, {
      'content-type': 'application/zip',
      'content-length': String(pack.bytes),
      'cache-control': 'no-store',
    })
    // Streamed rather than read into memory: the pack can be a few hundred
    // megabytes, and the phone is already reading it a chunk at a time.
    const stream = createReadStream(pack.file)
    stream.on('error', () => res.destroy())
    stream.pipe(res)
    return
  }

  const path = ctx.savePath()
  if (!path) { send(409, { ok: false, message: 'no save is open on the PC' }); return }

  if (url.pathname === '/snapshot' && req.method === 'GET') {
    try {
      const payload = readSavePayload(path)
      if (!payload) { send(500, { ok: false, message: 'the save could not be read' }); return }
      send(200, buildSnapshot(payload, ctx.teamId(), snapshotExtras()))
    } catch (err) {
      send(500, { ok: false, message: String((err as Error)?.message ?? err) })
    }
    return
  }

  if (url.pathname === '/edits' && req.method === 'POST') {
    void (async () => {
      try {
        const body = JSON.parse(await readBody(req)) as {
          games?: GameEdit[]; players?: PlayerEdit[]; playerCount?: number
        }
        const results: unknown[] = []
        if (body.games?.length) results.push(writeGameEdits(path, body.games))
        if (body.players?.length) {
          if (!body.playerCount) { send(400, { ok: false, message: 'playerCount is required with player edits' }); return }
          results.push(writePlayerEdits(path, body.players, body.playerCount))
        }
        if (!results.length) { send(400, { ok: false, message: 'nothing to change' }); return }
        ctx.onWrite?.()
        send(200, { ok: results.every((r) => (r as { ok: boolean }).ok), results })
      } catch (err) {
        send(400, { ok: false, message: String((err as Error)?.message ?? err) })
      }
    })()
    return
  }

  send(405, { ok: false, message: 'wrong method for that endpoint' })
}

export function relayState(): RelayState {
  return {
    running: Boolean(server?.listening),
    port,
    token,
    urls: lanAddresses().map((a) => `http://${a}:${port}`),
    lastRequest,
    error,
  }
}

/**
 * Starts the relay and waits for the socket to be listening before reporting.
 *
 * `listen` is asynchronous, so returning immediately reports a relay that is not
 * running yet and the screen shows the wrong thing for a moment. Resolving on
 * the `listening` event means the address and code shown are real.
 */
export function startRelay(ctx: RelayContext, wanted = DEFAULT_PORT): Promise<RelayState> {
  stopRelay()
  port = wanted
  // A fresh token each time the relay is switched on, so an old one stops working.
  token = randomBytes(16).toString('hex')
  error = null
  return new Promise((resolve) => {
    try {
      const s = createServer((req, res) => handle(ctx, req, res))
      server = s
      s.once('error', (e) => {
        // The likeliest failure by far is the port already being in use.
        error = String(e?.message ?? e)
        server = null
        token = ''
        resolve(relayState())
      })
      s.once('listening', () => resolve(relayState()))
      s.listen(port, '0.0.0.0')
    } catch (e) {
      error = String((e as Error)?.message ?? e)
      server = null
      token = ''
      resolve(relayState())
    }
  })
}

export function stopRelay(): RelayState {
  server?.close()
  server = null
  token = ''
  return relayState()
}
