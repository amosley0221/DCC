import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'node:path'
import { readFileSync, existsSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { autoUpdater } from 'electron-updater'
import {
  analyzeSave, diffSaves, findDictionary, sampleFrames, readSavePayload,
  checkDictionary, decodeFrames, autoFindDictionary, readRoster, readTeamNames,
  RATING_BITS, RATING_PAIRS_UNVERIFIED,
} from './saveAnalysis'
import { scanInstall, findInstall } from './gameAssets'

const isDev = !app.isPackaged
let win: BrowserWindow | null = null

/** Settings live in userData so they survive every in-place upgrade. */
const settingsFile = () => join(app.getPath('userData'), 'settings.json')

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(settingsFile(), 'utf8'))
  } catch {
    return {}
  }
}

function writeSettings(next: Record<string, unknown>) {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(settingsFile(), JSON.stringify(next, null, 2))
}

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

ipcMain.handle('save:roster', (_e, path: string) => {
  try {
    const payload = readSavePayload(path)
    if (!payload) return { ok: false as const, message: 'That file does not contain a readable payload.' }
    const players = readRoster(payload)
    // The renderer only ever shows a page at a time; sending 16,000 full rating
    // sets across the bridge would cost more than reading the save did.
    return {
      ok: true as const,
      count: players.length,
      ratingNames: Object.keys(RATING_BITS),
      schools: readTeamNames(payload),
      unverifiedPairs: RATING_PAIRS_UNVERIFIED,
      players,
    }
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

  app.whenReady().then(() => {
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
