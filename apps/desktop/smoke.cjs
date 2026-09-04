/**
 * Boots the real app under Electron, clicks through every section and reports
 * what actually rendered. Catches the class of failure a type-check cannot: a
 * blank window, a preload that never loaded, a section that throws on mount.
 *
 *   xvfb-run -a ./node_modules/electron/dist/electron smoke.cjs --no-sandbox
 */
const path = require('node:path')
const { writeFileSync } = require('node:fs')

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

  console.log('NAV: ' + r.nav.join(' · '))
  console.log('SECTIONS:')
  visited.forEach((v) => console.log('  ' + v))
  console.log('ERRORS: ' + (errors.join(' | ') || '(none)'))

  // The dictionary features need zstd, which arrived in Node 22.15. Electron 33
  // bundled Node 20 and every dictionary check failed while reporting itself as
  // "wrong dictionary". Assert the runtime can actually do the work.
  const zstdOk = typeof require('node:zlib').zstdDecompressSync === 'function'
  console.log('ZSTD: node ' + process.versions.node + ' -> ' + (zstdOk ? 'supported' : 'MISSING'))

  const ok = errors.length === 0 && r.nav.length >= 10 && zstdOk && visited.every((v) => !v.includes('title=""'))
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL')
  app.exit(ok ? 0 : 1)
})
