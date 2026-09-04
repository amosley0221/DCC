import type { UpdateStatus } from './updates'
import type { SaveReport, SaveDiff } from '../electron/saveAnalysis'

declare global {
  interface Window {
    dcc: {
      info(): Promise<{ version: string; platform: string; isDev: boolean; userData: string }>
      dynasty(): Promise<unknown>
      getSettings(): Promise<Record<string, unknown>>
      setSettings(next: Record<string, unknown>): Promise<boolean>
      openExternal(url: string): Promise<void>
      saveText(name: string, text: string): Promise<string | null>
      pickSave(): Promise<string | null>
      analyzeSave(path: string): Promise<{ ok: true; report: SaveReport } | { ok: false; message: string }>
      backupSave(path: string): Promise<{ ok: true; dest: string } | { ok: false; message: string }>
      diffSaves(a: string, b: string): Promise<{ ok: true; diff: SaveDiff } | { ok: false; message: string }>
      checkForUpdate(): Promise<unknown>
      downloadUpdate(): Promise<{ ok: boolean; message?: string }>
      installUpdate(): Promise<boolean>
      onUpdateStatus(cb: (s: UpdateStatus) => void): () => void
    }
  }
}

export {}
