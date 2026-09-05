import { contextBridge, ipcRenderer } from 'electron'

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
  roster: (path: string) => ipcRenderer.invoke('save:roster', path),
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
