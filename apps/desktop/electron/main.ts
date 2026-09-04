import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'node:path'
import { readFileSync, existsSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { autoUpdater } from 'electron-updater'
import { analyzeSave, diffSaves, findDictionary } from './saveAnalysis'

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

  const send = (channel: string, payload?: unknown) => win?.webContents.send(channel, payload)

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
    // Check shortly after launch, once the window is up to show the prompt,
    // then a few times a day for a long-running session.
    const check = () => autoUpdater.checkForUpdates().catch(() => {})
    setTimeout(check, 4000)
    setInterval(check, 6 * 60 * 60 * 1000)
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

ipcMain.handle('save:findDict', async (_e, dictionaryId: number) => {
  const res = await dialog.showOpenDialog(win!, {
    title: 'Choose your College Football install folder',
    properties: ['openDirectory'],
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false as const, message: 'cancelled' }
  try {
    return { ok: true as const, scan: findDictionary(res.filePaths[0], dictionaryId) }
  } catch (err) {
    return { ok: false as const, message: String((err as Error)?.message ?? err) }
  }
})

ipcMain.handle('save:diff', (_e, { a, b }: { a: string; b: string }) => {
  try {
    return { ok: true as const, diff: diffSaves(a, b) }
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
