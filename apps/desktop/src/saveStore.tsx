import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { SaveReport, SaveDiff, DictScan, RosterPlayer, TeamRecord, CoachRecord, StoreRecord, SeasonGame } from '../electron/saveAnalysis'
import type { InstallReport, TableReport, ArtFind } from '../electron/gameAssets'

/**
 * The analysed save, held above the section switch.
 *
 * This used to live inside the Save section, which meant navigating to any
 * other section unmounted it and threw the analysis away — the save had to be
 * chosen again on every visit. Reading a 9.6 MB save and inflating 31 MB of
 * payload is not something to repeat for a menu click, so the state lives here
 * and the section renders it.
 */
export interface SaveState {
  path: string | null
  report: SaveReport | null
  busy: boolean
  error: string | null
  backup: string | null
  diff: SaveDiff | null
  diffing: boolean
  scan: DictScan | null
  scanning: boolean
  dict: { present: boolean; bytes?: number; id?: string } | null
  dictResult: string | null
  /**
   * True while the remembered save is being re-read at startup — the header
   * pass and the roster pass both, since a screen with an analysed save and no
   * roster has nothing on it.
   */
  restoring: boolean
  roster: {
    count: number; ratingNames: string[]; unverifiedPairs: [string, string][]
    schools: TeamRecord[]; coaches: CoachRecord[]; stores: StoreRecord[]; games: SeasonGame[]; players: RosterPlayer[]
  } | null
  rosterBusy: boolean
  /** The game install, for reading the art the save does not carry. */
  install: InstallReport | null
  installBusy: boolean
  installNote: string | null
  tables: TableReport[] | null
  art: ArtFind[] | null
  /** Extracted art on disk: how it went, and asset id -> file within the root. */
  faces: {
    root: string; files: number; bytes: number; matched: number; players: number
    sample: string[]; unmatchedSample: string[]
    byExtension: { ext: string; files: number; bytes: number }[]
    dirs: { dir: string; files: number; bytes: number; sample: string[] }[]
  } | null
  facePaths: Record<string, string>
  /** "<school>|<category>" -> file within the art root. */
  schoolArt: Record<string, string>
  schoolArtMissing: string[]
  facesBusy: boolean
}

const blank: SaveState = {
  path: null, report: null, busy: false, error: null, backup: null,
  diff: null, diffing: false, scan: null, scanning: false,
  dict: null, dictResult: null, restoring: false, roster: null, rosterBusy: false,
  install: null, installBusy: false, installNote: null, tables: null, art: null,
  faces: null, facePaths: {}, facesBusy: false, schoolArt: {}, schoolArtMissing: [],
}

interface Ctx {
  save: SaveState
  patch: (p: Partial<SaveState>) => void
}

const SaveCtx = createContext<Ctx | null>(null)

/**
 * Read a folder of extracted game art and shape the result for the store.
 *
 * Shared by the folder picker and the restore on launch, because the two used
 * to differ only in that one of them existed: the chosen folder was held in
 * memory, so every launch asked for it again.
 */
export async function indexArt(
  dir: string,
  roster: NonNullable<SaveState['roster']>,
): Promise<{ ok: true; patch: Partial<SaveState>; matched: number; players: number; schools: number }
  | { ok: false; message: string }> {
  const ids = roster.players.map((p) => p.assetId)
  const schools = roster.schools.map((s) => ({ name: s.name, fullName: s.fullName }))
  const res = await window.dcc.indexFaces(dir, ids, schools)
  if (!res.ok) return { ok: false, message: res.message }
  return {
    ok: true,
    matched: res.match.matched,
    players: res.match.players,
    schools: res.schoolArt.matched.length,
    patch: {
      faces: {
        root: dir, files: res.files, bytes: res.bytes,
        matched: res.match.matched, players: res.match.players,
        sample: res.sample, unmatchedSample: res.match.unmatchedSample,
        byExtension: res.byExtension, dirs: res.dirs,
      },
      facePaths: res.paths,
      schoolArt: res.schoolArt.art,
      schoolArtMissing: res.schoolArt.missing,
    },
  }
}

export function useSave(): Ctx {
  const ctx = useContext(SaveCtx)
  if (!ctx) throw new Error('useSave outside SaveProvider')
  return ctx
}

export function SaveProvider({ remembered, rememberedArt, onPathChange, onArtChange, children }: {
  remembered: string | null
  rememberedArt: string | null
  onPathChange: (path: string | null) => void
  onArtChange: (path: string | null) => void
  children: React.ReactNode
}) {
  const [save, setSave] = useState<SaveState>(blank)
  const patch = useCallback((p: Partial<SaveState>) => setSave((s) => ({ ...s, ...p })), [])
  const started = useRef(false)

  // Re-open the save the app was last looking at, so a restart or an in-place
  // upgrade lands back where the user left off rather than on an empty panel.
  //
  // Both passes, not just the first. Analysing the save only gets its header;
  // every screen in the app is built out of the roster pass, so stopping after
  // the analysis left the user on an empty front page with a button to press
  // every single launch.
  useEffect(() => {
    if (started.current || !remembered) return
    started.current = true
    ;(async () => {
      patch({ restoring: true, path: remembered })
      const res = await window.dcc.analyzeSave(remembered)
      if (!res.ok) {
        // The file moved or was deleted — forget it rather than nagging.
        patch({ path: null, restoring: false })
        onPathChange(null)
        patch({ dict: await window.dcc.dictionaryState() })
        return
      }
      patch({ report: res.report })
      const r = await window.dcc.roster(remembered)
      // A roster that fails to read is not worth an error on the front page:
      // the save is open, and The Program still offers the button.
      patch({
        roster: r.ok
          ? {
              count: r.count, ratingNames: r.ratingNames, unverifiedPairs: r.unverifiedPairs,
              schools: r.schools, coaches: r.coaches, stores: r.stores, games: r.games,
              players: r.players,
            }
          : null,
        restoring: false,
      })
      patch({ dict: await window.dcc.dictionaryState() })

      // The art folder is a scan of a directory, not a decode of the save, so
      // re-reading it costs little and asking for it again costs the user a
      // dialog on every single launch. A folder that has gone is forgotten
      // rather than reported.
      if (r.ok && rememberedArt) {
        patch({ facesBusy: true })
        const art = await indexArt(rememberedArt, {
          count: r.count, ratingNames: r.ratingNames, unverifiedPairs: r.unverifiedPairs,
          schools: r.schools, coaches: r.coaches, stores: r.stores, games: r.games,
          players: r.players,
        })
        patch({ facesBusy: false, ...(art.ok ? art.patch : {}) })
        if (!art.ok) onArtChange(null)
      }
    })()
  }, [remembered, rememberedArt, patch, onPathChange, onArtChange])

  const value = useMemo(() => ({ save, patch }), [save, patch])
  return <SaveCtx.Provider value={value}>{children}</SaveCtx.Provider>
}
