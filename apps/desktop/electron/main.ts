import { app, BrowserWindow, ipcMain, shell, dialog, protocol, net } from 'electron'
import { join, resolve, sep } from 'node:path'
import {
  readFileSync, existsSync, writeFileSync, mkdirSync, copyFileSync,
  openSync, writeSync, closeSync, rmSync, statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { autoUpdater } from 'electron-updater'
import {
  analyzeSave, diffSaves, findDictionary, sampleFrames, readSavePayload,
  checkDictionary, decodeFrames, autoFindDictionary, readRoster, readTeamNames,
  RATING_BITS, RATING_PAIRS_UNVERIFIED, readCoaches, readSeasonGames, readStores,
  readDepthCharts, DEPTH_SLOTS, readSeasonOrdinal, TEAM_UNASSIGNED,
  readChampions, teamTableOrder, dumpStore, findTeamRanks, readHeisman,
  findRankColumns, readRankField,
} from './saveAnalysis'
import type { RankColumnView } from './saveAnalysis'
import { buildRecord, fileRecord, moves, paths, yearOf } from './transfers'
import {
  readLedger, readSettings, readThreads, rememberSchoolColors, rememberTitles,
  snapshotExtras, writeLedger, writeSettings, writeThreads,
} from './sidecar'
import type { TamperThread } from './sidecar'
import { TEAM_ID_NAMES } from './teamIds'
import { currentWeek } from './season'
import type { WeekGame } from './season'
import {
  scanInstall, findInstall, readTables, findArtNames, listTocs,
  indexFaces, matchAwards, matchFaces, matchSchools,
} from './gameAssets'
import { writeStory } from './press'
import type { PressRequest } from './press'
import { resistance, standing } from './tamper'
import type { TamperCoach, TamperTarget } from './tamper'
import { sendText } from './tamperTalk'
import { buildSnapshot } from './snapshot'
import { publishArt, publishSnapshot } from './publish'
import { packManifest, zipChunk, zipDirectory } from './artPack'
import type { ZipRecord } from './artPack'
import { rememberHeisman, rememberPack, rememberRanks } from './sidecar'
import { relayState, startRelay, stopRelay } from './relay'
import { writeGameEdits, writePlayerEdits, writeDepthEdits } from './saveWrite'
import type { GameEdit, PlayerEdit, DepthEdit } from './saveWrite'

const isDev = !app.isPackaged
let win: BrowserWindow | null = null

/**
 * The folder of extracted art the user pointed at, and the only place the
 * dccart:// protocol will read from. Held here rather than passed per request
 * so a renderer cannot name its own root and walk out of it.
 */
let faceRoot: string | null = null

/**
 * The last art index, kept so the folder can be searched by name.
 *
 * DCC matches faces, logos, helmets and jerseys by pattern, and anything whose
 * naming scheme is not yet known — bowl crests, trophies, stadiums — is
 * invisible until someone looks. This is what lets the art screen answer "what
 * is in here called", without re-walking a folder of a hundred thousand files
 * on every keystroke.
 */
let faceIndexMap: Record<string, string> = {}


/**
 * The seed dynasty ships as an extraResource in the packaged app and sits in
 * the repo during development.
 */
function loadDynasty(): unknown {
  const candidates = [
    join(process.resourcesPath ?? '', 'dcc-data.json'),
    join(app.getAppPath(), '../../../shared/data/dcc-data.json'),
    join(app.getAppPath(), '../../shared/data/dcc-data.json'),
  ]
  for (const c of candidates) {
    if (c && existsSync(c)) return JSON.parse(readFileSync(c, 'utf8'))
  }
  throw new Error(`dcc-data.json not found. Looked in:\n${candidates.join('\n')}`)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#131110',
    title: 'Dynasty Command Center',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => win?.show())

  // Anything that is not the app itself opens in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServer = process.env.VITE_DEV_SERVER_URL
  if (isDev && devServer) win.loadURL(devServer)
  else win.loadFile(join(__dirname, '../renderer/index.html'))

  win.on('closed', () => { win = null })
}

// ── auto update ───────────────────────────────────────────────────────────────
// The published NSIS installer upgrades over the existing install, so an update
// never asks the user to remove the old version.
function setupUpdater() {
  // The app asks before downloading rather than pulling ~80 MB unannounced;
  // the renderer shows a prompt with a Download button.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // The renderer subscribes only once React has mounted, which can be after the
  // first check completes. Without a record of the last status that event is
  // dropped and no prompt ever appears, so it is kept and replayed on request.
  let lastStatus: unknown = null
  const send = (channel: string, payload?: unknown) => {
    if (channel === 'update:status') lastStatus = payload
    win?.webContents.send(channel, payload)
  }
  ipcMain.handle('update:last', () => lastStatus)

  autoUpdater.on('checking-for-update', () => send('update:status', { state: 'checking' }))
  autoUpdater.on('update-not-available', (info) =>
    send('update:status', { state: 'current', version: info.version }))
  autoUpdater.on('update-available', (info) =>
    send('update:status', { state: 'available', version: info.version, notes: info.releaseNotes }))
  autoUpdater.on('download-progress', (p) =>
    send('update:status', { state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) =>
    send('update:status', { state: 'ready', version: info.version, notes: info.releaseNotes }))
  autoUpdater.on('error', (err) =>
    send('update:status', { state: 'error', message: String(err?.message ?? err) }))

  ipcMain.handle('update:check', async () => {
    if (isDev) return { state: 'dev' }
    try {
      const res = await autoUpdater.checkForUpdates()
      return { state: 'checked', version: res?.updateInfo.version }
    } catch (err) {
      return { state: 'error', message: String((err as Error)?.message ?? err) }
    }
  })

  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true as const }
    } catch (err) {
      const message = String((err as Error)?.message ?? err)
      send('update:status', { state: 'error', message })
      return { ok: false as const, message }
    }
  })

  ipcMain.handle('update:install', () => {
    // isSilent=false so the user sees the assisted installer; it replaces the
    // current install in place.
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
    return true
  })

  if (!isDev) {
    const check = () => autoUpdater.checkForUpdates().catch(() => {})
    setTimeout(check, 4000)
    // Half-hourly rather than a few times a day: a release published while the
    // app is open should surface in a reasonable time.
    setInterval(check, 30 * 60 * 1000)

    // Coming back to the window is a good moment to look, throttled so that
    // alt-tabbing does not hammer GitHub.
    let lastFocusCheck = 0
    win?.on('focus', () => {
      const now = Date.now()
      if (now - lastFocusCheck < 5 * 60 * 1000) return
      lastFocusCheck = now
      check()
    })
  }
}

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  isDev,
  userData: app.getPath('userData'),
}))
ipcMain.handle('app:dynasty', () => loadDynasty())
ipcMain.handle('settings:get', () => readSettings())
ipcMain.handle('settings:set', (_e, next: Record<string, unknown>) => {
  writeSettings(next)
  return true
})
ipcMain.handle('app:openExternal', (_e, url: string) => shell.openExternal(url))

// ── dynasty save ──────────────────────────────────────────────────────────────
ipcMain.handle('save:pick', async () => {
  const res = await dialog.showOpenDialog(win!, {
    title: 'Choose your dynasty save',
    properties: ['openFile'],
    filters: [
      { name: 'Dynasty save', extensions: ['sav', 'dat', 'bin', 'db'] },
      { name: 'All files', extensions: ['*'] },
    ],
  })
  return res.canceled ? null : res.filePaths[0]
})

ipcMain.handle('save:analyze', (_e, path: string) => {
  try {
    return { ok: true as const, report: analyzeSave(path) }
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})

/**
 * A store's rows, written to a file for reading by eye.
 *
 * The store directory says what tables the save holds; it does not say which
 * column is which. Every field decoded so far was found by looking at rows
 * beside a value already known, and this is what makes that possible without
 * a hex editor: pick a store by name, get its rows.
 */
ipcMain.handle('save:dumpStore', async (_e, { path, name, rows }: {
  path: string; name: string; rows?: number
}) => {
  try {
    const payload = readSavePayload(path)
    if (!payload) return { ok: false as const, message: 'That file does not contain a readable payload.' }
    const dump = dumpStore(payload, name, Math.max(1, Math.min(rows ?? 40, 400)))
    if (!dump) return { ok: false as const, message: `No store called ${name} in this save.` }
    const text = [
      `# ${dump.name}`,
      '',
      `- ${dump.rows.toLocaleString()} rows of ${dump.rowBytes} bytes, ${dump.members} members`,
      `- header words: ${dump.memberBits.join(' ')}`,
      '',
      '```',
      ...dump.lines,
      '```',
      '',
    ].join('\n')
    const dest = await dialog.showSaveDialog(win!, {
      title: `Save the ${name} dump`,
      defaultPath: `${name}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (dest.canceled || !dest.filePath) return { ok: false as const, message: 'cancelled' }
    writeFileSync(dest.filePath, text)
    return { ok: true as const, file: dest.filePath, rows: dump.rows, rowBytes: dump.rowBytes }
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})

ipcMain.handle('save:depth', (_e, path: string) => {
  try {
    const payload = readSavePayload(path)
    if (!payload) return { ok: false as const, message: 'That file does not contain a readable payload.' }
    const rows = new Set(readRoster(payload).map((p) => p.index))
    const charts = readDepthCharts(payload, rows)
    if (!charts) return { ok: false as const, message: 'DCC could not find a depth chart in this save.' }
    // Offsets are the writer's business, not the renderer's — it works in team
    // blocks and slot numbers, and sending them would only invite a UI to do
    // arithmetic on a file it cannot see.
    return {
      ok: true as const,
      slots: DEPTH_SLOTS,
      charts: charts.map((c) => ({ block: c.block, slots: c.slots.map((s) => s.rows) })),
    }
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})

ipcMain.handle('save:writeDepth', (_e, path: string, edits: DepthEdit[]) => writeDepthEdits(path, edits))

ipcMain.handle('save:roster', (_e, path: string, teamId?: number | null) => {
  try {
    const payload = readSavePayload(path)
    if (!payload) return { ok: false as const, message: 'That file does not contain a readable payload.' }
    const players = readRoster(payload)
    const schools = readTeamNames(payload)
    const games = readSeasonGames(payload, schools)
    const season = readSeasonOrdinal(payload)
    // Who won each season. The game table has the bowls but not the playoff,
    // so this is the only place the champion is named.
    const order = teamTableOrder(schools)
    const titles = readChampions(payload).map((t) => ({
      season: t.season,
      champion: order[t.championIndex]?.name ?? null,
      runnerUp: order[t.runnerUpIndex]?.name ?? null,
    }))
    rememberTitles(titles)

    // The game's own numbers, found rather than guessed at. A ranking is a
    // column of TeamStore that holds every rank exactly once; the Heisman watch
    // is the save's own five-row shortlist. Both are searched for by a property
    // only the real thing has, so a wrong answer is not one of the outcomes —
    // finding nothing is.
    const rankColumns: RankColumnView[] = findTeamRanks(payload).map((c) => ({
      at: c.at, width: c.width, kind: c.kind,
      ranks: Object.fromEntries(
        Object.entries(c.ranks).map(([i, rank]) => [order[Number(i)]?.name ?? `Team ${i}`, rank]),
      ),
    }))
    // The polls the user has found and named lead the list, because each has an
    // answer key behind it. The game keeps three — CFP, media and coaches — and
    // they differ, so DCC keeps three rather than picking one for you.
    for (const poll of savedPolls().slice().reverse()) {
      const vals = readRankField(payload, poll.at, poll.width)
      const ranks: Record<string, number> = {}
      vals.forEach((v, i) => {
        const place = v + (1 - poll.base)
        const school = order[i]?.name
        if (school && place >= 1 && place <= vals.length) ranks[school] = place
      })
      if (Object.keys(ranks).length >= 10) {
        rankColumns.unshift({ at: poll.at, width: poll.width, name: poll.name, kind: 'top25', ranks })
      }
    }

    lastRankColumns = rankColumns
    // One column and there is nothing to choose between; more than one and the
    // user picks in League → Rankings, because nothing in the file says which
    // of them is the AP and which is the coaches'.
    rememberRanks(rankColumns.length === 1 ? rankColumns[0].ranks : chosenRanks(rankColumns))

    const byRow = new Map(players.map((p) => [p.index, p]))
    const heismanRows = readHeisman(payload, players)
    const heisman = heismanRows.map((h) => {
      const p = byRow.get(h.playerIndex)
      return {
        rank: h.rank,
        index: h.playerIndex,
        first: p?.first ?? null,
        last: p?.last ?? null,
        position: p?.position ?? null,
        overall: p?.overall ?? null,
        team: p ? p.team : null,
        words: h.words,
      }
    })

    rememberHeisman(heisman
      .filter((h) => h.index >= 0)
      .map((h) => ({
        rank: h.rank, index: h.index,
        first: h.first ?? '', last: h.last ?? '',
        position: h.position ?? '', overall: h.overall ?? 0,
        team: h.team === null ? null : TEAM_ID_NAMES[h.team] ?? null,
      })))

    // File the roster in the transfer ledger while the save is already open.
    // Doing it here rather than on demand is the whole point: a season the user
    // never opened DCC in is a season that can never be diffed, and the moment
    // to catch it is whenever they read a save.
    if (season) {
      try {
        const week = weekOf(games, teamId ?? null)
        writeLedger(fileRecord(readLedger(), buildRecord(players, {
          season, week, unassigned: TEAM_UNASSIGNED,
        })))
      } catch {
        // A ledger that cannot be written must not cost the user their roster.
      }
    }

    // The renderer only ever shows a page at a time; sending 16,000 full rating
    // sets across the bridge would cost more than reading the save did.
    return {
      ok: true as const,
      count: players.length,
      ratingNames: Object.keys(RATING_BITS),
      schools,
      coaches: readCoaches(payload),
      stores: readStores(payload),
      games,
      season,
      titles,
      unverifiedPairs: RATING_PAIRS_UNVERIFIED,
      players,
      rankColumns,
      heisman,
    }
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})

/**
 * The ranking columns the last roster pass found, and which one the user picked.
 *
 * Held so the choice can be applied without re-reading the save: the phone's
 * snapshot has to carry one ranking, and which one is a decision made on a
 * screen rather than something the file states.
 */
let lastRankColumns: { ranks: Record<string, number> }[] = []
let pollChoice = -1

const chosenRanks = (columns: { ranks: Record<string, number> }[]) =>
  (pollChoice >= 0 && pollChoice < columns.length ? columns[pollChoice].ranks : {})

/**
 * Fields of the team table where the ranks you named actually appear.
 *
 * Sweeping for the shape of a ranking found nothing in a real save, which is
 * evidence rather than failure: a poll leaves the unranked holding whatever
 * they held last week, so it is not a clean permutation. One rank read off the
 * game's own screen is a better key than any shape.
 */
ipcMain.handle('poll:find', (_e, { path, known }: {
  path: string
  known: { team: string; rank: number }[]
}) => {
  try {
    const payload = readSavePayload(path)
    if (!payload) return { ok: false as const, message: 'That file does not contain a readable payload.' }
    const order = teamTableOrder(readTeamNames(payload))
    const byName = new Map<string, number>()
    order.forEach((t, i) => { if (t?.name) byName.set(t.name, i) })

    const asked = known
      .map((k) => ({ teamIndex: byName.get(k.team) ?? -1, rank: Math.round(k.rank) }))
      .filter((k) => k.teamIndex >= 0 && k.rank >= 1)
    if (!asked.length) return { ok: false as const, message: 'DCC does not know that school by that name.' }

    const found = findRankColumns(payload, asked).map((c) => ({
      at: c.at, width: c.width, base: c.base, ranked: c.ranked,
      top: Object.entries(c.ranks)
        .map(([i, rank]) => ({ name: order[Number(i)]?.name ?? `Team ${i}`, rank }))
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 12),
    }))
    return { ok: true as const, found }
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})

/** One poll the user has found and named: CFP, media or coaches. */
interface SavedPoll { name: string; at: number; width: number; base: 0 | 1 }

const savedPolls = (): SavedPoll[] => {
  const raw = readSettings().polls
  if (!Array.isArray(raw)) return []
  return raw.filter((p): p is SavedPoll =>
    !!p && typeof p === 'object' &&
    typeof (p as SavedPoll).name === 'string' &&
    Number.isFinite((p as SavedPoll).at) && Number.isFinite((p as SavedPoll).width))
}

/**
 * Remember a field the user recognised, under the name the game gives it.
 *
 * Three rather than one, because the game keeps three and they disagree: its
 * own screen switches between CFP, media and coaches, and which one a number
 * came from is part of what the number means.
 */
ipcMain.handle('poll:use', (_e, poll: SavedPoll | null) => {
  const next = { ...readSettings() }
  const kept = savedPolls().filter((p) => !poll || p.name !== poll.name)
  next.polls = poll ? [...kept, poll] : kept
  // The single column this replaced is not read any more.
  delete next.pollColumn
  writeSettings(next)
  return { ok: true as const, polls: next.polls }
})

/** Forget one by name, when it turns out to have been the wrong field. */
ipcMain.handle('poll:forget', (_e, name: string) => {
  const next = { ...readSettings() }
  next.polls = savedPolls().filter((p) => p.name !== name)
  writeSettings(next)
  return { ok: true as const, polls: next.polls }
})

ipcMain.handle('poll:saved', () => ({ ok: true as const, polls: savedPolls() }))

ipcMain.handle('poll:choose', (_e, index: number) => {
  pollChoice = Number.isFinite(index) ? Number(index) : -1
  rememberRanks(
    lastRankColumns.length === 1 && pollChoice < 0
      ? lastRankColumns[0].ranks
      : chosenRanks(lastRankColumns),
  )
  return { ok: true as const }
})

/** The week a save is sitting on. Null without a team, since it is per team. */
const weekOf = (games: WeekGame[], teamId: number | null) =>
  currentWeek(games, teamId === null ? null : TEAM_ID_NAMES[teamId] ?? null)

ipcMain.handle('transfers:read', () => {
  const ledger = readLedger()
  const seasons = ledger.records
    .map((r) => ({ season: r.season, week: r.week, recordedAt: r.recordedAt, players: r.players.length }))
    .sort((a, b) => a.season - b.season)
  return {
    latestYear: ledger.latestYear ?? null,
    seasons,
    years: Object.fromEntries(seasons.map((s) => [s.season, yearOf(ledger, s.season)])),
    moves: moves(ledger),
    paths: paths(ledger),
  }
})

ipcMain.handle('transfers:setYear', (_e, year: number | null) => {
  const ledger = readLedger()
  writeLedger({ ...ledger, latestYear: year && Number.isFinite(year) ? Math.round(year) : null })
  return { ok: true as const }
})

ipcMain.handle('transfers:forget', (_e, season: number) => {
  const ledger = readLedger()
  writeLedger({ ...ledger, records: ledger.records.filter((r) => r.season !== season) })
  return { ok: true as const }
})

// The relay needs to know which save is open and which team is the user's, and
// both live in the renderer's state, so the renderer hands them over when it
// starts the relay rather than the main process guessing.
let relaySave: string | null = null
let relayTeam: number | null = null

ipcMain.handle('relay:publish', async (_e, { path, teamId, repo }: {
  path: string; teamId: number | null; repo: string
}) => {
  try {
    const payload = readSavePayload(path)
    if (!payload) return { ok: false as const, message: 'That file does not contain a readable payload.' }
    const token = String(readSettings().githubToken ?? '')
    return await publishSnapshot({ repo, token }, buildSnapshot(payload, teamId, snapshotExtras()))
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})

ipcMain.handle('relay:start', (_e, { path, teamId, port }: { path: string | null; teamId: number | null; port?: number }) => {
  relaySave = path
  relayTeam = teamId
  return startRelay({ savePath: () => relaySave, teamId: () => relayTeam }, port)
})
ipcMain.handle('relay:stop', () => stopRelay())
ipcMain.handle('relay:state', (_e, ctx?: { path: string | null; teamId: number | null }) => {
  if (ctx) { relaySave = ctx.path; relayTeam = ctx.teamId }
  return relayState()
})

ipcMain.handle('save:writePlayers', (_e, { path, edits, playerCount }: {
  path: string; edits: PlayerEdit[]; playerCount: number
}) => {
  try {
    return writePlayerEdits(path, edits, playerCount)
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})

ipcMain.handle('press:write', async (_e, req: PressRequest) => {
  const key = String(readSettings().anthropicKey ?? '')
  return writeStory(key, req)
})

const withStanding = (t: TamperThread) => ({ ...t, standing: standing(t.interest) })

ipcMain.handle('tamper:threads', () => ({
  threads: Object.values(readThreads().threads)
    .map(withStanding)
    .sort((a, b) => b.interest - a.interest),
}))

ipcMain.handle('tamper:send', async (_e, req: {
  key: string
  target: TamperTarget
  coach: TamperCoach
  message: string
  season: number | null
  week: number | null
}) => {
  const file = readThreads()
  const existing = file.threads[req.key]
  const { score, because } = resistance(req.target, req.coach)
  const interest = existing?.interest ?? 0
  const turns = existing?.turns ?? []

  const res = await sendText(
    String(readSettings().anthropicKey ?? ''),
    req.target, req.coach, turns, req.message, interest,
  )
  if (!res.ok) return res

  const next: TamperThread = {
    key: req.key,
    first: req.target.first, last: req.target.last,
    position: req.target.position, overall: req.target.overall,
    team: req.target.team,
    interest: Math.max(0, Math.min(100, interest + res.reply.move)),
    resistance: score,
    because,
    mood: res.reply.mood,
    committed: existing?.committed || res.reply.committed === true,
    openedSeason: existing?.openedSeason ?? req.season,
    openedWeek: existing?.openedWeek ?? req.week,
    turns: [
      ...turns,
      { from: 'coach', text: req.message },
      { from: 'player', text: res.reply.reply, move: res.reply.move },
    ],
  }
  file.threads[req.key] = next
  writeThreads(file)
  return { ok: true as const, thread: withStanding(next) }
})

ipcMain.handle('tamper:forget', (_e, key: string) => {
  const file = readThreads()
  delete file.threads[key]
  writeThreads(file)
  return { ok: true as const }
})

ipcMain.handle('save:snapshot', async (_e, { path, teamId }: { path: string; teamId: number | null }) => {
  try {
    const payload = readSavePayload(path)
    if (!payload) return { ok: false as const, message: 'That file does not contain a readable payload.' }
    const snap = buildSnapshot(payload, teamId, snapshotExtras())
    const res = await dialog.showSaveDialog(win!, {
      title: 'Save the dynasty snapshot',
      defaultPath: 'dcc-snapshot.json',
      filters: [{ name: 'DCC snapshot', extensions: ['json'] }],
    })
    if (res.canceled || !res.filePath) return { ok: false as const, message: 'cancelled' }
    writeFileSync(res.filePath, JSON.stringify(snap))
    return {
      ok: true as const, path: res.filePath,
      teams: snap.teams.length, games: snap.games.length,
      players: snap.players.length, recruits: snap.recruits.length,
    }
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})

ipcMain.handle('save:writeGames', (_e, { path, edits }: { path: string; edits: GameEdit[] }) => {
  try {
    return writeGameEdits(path, edits)
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})

ipcMain.handle('assets:pickInstall', async () => {
  const res = await dialog.showOpenDialog(win!, {
    title: 'Choose your College Football install folder',
    properties: ['openDirectory'],
  })
  return res.canceled ? null : res.filePaths[0]
})

ipcMain.handle('assets:pickFaces', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Choose the folder of extracted art',
    properties: ['openDirectory'],
  })
  return r.canceled ? null : r.filePaths[0]
})

/**
 * The art pack, assembled from images the renderer has already resized.
 *
 * Three calls rather than one: the whole country's faces are a hundred
 * megabytes and neither side wants them in a single message. The renderer opens
 * the pack, streams batches into it, and closes it.
 *
 * The renderer does the reading because the game's art is WebP, which Chromium
 * decodes and a hand-written PNG reader does not. That reader is why the first
 * pack came out 208 bytes: a manifest, and every file skipped.
 */
/**
 * The pack being written, as a file rather than as an array.
 *
 * Every image used to be held here until the last one arrived and then
 * concatenated into one more buffer — a few hundred megabytes twice over on the
 * widest scope. The archive is appended to a temp file as the batches come in,
 * so the largest thing alive at any moment is one batch.
 *
 * The id is what makes a lost pack say so. Two builds, or a restart in the
 * middle of one, used to end in "no pack is open" after several minutes of
 * reading images for an archive that no longer existed.
 */
interface OpenPack {
  id: number
  file: string
  fd: number
  offset: number
  records: ZipRecord[]
  bytes: number
}
let building: OpenPack | null = null
let packSeq = 0

const closePack = (p: OpenPack | null) => {
  if (!p) return
  try { closeSync(p.fd) } catch { /* already closed */ }
  try { rmSync(p.file, { force: true }) } catch { /* it is a temp file */ }
}

ipcMain.handle('art:packStart', () => {
  // A build that was abandoned leaves its file behind; this is where it goes.
  closePack(building)
  const id = ++packSeq
  const file = join(tmpdir(), `dcc-art-${process.pid}-${id}.zip`)
  building = { id, file, fd: openSync(file, 'w'), offset: 0, records: [], bytes: 0 }
  return { ok: true as const, id }
})

ipcMain.handle('art:packAdd', (_e, req: { id?: number; entries: { name: string; data: Uint8Array }[] }) => {
  const entries = req?.entries ?? []
  if (!building) return { ok: false as const, message: 'the pack was closed before this batch arrived' }
  if (req?.id !== undefined && req.id !== building.id) {
    return { ok: false as const, message: 'another build replaced this one' }
  }
  for (const e of entries) {
    const data = Buffer.from(e.data)
    const { bytes, record } = zipChunk({ name: e.name, data }, building.offset)
    writeSync(building.fd, bytes)
    building.offset += bytes.length
    building.records.push(record)
    building.bytes += data.length
  }
  return { ok: true as const, entries: building.records.length }
})

ipcMain.handle('art:packFinish', async (_e, req: {
  id?: number
  publish: boolean; repo?: string
  fit?: { jerseyScale?: number; jerseyDrop?: number }
}) => {
  const open = building
  building = null
  if (!open) {
    return {
      ok: false as const,
      message: 'the pack was closed before it finished — the app restarted, or another build replaced it',
    }
  }
  if (req.id !== undefined && req.id !== open.id) {
    closePack(open)
    return { ok: false as const, message: 'another build replaced this one' }
  }
  try {
    // The manifest is the last entry rather than the first: a streaming writer
    // only knows what it holds once it has written it, and the phone reads the
    // manifest off disk after unpacking, so its position does not matter.
    const manifest = packManifest(open.records.map((r) => r.name), open.bytes, new Date(), req.fit ?? {})
    const { bytes: manifestChunk, record } = zipChunk(
      { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest), 'utf8') },
      open.offset,
    )
    writeSync(open.fd, manifestChunk)
    open.offset += manifestChunk.length
    open.records.push(record)
    writeSync(open.fd, zipDirectory(open.records, open.offset))
    closeSync(open.fd)

    const size = statSync(open.file).size

    const dest = await dialog.showSaveDialog(win!, {
      title: 'Save the art pack',
      defaultPath: 'dcc-art.zip',
      filters: [{ name: 'DCC art pack', extensions: ['zip'] }],
    })
    if (!dest.canceled && dest.filePath) copyFileSync(open.file, dest.filePath)

    let published: string | null = null
    if (req.publish && req.repo) {
      const token = String(readSettings().githubToken ?? '')
      // Reading it back is the one moment the whole pack is in memory, and it
      // only happens when it is being uploaded.
      published = (await publishArt({ repo: req.repo, token }, readFileSync(open.file))).message
    }

    // Kept on disk for the relay to serve. The previous pack's file goes now.
    rememberPack(open.file, size)
    return {
      ok: true as const,
      bytes: size,
      schools: Object.keys(manifest.schools).length,
      players: manifest.players.length,
      file: dest.canceled ? null : dest.filePath ?? null,
      published,
    }
  } catch (err) {
    closePack(open)
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})

/** The colours the renderer read out of the logos, for the snapshot to carry. */
ipcMain.handle('art:colors', (_e, colors: Record<string, string>) => {
  rememberSchoolColors(colors)
  return { ok: true as const }
})

ipcMain.handle('assets:indexFaces', (
  _e, { dir, assetIds, schools }: {
    dir: string; assetIds: string[]
    schools: { name: string; fullName?: string | null }[]
  },
) => {
  try {
    const index = indexFaces(dir)
    faceRoot = dir
    faceIndexMap = index.map
    const schoolArt = matchSchools(index, schools ?? [])
    return {
      ok: true as const,
      files: index.files, bytes: index.bytes, byExtension: index.byExtension,
      sample: index.sample, truncated: index.truncated, dirs: index.dirs,
      match: matchFaces(index, assetIds),
      schoolArt,
      awardArt: matchAwards(index),
      // Only the ids that actually resolved cross to the renderer, which keeps
      // this to the players present rather than the whole folder.
      paths: Object.fromEntries(
        assetIds.map((id) => [id, index.map[id.toLowerCase()]]).filter(([, v]) => v),
      ) as Record<string, string>,
    }
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})

/**
 * Filenames in the art folder that contain a word.
 *
 * The answer to "what does this art folder call its bowl logos" is a search,
 * not a guess: a pattern written from memory would match the wrong files or
 * none, and DCC has already shipped one bug of exactly that shape.
 */
ipcMain.handle('assets:searchArt', (_e, query: string) => {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return { ok: true as const, hits: [] as string[], total: 0 }
  const hits: string[] = []
  let total = 0
  for (const [stem, file] of Object.entries(faceIndexMap)) {
    if (!stem.includes(q)) continue
    total++
    if (hits.length < 60) hits.push(file)
  }
  return { ok: true as const, hits, total }
})

ipcMain.handle('assets:findInstall', () => {
  try {
    return findInstall(dictionaryRoots())
  } catch (err) {
    return { found: false as const, searched: 0, message: String((err as Error)?.message ?? err) }
  }
})

ipcMain.handle('assets:scan', (_e, dir: string) => {
  try {
    return { ok: true as const, report: scanInstall(dir) }
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})

ipcMain.handle('assets:readTables', async (_e, { root, files }: { root: string; files: string[] }) => {
  try {
    return { ok: true as const, tables: await readTables(root, files) }
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})

ipcMain.handle('assets:findArt', async (_e, root: string) => {
  try {
    const tocs = listTocs(root)
    return { ok: true as const, finds: await findArtNames(root, tocs), scanned: tocs.length }
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})

ipcMain.handle('save:findDict', async (_e, { savePath, dictionaryId }: { savePath: string; dictionaryId: number }) => {
  const res = await dialog.showOpenDialog(win!, {
    title: 'Choose a folder to search — the game install, or a tool that reads saves',
    properties: ['openDirectory'],
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false as const, message: 'cancelled' }
  try {
    // A real frame from this save is what proves a candidate dictionary is the
    // right one, so it is extracted and handed to the scan.
    const payload = readSavePayload(savePath)
    const frames = payload ? sampleFrames(payload) : []
    return { ok: true as const, scan: findDictionary(res.filePaths[0], dictionaryId, frames) }
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})

/** The dictionary lives in userData so it survives updates and is found again. */
const dictionaryPath = () => join(app.getPath('userData'), 'cfb-zstd-dict.bin')

function storedDictionary(): Buffer | null {
  try {
    return existsSync(dictionaryPath()) ? readFileSync(dictionaryPath()) : null
  } catch {
    return null
  }
}

ipcMain.handle('save:dictionaryState', () => {
  const d = storedDictionary()
  return d ? { present: true, bytes: d.length, id: `0x${d.readUInt32LE(4).toString(16)}` } : { present: false }
})

/** Places worth looking before asking the user to hunt for the dictionary. */
function dictionaryRoots(): string[] {
  const roots = new Set<string>()
  const env = process.env
  for (const p of [env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs'), env.ProgramFiles, env['ProgramFiles(x86)']]) {
    if (p && existsSync(p)) roots.add(p)
  }
  // Game libraries commonly sit at the root of a secondary drive.
  for (const letter of 'CDEFGH') {
    for (const name of ['Games', 'SteamLibrary', 'Program Files', 'Mods']) {
      const p = `${letter}:\\${name}`
      if (existsSync(p)) roots.add(p)
    }
  }
  return [...roots]
}

ipcMain.handle('save:autoDictionary', (_e, savePath: string) => {
  try {
    const payload = readSavePayload(savePath)
    if (!payload) return { found: false, searched: 0, message: 'That save could not be read.' }
    const res = autoFindDictionary(payload, dictionaryRoots())
    if (res.found && res.file) {
      mkdirSync(app.getPath('userData'), { recursive: true })
      writeFileSync(dictionaryPath(), readFileSync(res.file))
    }
    return res
  } catch (err) {
    return { found: false, searched: 0, message: String((err as Error)?.message ?? err) }
  }
})

ipcMain.handle('save:setDictionary', async (_e, savePath: string) => {
  const res = await dialog.showOpenDialog(win!, {
    title: 'Choose the compression dictionary (dict.bin)',
    properties: ['openFile'],
    filters: [{ name: 'Dictionary', extensions: ['bin', 'dict', '*'] }],
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false as const, message: 'cancelled' }
  try {
    const dict = readFileSync(res.filePaths[0])
    const payload = readSavePayload(savePath)
    if (!payload) return { ok: false as const, message: 'That save could not be read.' }
    const check = checkDictionary(payload, dict)
    if (!check.ok) return { ok: false as const, message: check.message }
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(dictionaryPath(), dict)
    const all = decodeFrames(payload, dict)
    return {
      ok: true as const,
      bytes: dict.length,
      id: `0x${dict.readUInt32LE(4).toString(16)}`,
      frames: all.frames,
      failed: all.failed,
      objectBytes: all.bytes,
    }
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})

ipcMain.handle('save:diff', (_e, { a, b }: { a: string; b: string }) => {
  try {
    return { ok: true as const, diff: diffSaves(a, b, storedDictionary()) }
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})

/** Copies the save somewhere safe before anything ever writes to it. */
ipcMain.handle('save:backup', async (_e, path: string) => {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const dir = join(app.getPath('userData'), 'save-backups')
    mkdirSync(dir, { recursive: true })
    const dest = join(dir, `${stamp}-${path.split(/[\\/]/).pop()}`)
    copyFileSync(path, dest)
    return { ok: true as const, dest }
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})
ipcMain.handle('app:saveText', async (_e, { name, text }: { name: string; text: string }) => {
  const res = await dialog.showSaveDialog(win!, { defaultPath: name })
  if (res.canceled || !res.filePath) return null
  writeFileSync(res.filePath, text)
  return res.filePath
})

// Single instance: a second launch focuses the running window instead of
// starting a rival copy that would fight over the same save.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  // Serves one image at a time out of the chosen art folder. Portraits run to
  // 786 MB, so they are read from disk on demand rather than carried into the
  // renderer as data.
  protocol.registerSchemesAsPrivileged([
    { scheme: 'dccart', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ])

  app.whenReady().then(() => {
    protocol.handle('dccart', async (req) => {
      if (!faceRoot) return new Response('no art folder', { status: 404 })
      const rel = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''))
      const full = join(faceRoot, rel)
      // A path that resolves outside the chosen folder is refused, so a crafted
      // name cannot turn this into a general file reader.
      const inside = resolve(full).startsWith(resolve(faceRoot) + sep)
      if (!inside || !existsSync(full)) return new Response('not found', { status: 404 })
      return net.fetch(pathToFileURL(full).toString())
    })
    createWindow()
    setupUpdater()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
