import { contextBridge, ipcRenderer } from 'electron'
import type { Move, Path } from './transfers'
import type { TamperCoach, TamperTarget, TamperTurn } from './tamper'

/** What the transfer ledger looks like once it has been diffed for the screen. */
/** One tampering conversation as the screen reads it. */
export interface TamperThreadView {
  key: string
  first: string
  last: string
  position: string
  overall: number
  team: string
  interest: number
  resistance: number
  because: string[]
  mood: string
  committed: boolean
  openedSeason: number | null
  openedWeek: number | null
  turns: TamperTurn[]
  standing: string
}

export interface TransferView {
  latestYear: number | null
  seasons: { season: number; week: number | null; recordedAt: string; players: number }[]
  /** Season number to calendar year, once the user has named the latest season. */
  years: Record<string, number | null>
  moves: Move[]
  paths: Path[]
}

export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'current'; version?: string }
  | { state: 'available'; version: string; notes?: unknown }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; version: string; notes?: unknown }
  | { state: 'error'; message: string }
  | { state: 'dev' }

const api = {
  info: () => ipcRenderer.invoke('app:info') as Promise<{
    version: string; platform: string; isDev: boolean; userData: string
  }>,
  dynasty: () => ipcRenderer.invoke('app:dynasty'),
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<Record<string, unknown>>,
  setSettings: (next: Record<string, unknown>) => ipcRenderer.invoke('settings:set', next),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  saveText: (name: string, text: string) =>
    ipcRenderer.invoke('app:saveText', { name, text }) as Promise<string | null>,
  pickSave: () => ipcRenderer.invoke('save:pick') as Promise<string | null>,
  analyzeSave: (path: string) => ipcRenderer.invoke('save:analyze', path),
  roster: (path: string, teamId?: number | null) => ipcRenderer.invoke('save:roster', path, teamId ?? null),
  transfers: () => ipcRenderer.invoke('transfers:read') as Promise<TransferView>,
  setTransferYear: (year: number | null) => ipcRenderer.invoke('transfers:setYear', year),
  forgetTransferSeason: (season: number) => ipcRenderer.invoke('transfers:forget', season),
  tamperThreads: () => ipcRenderer.invoke('tamper:threads') as Promise<{ threads: TamperThreadView[] }>,
  tamperSend: (req: {
    key: string; target: TamperTarget; coach: TamperCoach
    message: string; season: number | null; week: number | null
  }) => ipcRenderer.invoke('tamper:send', req) as Promise<
    { ok: true; thread: TamperThreadView } | { ok: false; message: string }
  >,
  tamperForget: (key: string) => ipcRenderer.invoke('tamper:forget', key) as Promise<{ ok: true }>,
  packStart: () => ipcRenderer.invoke('art:packStart') as Promise<{ ok: true; id: number }>,
  packAdd: (entries: { name: string; data: Uint8Array }[], id?: number) =>
    ipcRenderer.invoke('art:packAdd', { entries, id }) as Promise<
      { ok: true; entries: number } | { ok: false; message: string }
    >,
  packFinish: (req: {
    publish: boolean; repo?: string
    fit?: { jerseyScale?: number; jerseyDrop?: number }
  }) =>
    ipcRenderer.invoke('art:packFinish', req) as Promise<
      | { ok: true; bytes: number; schools: number; players: number
          file: string | null; published: string | null }
      | { ok: false; message: string }
    >,
  setSchoolColors: (colors: Record<string, string>) =>
    ipcRenderer.invoke('art:colors', colors) as Promise<{ ok: true }>,
  depth: (path: string) => ipcRenderer.invoke('save:depth', path),
  writeDepth: (path: string, edits: unknown[]) => ipcRenderer.invoke('save:writeDepth', path, edits),
  publishSnapshot: (path: string, teamId: number | null, repo: string) =>
    ipcRenderer.invoke('relay:publish', { path, teamId, repo }),
  relayStart: (path: string | null, teamId: number | null, port?: number) =>
    ipcRenderer.invoke('relay:start', { path, teamId, port }),
  relayStop: () => ipcRenderer.invoke('relay:stop'),
  relayState: (ctx?: { path: string | null; teamId: number | null }) =>
    ipcRenderer.invoke('relay:state', ctx),
  writePlayers: (path: string, edits: unknown[], playerCount: number) =>
    ipcRenderer.invoke('save:writePlayers', { path, edits, playerCount }),
  writePress: (req: unknown) => ipcRenderer.invoke('press:write', req),
  snapshot: (path: string, teamId: number | null) =>
    ipcRenderer.invoke('save:snapshot', { path, teamId }),
  writeGames: (path: string, edits: unknown[]) =>
    ipcRenderer.invoke('save:writeGames', { path, edits }),
  pickInstall: () => ipcRenderer.invoke('assets:pickInstall') as Promise<string | null>,
  pickFaces: () => ipcRenderer.invoke('assets:pickFaces') as Promise<string | null>,
  indexFaces: (dir: string, assetIds: string[], schools: { name: string; fullName: string | null }[]) =>
    ipcRenderer.invoke('assets:indexFaces', { dir, assetIds, schools }),
  findInstall: () => ipcRenderer.invoke('assets:findInstall'),
  scanInstall: (dir: string) => ipcRenderer.invoke('assets:scan', dir),
  readTables: (root: string, files: string[]) => ipcRenderer.invoke('assets:readTables', { root, files }),
  findArt: (root: string) => ipcRenderer.invoke('assets:findArt', root),
  searchArt: (query: string) => ipcRenderer.invoke('assets:searchArt', query),
  choosePoll: (index: number) => ipcRenderer.invoke('poll:choose', index) as Promise<{ ok: true }>,
  dumpStore: (path: string, name: string, rows?: number) =>
    ipcRenderer.invoke('save:dumpStore', { path, name, rows }),
  backupSave: (path: string) => ipcRenderer.invoke('save:backup', path),
  diffSaves: (a: string, b: string) => ipcRenderer.invoke('save:diff', { a, b }),
  dictionaryState: () => ipcRenderer.invoke('save:dictionaryState'),
  setDictionary: (savePath: string) => ipcRenderer.invoke('save:setDictionary', savePath),
  autoDictionary: (savePath: string) => ipcRenderer.invoke('save:autoDictionary', savePath),
  findDictionary: (savePath: string, dictionaryId: number) =>
    ipcRenderer.invoke('save:findDict', { savePath, dictionaryId }),
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  lastUpdateStatus: () => ipcRenderer.invoke('update:last') as Promise<UpdateStatus | null>,
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (cb: (s: UpdateStatus) => void) => {
    const handler = (_e: unknown, s: UpdateStatus) => cb(s)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.off('update:status', handler)
  },
}

contextBridge.exposeInMainWorld('dcc', api)
export type DccApi = typeof api
