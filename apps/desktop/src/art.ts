import { awardEntryName, playerEntryName, schoolEntryName, schoolPlan } from '../electron/artPack'

/**
 * Reading the game's art, on the one thing in DCC that can already read it.
 *
 * Every screen draws these images over `dccart://`, which means Chromium
 * decodes them — whatever they are. The first art pack decoded them in the main
 * process with a PNG reader written by hand, and the game's art is not PNG, so
 * every file was skipped and the pack came out 208 bytes.
 *
 * So it happens here instead: load the image the same way the screens do, draw
 * it into a canvas at the size the phone wants, and take the PNG back out. The
 * main process only ever sees images it can put straight into the archive.
 */

export const artUrl = (file: string) =>
  'dccart://art/' + file.split(/[\\/]/).map(encodeURIComponent).join('/')

/** Loads one image, or null when it will not load — a missing file, a format Chromium refuses. */
export function loadArt(file: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalWidth ? img : null)
    img.onerror = () => resolve(null)
    img.src = artUrl(file)
  })
}

/** The size a longest-edge limit gives an image, keeping its shape. */
export function fitted(w: number, h: number, max: number): [number, number] {
  if (w <= max && h <= max) return [w, h]
  const s = max / Math.max(w, h)
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))]
}

/**
 * The image as a PNG, no bigger than `max` on its longest edge.
 *
 * PNG on the way out whatever went in, because the pack's images are drawn over
 * a school's colour and half of them are cut-outs — a format without an alpha
 * channel would put a white box behind every player's head.
 */
export async function toPng(img: HTMLImageElement, max: number): Promise<Uint8Array | null> {
  const [w, h] = fitted(img.naturalWidth, img.naturalHeight, max)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) return null
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * The colour a school plays in, taken from its own logo.
 *
 * The save carries no team colours — `TeamStore` has 424 members and none of
 * them are decoded — and a hand-written table of 138 schools would be 138
 * chances to be wrong, and stale the moment a dynasty renames a team. A logo is
 * the school's colour by definition, so the colour is read out of it.
 *
 * Transparent and near-white pixels are skipped: a mark is mostly the paper it
 * is drawn on and mostly a hole. The most common of what is left wins, but a
 * grey bucket only when there is nothing with colour in it, so a white-on-black
 * crest does not come back as black.
 */
export function dominantColor(img: HTMLImageElement): string | null {
  const [w, h] = fitted(img.naturalWidth, img.naturalHeight, 96)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  const bucket = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 160) continue
    const r = data[i], g = data[i + 1], b = data[i + 2]
    if (r > 232 && g > 232 && b > 232) continue
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    const e = bucket.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    e.n++; e.r += r; e.g += g; e.b += b
    bucket.set(key, e)
  }
  if (!bucket.size) return null

  const all = [...bucket.values()].sort((x, y) => y.n - x.n)
  const total = all.reduce((s, e) => s + e.n, 0)
  const chroma = (e: typeof all[number]) => {
    const r = e.r / e.n, g = e.g / e.n, b = e.b / e.n
    return Math.max(r, g, b) - Math.min(r, g, b)
  }
  const win = all.find((e) => chroma(e) > 28 && e.n > total * 0.04) ?? all[0]
  const hex = (v: number) => Math.round(v / win.n).toString(16).padStart(2, '0')
  return `#${hex(win.r)}${hex(win.g)}${hex(win.b)}`
}

export interface PackProgress {
  done: number
  total: number
  /** What is being read right now, for a screen that would otherwise sit still. */
  label: string
}

export interface PackOutcome {
  /** The pack this build opened, so the finish cannot close somebody else's. */
  id: number
  entries: number
  skipped: number
  /** Extensions of the files that would not load, so an empty pack names its cause. */
  skippedKinds: { ext: string; files: number }[]
  colors: Record<string, string>
}

const extOf = (file: string) => {
  const dot = file.lastIndexOf('.')
  return dot < 0 ? '(none)' : file.slice(dot).toLowerCase()
}

/**
 * Reads every image the pack needs, resizes it, and streams it to the main
 * process a batch at a time.
 *
 * A batch rather than one message: the whole country's faces would be a hundred
 * megabytes crossing the bridge at once, and a single image per message would
 * be twelve thousand round trips. Two hundred is neither.
 *
 * The school colours come out of the same pass, since the logo is already
 * decoded and looking at it twice would double the work.
 */
export async function buildPack(
  schoolArt: Record<string, string>,
  facePaths: Record<string, string>,
  assetIds: string[],
  awardArt: Record<string, string>,
  opts: { schoolPx?: number; playerPx?: number; batch?: number } = {},
  onProgress?: (p: PackProgress) => void,
): Promise<PackOutcome> {
  const schoolPx = opts.schoolPx ?? 160
  const playerPx = opts.playerPx ?? 256
  const batchSize = opts.batch ?? 200

  const plan = schoolPlan(schoolArt)
  const jobs: { name: string; file: string; max: number; school?: string; mark?: string }[] = []
  for (const [school, marks] of plan) {
    for (const [mark, cat] of marks) {
      jobs.push({
        name: schoolEntryName(school, mark),
        file: schoolArt[`${school}|${cat}`],
        max: schoolPx,
        school,
        mark,
      })
    }
  }
  for (const id of assetIds) {
    const file = facePaths[id]
    if (file) jobs.push({ name: playerEntryName(id), file, max: playerPx })
  }
  // Trophies, bowl crests, playoff marks and conference championships. Small,
  // few, and the same on every screen, so they always travel.
  for (const [key, file] of Object.entries(awardArt)) {
    if (file) jobs.push({ name: awardEntryName(key), file, max: schoolPx })
  }

  const started = await window.dcc.packStart()

  const colors: Record<string, string> = {}
  const kinds = new Map<string, number>()
  let entries = 0
  let skipped = 0
  let pending: { name: string; data: Uint8Array }[] = []

  /**
   * Sends a batch, and stops the whole build if it does not land.
   *
   * The result used to be thrown away, so a pack that had been lost partway —
   * the app restarted, a second build started — was only noticed at the end,
   * after every remaining image had been read and resized for an archive that
   * no longer existed. It reported "no pack is open" and nothing else.
   */
  const flush = async () => {
    if (!pending.length) return
    const res = await window.dcc.packAdd(pending, started.id)
    if (!res.ok) throw new Error(res.message)
    pending = []
  }

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]
    onProgress?.({ done: i, total: jobs.length, label: job.school ?? 'faces' })
    const img = await loadArt(job.file)
    if (!img) {
      skipped++
      kinds.set(extOf(job.file), (kinds.get(extOf(job.file)) ?? 0) + 1)
      continue
    }
    // The logo is the school's colour, and it is decoded right here.
    if (job.school && job.mark === 'logo' && !colors[job.school]) {
      const hex = dominantColor(img)
      if (hex) colors[job.school] = hex
    }
    const png = await toPng(img, job.max)
    if (!png) {
      skipped++
      kinds.set(extOf(job.file), (kinds.get(extOf(job.file)) ?? 0) + 1)
      continue
    }
    pending.push({ name: job.name, data: png })
    entries++
    if (pending.length >= batchSize) await flush()
  }
  await flush()
  onProgress?.({ done: jobs.length, total: jobs.length, label: '' })

  return {
    id: started.id,
    entries,
    skipped,
    skippedKinds: [...kinds.entries()]
      .map(([ext, files]) => ({ ext, files }))
      .sort((a, b) => b.files - a.files),
    colors,
  }
}
