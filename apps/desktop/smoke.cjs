/**
 * Boots the real app under Electron, clicks through every section and reports
 * what actually rendered. Catches the class of failure a type-check cannot: a
 * blank window, a preload that never loaded, a section that throws on mount.
 *
 *   xvfb-run -a ./node_modules/electron/dist/electron smoke.cjs --no-sandbox
 */
const path = require('node:path')
const { writeFileSync } = require('node:fs')

// Answer the open-file dialog with a fixture, so the real pick path can run
// headless. Patched before main.cjs registers its handler; both share this
// module instance.
const SAVE_FIXTURE = path.join(require('node:os').tmpdir(), 'DYNASTY-SMOKE.sav')
writeFileSync(SAVE_FIXTURE, Buffer.alloc(64 * 1024, 0x41))
const dialog = require('electron').dialog
const realShowOpen = dialog.showOpenDialog.bind(dialog)
let answerDialog = false
dialog.showOpenDialog = async (...args) =>
  answerDialog ? { canceled: false, filePaths: [SAVE_FIXTURE] } : realShowOpen(...args)

require(path.join(__dirname, 'dist/main/main.cjs'))

const { app, BrowserWindow } = require('electron')
const errors = []

app.on('web-contents-created', (_e, wc) => {
  wc.on('console-message', (_ev, level, message) => { if (level >= 2) errors.push(message) })
  wc.on('render-process-gone', (_ev, d) => errors.push(`renderer gone: ${JSON.stringify(d)}`))
  wc.on('preload-error', (_ev, p, err) => errors.push(`preload ${p}: ${err}`))
})

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  await wait(2500)
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) { console.log('SMOKE FAIL: no window'); app.exit(1); return }

  const probe = () =>
    win.webContents.executeJavaScript(`(() => ({
      text: document.body.innerText.slice(0, 200),
      nav: [...document.querySelectorAll('.nav-item')].map(n => n.textContent.replace(/\\d+$/, '')),
      cards: document.querySelectorAll('.card').length,
      title: (document.querySelector('.screen-title') || {}).textContent || '',
    }))()`)

  let r = await probe()
  for (let i = 0; i < 12 && r.nav.length === 0; i++) { await wait(700); r = await probe() }

  const visited = []
  for (let i = 0; i < r.nav.length; i++) {
    await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-item')[${i}].click()`)
    await wait(500)
    const s = await probe()
    visited.push(`${r.nav[i].padEnd(10)} title="${s.title}" cards=${s.cards}`)
    if (process.env.DCC_SHOTS) {
      writeFileSync(path.join(process.env.DCC_SHOTS, `${String(i).padStart(2, '0')}-${r.nav[i].toLowerCase()}.png`), (await win.webContents.capturePage()).toPNG())
    }
  }
  writeFileSync(path.join(__dirname, '../../smoke.png'), (await win.webContents.capturePage()).toPNG())

  // Drive the update prompt down the same IPC channel the updater uses, so the
  // toast is exercised for real rather than only compiled.
  const toastShots = process.env.DCC_SHOTS
  const seen = []
  for (const [label, payload] of [
    ['available', { state: 'available', version: '9.9.9', notes: '<ul><li>A first change</li><li>A second change</li></ul>' }],
    ['downloading', { state: 'downloading', percent: 42 }],
    ['ready', { state: 'ready', version: '9.9.9' }],
  ]) {
    win.webContents.send('update:status', payload)
    await wait(500)
    const t = await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector('.update-toast')
      return el ? el.innerText.split('\\n').join(' | ') : null
    })()`)
    seen.push(`${label}: ${t ?? 'NOT SHOWN'}`)
    if (toastShots) {
      writeFileSync(path.join(toastShots, `toast-${label}.png`), (await win.webContents.capturePage()).toPNG())
    }
  }
  console.log('UPDATE TOAST:')
  seen.forEach((x) => console.log('  ' + x))
  if (seen.some((x) => x.includes('NOT SHOWN'))) {
    console.log('SMOKE FAIL: update prompt did not render')
    app.exit(1)
    return
  }

  // The analysed save has to survive leaving the section and coming back — it
  // used to live in the section's own state, so a menu click threw it away and
  // the file had to be chosen again every time.
  // Scoped to the section body on purpose: the title bar also shows the save
  // name, so searching the whole page would pass even if the section lost it.
  const SECTION_HAS_SAVE =
    `/DYNASTY-SMOKE/.test((document.querySelector('.content-narrow')||{}).innerText||'')`
  const savePersist = await (async () => {
    const saveIdx = r.nav.indexOf('SAVE')
    const otherIdx = r.nav.indexOf('WIRE')
    if (saveIdx < 0 || otherIdx < 0) return 'SAVE or WIRE missing from the nav'

    const click = async (i) => {
      await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-item')[${i}].click()`)
      await wait(400)
    }
    answerDialog = true
    await click(saveIdx)
    await win.webContents.executeJavaScript(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => /CHOOSE SAVE FILE/i.test(x.textContent))
      if (b) b.click()
      return !!b
    })()`)
    for (let i = 0; i < 20; i++) {
      await wait(400)
      const got = await win.webContents.executeJavaScript(
        SECTION_HAS_SAVE)
      if (got) break
    }
    const before = await win.webContents.executeJavaScript(
      SECTION_HAS_SAVE)
    if (!before) return 'the save never appeared after choosing it'
    await click(otherIdx)
    await click(saveIdx)
    await wait(400)
    const after = await win.webContents.executeJavaScript(
      SECTION_HAS_SAVE)
    answerDialog = false
    return after ? null : 'the save was lost when leaving the section and returning'
  })()
  console.log('SAVE PERSISTENCE: ' + (savePersist ?? 'survives navigation'))

  console.log('NAV: ' + r.nav.join(' · '))
  console.log('SECTIONS:')
  visited.forEach((v) => console.log('  ' + v))
  console.log('ERRORS: ' + (errors.join(' | ') || '(none)'))

  // The dictionary features need zstd, which arrived in Node 22.15. Electron 33
  // bundled Node 20 and every dictionary check failed while reporting itself as
  // "wrong dictionary". Assert the runtime can actually do the work.
  const zstdOk = typeof require('node:zlib').zstdDecompressSync === 'function'
  console.log('ZSTD: node ' + process.versions.node + ' -> ' + (zstdOk ? 'supported' : 'MISSING'))

  const ok = errors.length === 0 && r.nav.length >= 10 && zstdOk && !savePersist &&
    visited.every((v) => !v.includes('title=""'))
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL')
  app.exit(ok ? 0 : 1)
})
