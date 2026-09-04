import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { SaveReport, SaveDiff, DictScan } from '../electron/saveAnalysis'

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
  /** True while the remembered save is being re-read at startup. */
  restoring: boolean
}

const blank: SaveState = {
  path: null, report: null, busy: false, error: null, backup: null,
  diff: null, diffing: false, scan: null, scanning: false,
  dict: null, dictResult: null, restoring: false,
}

interface Ctx {
  save: SaveState
  patch: (p: Partial<SaveState>) => void
}

const SaveCtx = createContext<Ctx | null>(null)

export function useSave(): Ctx {
  const ctx = useContext(SaveCtx)
  if (!ctx) throw new Error('useSave outside SaveProvider')
  return ctx
}

export function SaveProvider({ remembered, onPathChange, children }: {
  remembered: string | null
  onPathChange: (path: string | null) => void
  children: React.ReactNode
}) {
  const [save, setSave] = useState<SaveState>(blank)
  const patch = useCallback((p: Partial<SaveState>) => setSave((s) => ({ ...s, ...p })), [])
  const started = useRef(false)

  // Re-open the save the app was last looking at, so a restart or an in-place
  // upgrade lands back where the user left off rather than on an empty panel.
  useEffect(() => {
    if (started.current || !remembered) return
    started.current = true
    ;(async () => {
      patch({ restoring: true, path: remembered })
      const res = await window.dcc.analyzeSave(remembered)
      if (res.ok) patch({ report: res.report, restoring: false })
      else {
        // The file moved or was deleted — forget it rather than nagging.
        patch({ path: null, restoring: false })
        onPathChange(null)
      }
      patch({ dict: await window.dcc.dictionaryState() })
    })()
  }, [remembered, patch, onPathChange])

  const value = useMemo(() => ({ save, patch }), [save, patch])
  return <SaveCtx.Provider value={value}>{children}</SaveCtx.Provider>
}
