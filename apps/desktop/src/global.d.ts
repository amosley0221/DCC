import type { UpdateStatus } from './updates'
import type { SaveReport, SaveDiff, DictScan, RosterPlayer, TeamRecord, CoachRecord, StoreRecord, SeasonGame } from '../electron/saveAnalysis'
import type { InstallReport, TableReport, ArtFind } from '../electron/gameAssets'
import type { GameEdit, PlayerEdit, PlayerWriteResult, WriteResult } from '../electron/saveWrite'
import type { PressRequest, PressStory } from '../electron/press'
import type { RelayState } from '../electron/relay'
import type { TamperThreadView, TransferView } from '../electron/preload'
import type { TamperCoach, TamperTarget } from '../electron/tamper'

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
      roster(path: string, teamId?: number | null): Promise<
        | { ok: true; count: number; ratingNames: string[]; unverifiedPairs: [string, string][]
            schools: TeamRecord[]; coaches: CoachRecord[]; stores: StoreRecord[]; games: SeasonGame[]
            players: RosterPlayer[]; season: number | null
            titles: { season: number; champion: string | null; runnerUp: string | null }[] }
        | { ok: false; message: string }
      >
      transfers(): Promise<TransferView>
      setTransferYear(year: number | null): Promise<{ ok: true }>
      forgetTransferSeason(season: number): Promise<{ ok: true }>
      tamperThreads(): Promise<{ threads: TamperThreadView[] }>
      tamperSend(req: {
        key: string; target: TamperTarget; coach: TamperCoach
        message: string; season: number | null; week: number | null
      }): Promise<{ ok: true; thread: TamperThreadView } | { ok: false; message: string }>
      tamperForget(key: string): Promise<{ ok: true }>
      packStart(): Promise<{ ok: true }>
      packAdd(entries: { name: string; data: Uint8Array }[]): Promise<{ ok: boolean; entries?: number }>
      packFinish(req: { publish: boolean; repo?: string }): Promise<
        | { ok: true; bytes: number; schools: number; players: number
            file: string | null; published: string | null }
        | { ok: false; message: string }
      >
      setSchoolColors(colors: Record<string, string>): Promise<{ ok: true }>
      depth(path: string): Promise<
        | { ok: true; slots: { abbr: string; name: string; side: 'offense' | 'defense' | 'special' }[]
            charts: { block: number; slots: number[][] }[] }
        | { ok: false; message: string }
      >
      writeDepth(path: string, edits: { block: number; slot: number; rows: number[] }[]): Promise<{
        ok: boolean; message: string; backup?: string
        changed?: { block: number; slot: number; before: number[]; after: number[] }[]
      }>
      writeGames(path: string, edits: GameEdit[]): Promise<WriteResult>
      writePlayers(path: string, edits: PlayerEdit[], playerCount: number): Promise<PlayerWriteResult>
      publishSnapshot(path: string, teamId: number | null, repo: string): Promise<
        { ok: boolean; message: string; assetUrl?: string; bytes?: number }
      >
      relayStart(path: string | null, teamId: number | null, port?: number): Promise<RelayState>
      relayStop(): Promise<RelayState>
      relayState(ctx?: { path: string | null; teamId: number | null }): Promise<RelayState>
      writePress(req: PressRequest): Promise<
        { ok: true; story: PressStory } | { ok: false; message: string }
      >
      snapshot(path: string, teamId: number | null): Promise<
        | { ok: true; path: string; teams: number; games: number; players: number; recruits: number }
        | { ok: false; message: string }
      >
      pickInstall(): Promise<string | null>
      pickFaces(): Promise<string | null>
      /** Filenames in the art folder containing a word, for naming schemes DCC has not learned. */
      searchArt(query: string): Promise<{ ok: true; hits: string[]; total: number }>
      indexFaces(
        dir: string,
        assetIds: string[],
        schools: { name: string; fullName: string | null }[],
      ): Promise<
        | { ok: false; message: string }
        | {
            ok: true
            files: number
            bytes: number
            byExtension: { ext: string; files: number; bytes: number }[]
            sample: string[]
            truncated: boolean
            dirs: { dir: string; files: number; bytes: number; sample: string[] }[]
            match: {
              players: number; matched: number
              unmatchedSample: string[]
              matchedSample: { id: string; file: string }[]
            }
            paths: Record<string, string>
            /** Trophy art by award name, lowercased and stripped: "heisman", "maxwellaward". */
            awardArt: Record<string, string>
            schoolArt: {
              art: Record<string, string>
              matched: string[]
              missing: string[]
              categories: { name: string; files: number }[]
            }
          }
      >
      findInstall(): Promise<{ found: true; path: string } | { found: false; searched: number; message: string }>
      readTables(root: string, files: string[]): Promise<
        { ok: true; tables: TableReport[] } | { ok: false; message: string }
      >
      findArt(root: string): Promise<
        { ok: true; finds: ArtFind[]; scanned: number } | { ok: false; message: string }
      >
      scanInstall(dir: string): Promise<{ ok: true; report: InstallReport } | { ok: false; message: string }>
      backupSave(path: string): Promise<{ ok: true; dest: string } | { ok: false; message: string }>
      diffSaves(a: string, b: string): Promise<{ ok: true; diff: SaveDiff } | { ok: false; message: string }>
      dictionaryState(): Promise<{ present: boolean; bytes?: number; id?: string }>
      setDictionary(savePath: string): Promise<
        | { ok: true; bytes: number; id: string; frames: number; failed: number; objectBytes: number }
        | { ok: false; message: string }
      >
      autoDictionary(savePath: string): Promise<{
        found: boolean; file?: string; bytes?: number; id?: string; frames?: number
        searched: number; message: string
      }>
      findDictionary(savePath: string, dictionaryId: number): Promise<{ ok: true; scan: DictScan } | { ok: false; message: string }>
      checkForUpdate(): Promise<unknown>
      lastUpdateStatus(): Promise<UpdateStatus | null>
      downloadUpdate(): Promise<{ ok: boolean; message?: string }>
      installUpdate(): Promise<boolean>
      onUpdateStatus(cb: (s: UpdateStatus) => void): () => void
    }
  }
}

export {}
