import { app, BrowserWindow, ipcMain, shell, dialog, protocol, net } from 'electron'
import { join, resolve, sep } from 'node:path'
import { readFileSync, existsSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { autoUpdater } from 'electron-updater'
import {
  analyzeSave, diffSaves, findDictionary, sampleFrames, readSavePayload,
  checkDictionary, decodeFrames, autoFindDictionary, readRoster, readTeamNames,
  RATING_BITS, RATING_PAIRS_UNVERIFIED, readCoaches, readSeasonGames, readStores,
  readDepthCharts, DEPTH_SLOTS, readSeasonOrdinal, TEAM_UNASSIGNED,
  readChampions, teamTableOrder,
} from './saveAnalysis'
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
  indexFaces, matchFaces, matchSchools,
} from './gameAssets'
import { writeStory } from './press'
import type { PressRequest } from './press'
import { resistance, standing } from './tamper'
import type { TamperCoach, TamperTarget } from './tamper'
import { sendText } from './tamperTalk'
import { buildSnapshot } from './snapshot'
import { publishArt, publishSnapshot } from './publish'
import { packEntries } from './artPack'
import type { PackEntry } from './artPack'
import { rememberPack } from './sidecar'
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
    }
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
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
let building: PackEntry[] | null = null

ipcMain.handle('art:packStart', () => { building = []; return { ok: true as const } })

ipcMain.handle('art:packAdd', (_e, entries: { name: string; data: Uint8Array }[]) => {
  if (!building) return { ok: false as const, message: 'no pack is open' }
  for (const e of entries) building.push({ name: e.name, data: Buffer.from(e.data) })
  return { ok: true as const, entries: building.length }
})

ipcMain.handle('art:packFinish', async (_e, req: { publish: boolean; repo?: string }) => {
  const entries = building
  building = null
  if (!entries) return { ok: false as const, message: 'no pack is open' }
  try {
    const pack = packEntries(entries)
    rememberPack(pack.bytes)

    const dest = await dialog.showSaveDialog(win!, {
      title: 'Save the art pack',
      defaultPath: 'dcc-art.zip',
      filters: [{ name: 'DCC art pack', extensions: ['zip'] }],
    })
    if (!dest.canceled && dest.filePath) writeFileSync(dest.filePath, pack.bytes)

    let published: string | null = null
    if (req.publish && req.repo) {
      const token = String(readSettings().githubToken ?? '')
      published = (await publishArt({ repo: req.repo, token }, pack.bytes)).message
    }
    return {
      ok: true as const,
      bytes: pack.bytes.length,
      schools: Object.keys(pack.manifest.schools).length,
      players: pack.manifest.players.length,
      file: dest.canceled ? null : dest.filePath ?? null,
      published,
    }
  } catch (err) {
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
    const schoolArt = matchSchools(index, schools ?? [])
    return {
      ok: true as const,
      files: index.files, bytes: index.bytes, byExtension: index.byExtension,
      sample: index.sample, truncated: index.truncated, dirs: index.dirs,
      match: matchFaces(index, assetIds),
      schoolArt,
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
