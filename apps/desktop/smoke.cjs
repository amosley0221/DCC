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
      nav: [...document.querySelectorAll('.gs-nav-item')].map(n => n.textContent.replace(/\\d+$/, '')),
      ops: [...document.querySelectorAll('.subtabs .tab')].map(n => n.textContent.trim()),
      cards: document.querySelectorAll('.card').length,
      title: (document.querySelector('.screen-title') || {}).textContent || '',
    }))()`)

  let r = await probe()
  for (let i = 0; i < 12 && r.nav.length === 0; i++) { await wait(700); r = await probe() }

  const visited = []
  for (let i = 0; i < r.nav.length; i++) {
    await win.webContents.executeJavaScript(`document.querySelectorAll('.gs-nav-item')[${i}].click()`)
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
    ['available', { state: 'available', version: '9.9.9', notes: '<h3>Added</h3>\\n<ul>\\n<li><strong>The depth chart, read out of your save.</strong> Every position in the order the game plays them — offense, defense and special teams — with the starter on the card and the rest a click away. It used to sort by overall and admit it could not read your real ordering.</li>\\n<li><strong>Reorder it and commit.</strong> Open a position, drag or use the arrows, and the changes are held until you press commit.</li>\\n</ul>' }],
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
  // The toast is fixed to the window. A shell rule matching it at the same
  // specificity once turned that into `relative`, which dropped it out of the
  // corner and pushed it off the left edge — visible only in a screenshot, so
  // assert the property rather than trusting the eye.
  const toastFixed = await win.webContents.executeJavaScript(
    `(() => { const el = document.querySelector('.update-toast')
        return el ? getComputedStyle(el).position : 'missing' })()`)
  console.log('UPDATE TOAST POSITION: ' + toastFixed)

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
    `/DYNASTY-SMOKE/.test((document.querySelector('.gs-page-in')||{}).innerText||'')`
  const savePersist = await (async () => {
    const otherIdx = r.nav.indexOf('Home')
    if (otherIdx < 0) return 'Home missing from the nav'
    // Everything operational is behind the gear in Gold Standard.
    const openSave = async () => {
      await win.webContents.executeJavaScript(`document.querySelector('.gs-gear').click()`)
      await wait(400)
      return win.webContents.executeJavaScript(
        `(() => { const t = [...document.querySelectorAll('.subtabs .tab')]
            .find(x => /Dynasty file/i.test(x.textContent)); if (t) t.click(); return !!t })()`)
    }
    if (!(await openSave())) return 'Dynasty file missing from the settings tabs'

    const click = async (i) => {
      if (i === 'save') await openSave()
      else await win.webContents.executeJavaScript(`document.querySelectorAll('.gs-nav-item')[${i}].click()`)
      await wait(400)
    }
    answerDialog = true
    await click('save')
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
    await click('save')
    await wait(400)
    const after = await win.webContents.executeJavaScript(
      SECTION_HAS_SAVE)
    answerDialog = false
    return after ? null : 'the save was lost when leaving the section and returning'
  })()
  console.log('SAVE PERSISTENCE: ' + (savePersist ?? 'survives navigation'))

  // With a save loaded, Recruit has to switch to the save-backed pool rather
  // than the sample dynasty. Asserted in the DOM, because "the component
  // exists" has passed before while the screen showed something else.
  const recruitFromSave = await (async () => {
    const idx = r.nav.indexOf('Recruiting')
    if (idx < 0) return 'Recruiting missing from the nav'
    await win.webContents.executeJavaScript(`document.querySelectorAll('.gs-nav-item')[${idx}].click()`)
    await wait(500)
    const text = await win.webContents.executeJavaScript(
      `((document.querySelector('.gs-page-in')||{}).innerText||'')`)
    if (!/IN THE POOL|RECRUITING POOL|NARROW THE POOL/i.test(text)) return 'Recruit did not show the save-backed pool: ' + text.slice(0, 120)
    return null
  })()
  console.log('RECRUIT FROM SAVE: ' + (recruitFromSave ?? 'shows the recruiting pool'))
  if (recruitFromSave) { console.log('SMOKE FAIL: ' + recruitFromSave); app.exit(1); return }

  // Portraits are served over a custom scheme, so two things have to be right:
  // the protocol handler, and the page's own security policy. The policy was
  // the one that broke — img-src did not list the scheme, so every face was
  // refused by the page and rendered as a broken image. Loading a real file
  // end to end is the only check that would have caught it.
  const artLoads = await (async () => {
    const dir = path.join(require('node:os').tmpdir(), 'dcc-art-smoke')
    require('node:fs').mkdirSync(dir, { recursive: true })
    // A 1x1 PNG, so a successful decode means the bytes really arrived.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64')
    const name = 'nilpp_Generic_0001_P_T0000_D_1_1.png'
    require('node:fs').writeFileSync(path.join(dir, name), png)
    const res = await win.webContents.executeJavaScript(
      `window.dcc.indexFaces(${JSON.stringify(dir)}, ['Generic_0001_P_T0000_D_1_1'], [])`)
    if (!res.ok) return 'indexFaces failed: ' + res.message
    if (res.match.matched !== 1) return 'the art folder did not match the asset id'
    const file = res.paths['Generic_0001_P_T0000_D_1_1']
    if (!file) return 'no path came back for the matched id'
    const loaded = await win.webContents.executeJavaScript(`new Promise((res) => {
      const i = new Image()
      i.onload = () => res(i.naturalWidth > 0 ? 'ok' : 'zero width')
      i.onerror = () => res('blocked or not found')
      i.src = 'dccart://art/' + ${JSON.stringify(file)}.split(/[\\/]/).map(encodeURIComponent).join('/')
      setTimeout(() => res('timed out'), 4000)
    })`)
    return loaded === 'ok' ? null : 'the portrait did not load: ' + loaded
  })()
  console.log('ART OVER dccart://: ' + (artLoads ?? 'a real image loads'))
  if (artLoads) { console.log('SMOKE FAIL: ' + artLoads); app.exit(1); return }

  // The game switcher hangs off the topbar, and every shell child sits in its
  // own stacking context at the same level — so main, later in source order,
  // painted straight over it and the menu read as see-through. Hit-test it:
  // whatever is at the middle of a row has to belong to the menu.
  const menuOnTop = await (async () => {
    const opened = await win.webContents.executeJavaScript(
      `(() => { const b = document.querySelector('.gs-mark'); if (b) b.click(); return !!b })()`)
    if (!opened) return 'no wordmark to click'
    // React renders the menu on the next tick, so the click and the hit test
    // cannot live in the same evaluation.
    await wait(400)
    return win.webContents.executeJavaScript(`(() => {
      const menu = document.querySelector('.gs-games')
      if (!menu) return 'the menu did not open'
      const row = menu.querySelector('.gs-game')
      const b = row.getBoundingClientRect()
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
      const covered = !menu.contains(hit)
      document.querySelector('.gs-mark').click()
      return covered ? 'the menu is painted over by ' + (hit ? hit.className : 'nothing') : null
    })()`)
  })()
  console.log('GAME SWITCHER: ' + (menuOnTop ?? 'opens above the page'))
  if (menuOnTop) { console.log('SMOKE FAIL: ' + menuOnTop); app.exit(1); return }

  // Portal holds two screens behind subtabs, and the second one is the newer
  // of the two. It imported a module that reaches `electron`, which is fine in
  // the main process and fatal in the renderer — the whole app rendered blank.
  // Clicking through to it is what would have caught that in a second.
  const portalTabs = await (async () => {
    const idx = r.nav.indexOf('Portal')
    if (idx < 0) return 'Portal missing from the nav'
    await win.webContents.executeJavaScript(`document.querySelectorAll('.gs-nav-item')[${idx}].click()`)
    await wait(500)
    const clicked = await win.webContents.executeJavaScript(`(() => {
      const t = [...document.querySelectorAll('.subtabs .tab')].find(x => /Tampering/i.test(x.textContent))
      if (t) t.click()
      return !!t
    })()`)
    if (!clicked) return 'Tampering missing from the Portal tabs'
    await wait(600)
    const text = await win.webContents.executeJavaScript(
      `((document.querySelector('.gs-page-in')||{}).innerText||'')`)
    if (!/TAMPERING/i.test(text)) return 'Tampering rendered nothing: ' + text.slice(0, 120)
    // Either it is asking for the roster or it is showing the screen; both are
    // real renders, and which one depends on whether the roster pass has run.
    if (!/week 11|read the roster/i.test(text)) return 'Tampering rendered neither state: ' + text.slice(0, 160)
    return null
  })()
  console.log('PORTAL TABS: ' + (portalTabs ?? 'transfers and tampering both render'))
  if (portalTabs) { console.log('SMOKE FAIL: ' + portalTabs); app.exit(1); return }

  // League and The Program were the same component in the same slot of one
  // conditional chain, so React reused the instance and League opened on
  // whichever tab Program was left on — it said SCORES and showed the roster.
  // Visit Program, leave it on a tab, then open League and read what is there.
  const leagueIsLeague = await (async () => {
    const program = r.nav.indexOf('Program')
    const league = r.nav.indexOf('League')
    if (league < 0) return 'League missing from the nav'
    const go = async (i) => {
      await win.webContents.executeJavaScript(`document.querySelectorAll('.gs-nav-item')[${i}].click()`)
      await wait(500)
    }
    if (program >= 0) {
      await go(program)
      await win.webContents.executeJavaScript(`(() => {
        const t = [...document.querySelectorAll('.subtabs .tab')].find(x => /TEAMS/i.test(x.textContent))
        if (t) t.click()
      })()`)
      await wait(400)
    }
    await go(league)
    const seen = await win.webContents.executeJavaScript(`(() => ({
      title: (document.querySelector('.screen-title') || {}).textContent || '',
      tabs: [...document.querySelectorAll('.subtabs .tab')].map(x => x.textContent.trim()),
      text: ((document.querySelector('.gs-page-in') || {}).innerText || '').slice(0, 200),
    }))()`)
    if (!/league/i.test(seen.title)) return 'League showed "' + seen.title + '"'
    // With a real save it has its own subtabs; with the smoke fixture there is
    // no roster to stand a table on, and it says so. Either is the League
    // screen. What it must never be again is the roster.
    if (!seen.tabs.some((t) => /STANDINGS/i.test(t)) && !/standings/i.test(seen.text)) {
      return 'no standings anywhere: ' + seen.tabs.join(',') + ' / ' + seen.text.slice(0, 100)
    }
    if (/\bPLAYERS\b/i.test(seen.text)) return 'League is still showing the roster'
    return null
  })()
  console.log('LEAGUE TAB: ' + (leagueIsLeague ?? 'is the league, not the roster'))
  if (leagueIsLeague) { console.log('SMOKE FAIL: ' + leagueIsLeague); app.exit(1); return }

  // Settings are written by the renderer as its whole state, and the main
  // process keeps keys of its own in the same file — the polls found in a save
  // above all. Replacing the file wiped them on the next keystroke anywhere in
  // the app, which read as a setting that would not save. Write one of each and
  // check both survive.
  const settingsMerge = await (async () => {
    const before = await win.webContents.executeJavaScript(`(async () => {
      await window.dcc.usePoll({ name: 'SMOKE', at: 123, width: 8, base: 1 })
      await window.dcc.setSettings({ smokeRendererKey: 'yes' })
      const polls = await window.dcc.savedPolls()
      const all = await window.dcc.getSettings()
      return { polls: polls.polls, rendererKey: all.smokeRendererKey }
    })()`)
    if (before.rendererKey !== 'yes') return 'the renderer key was not written'
    if (!before.polls.some((p) => p.name === 'SMOKE')) {
      return 'a poll kept by the main process was wiped by the renderer writing settings'
    }
    await win.webContents.executeJavaScript(`window.dcc.forgetPoll('SMOKE')`)
    return null
  })()
  console.log('SETTINGS MERGE: ' + (settingsMerge ?? 'main-process keys survive a renderer write'))
  if (settingsMerge) { console.log('SMOKE FAIL: ' + settingsMerge); app.exit(1); return }

  console.log('NAV: ' + r.nav.join(' · '))
  console.log('SECTIONS:')
  visited.forEach((v) => console.log('  ' + v))
  console.log('ERRORS: ' + (errors.join(' | ') || '(none)'))

  // The dictionary features need zstd, which arrived in Node 22.15. Electron 33
  // bundled Node 20 and every dictionary check failed while reporting itself as
  // "wrong dictionary". Assert the runtime can actually do the work.
  const zstdOk = typeof require('node:zlib').zstdDecompressSync === 'function'
  console.log('ZSTD: node ' + process.versions.node + ' -> ' + (zstdOk ? 'supported' : 'MISSING'))

  const ok = errors.length === 0 && r.nav.length >= 6 && zstdOk && !savePersist &&
    toastFixed === 'fixed' &&
    visited.every((v) => !v.includes('title=""'))
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL')
  app.exit(ok ? 0 : 1)
})
