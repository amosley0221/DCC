import { Fragment, useEffect, useState } from 'react'
import { useStore } from '../store'
import { rosterPatch, useSave } from '../saveStore'
import type { SaveState } from '../saveStore'
import type { PollCandidate, SavedPollView } from '../../electron/saveAnalysis'
import { TEAM_ID_NAMES } from '../../electron/teamIds'
import { Btn, Card, Empty, Input, Kicker, Meta, SectionHeader, Track } from '../ui'
import ArtFolder from './ArtFolder'

/**
 * Dissects the dynasty save so the format can be worked out. Nothing here
 * writes to the save; the only file it creates is a copy and a report.
 *
 * The analysis itself lives in SaveProvider rather than here, so leaving the
 * section and coming back does not throw it away.
 */
export default function Save() {
  const { state, dispatch } = useStore()
  const myTeam = state.teamId === null
    ? null
    : state.teamNames[state.teamId] ?? TEAM_ID_NAMES[state.teamId] ?? null
  const { save, patch } = useSave()
  const { path, report, busy, error, backup, diff, diffing, scan, scanning, dict, dictResult, restoring } = save
  const { install, installBusy, installNote, tables, art } = save
  const { roster, rosterBusy } = save
  // The snapshot is a one-shot export rather than analysis worth keeping, so it
  // lives here rather than in the save store.
  const [snapBusy, setSnapBusy] = useState(false)
  const [snap, setSnap] = useState<string | null>(null)

  const setPath = (v: typeof path) => patch({ path: v })
  const setReport = (v: typeof report) => patch({ report: v })
  const setBusy = (v: boolean) => patch({ busy: v })
  const setError = (v: typeof error) => patch({ error: v })
  const setBackup = (v: typeof backup) => patch({ backup: v })
  const setDiff = (v: typeof diff) => patch({ diff: v })
  const setDiffing = (v: boolean) => patch({ diffing: v })
  const setScan = (v: typeof scan) => patch({ scan: v })
  const setScanning = (v: boolean) => patch({ scanning: v })
  const setDict = (v: typeof dict) => patch({ dict: v })
  const setDictResult = (v: typeof dictResult) => patch({ dictResult: v })

  useEffect(() => { if (!dict) void window.dcc.dictionaryState().then(setDict) }, [dict])

  const chooseDictionary = async () => {
    if (!path) return
    const res = await window.dcc.setDictionary(path)
    if (res.ok) {
      setDictResult(
        `${res.frames.toLocaleString()} frames decoded, ${res.failed} failed — ` +
          `${res.objectBytes.toLocaleString()} bytes of object data.`,
      )
      void window.dcc.dictionaryState().then(setDict)
    } else if (res.message !== 'cancelled') setDictResult(res.message)
  }

  const hunt = async () => {
    if (!report?.zstd || !path) return
    setScanning(true)
    setScan(null)
    const res = await window.dcc.findDictionary(path!, Number(report.zstd.dictionaryId))
    setScanning(false)
    if (res.ok) setScan(res.scan)
    else if (res.message !== 'cancelled') setError(res.message)
  }

  const compare = async () => {
    if (!path) return
    const other = await window.dcc.pickSave()
    if (!other) return
    setDiffing(true)
    setDiff(null)
    const res = await window.dcc.diffSaves(path, other)
    setDiffing(false)
    if (res.ok) setDiff(res.diff)
    else setError(res.message)
  }

  const readRoster = async (from: string) => {
    patch({ rosterBusy: true })
    const res = await window.dcc.roster(from, state.teamId)
    patch({ rosterBusy: false })
    if (res.ok) {
      patch({ roster: rosterPatch(res) })
      dispatch({ type: 'log', line: { text: `read ${res.count.toLocaleString()} players from the save`, kind: 'good' } })
    } else setError(res.message)
  }

  const pick = async () => {
    const chosen = await window.dcc.pickSave()
    if (!chosen) return
    setPath(chosen)
    dispatch({ type: 'savePath', path: chosen })
    setReport(null)
    setError(null)
    setBusy(true)
    const res = await window.dcc.analyzeSave(chosen)
    setBusy(false)
    if (!res.ok) { setError(res.message); return }
    setReport(res.report)
    dispatch({ type: 'log', line: { text: `analyzed ${chosen}`, kind: 'info' } })

    // Choosing a save is one action, not two. Every screen is built out of the
    // roster pass, so read it here rather than making the user find a second
    // button before anything appears.
    void readRoster(chosen)

    // Find the dictionary without making the user hunt for it.
    const have = await window.dcc.dictionaryState()
    setDict(have)
    if (!have.present && res.report.zstd) {
      setDictResult('Looking for the compression dictionary…')
      const auto = await window.dcc.autoDictionary(chosen)
      setDictResult(
        auto.found
          ? `${auto.message} ${auto.file}`
          : `${auto.message} Use “Load dictionary file…” if you know where it is.`,
      )
      void window.dcc.dictionaryState().then(setDict)
    }
  }

  const loadRoster = async () => {
    if (!path) return
    await readRoster(path)
  }

  const scanInstall = async (dir: string) => {
    patch({ installBusy: true, installNote: 'Reading the install…' })
    const res = await window.dcc.scanInstall(dir)
    patch({ installBusy: false })
    if (res.ok) patch({ install: res.report, installNote: null })
    else patch({ installNote: res.message })
  }

  const findInstall = async () => {
    patch({ installBusy: true, installNote: 'Looking for the game…' })
    const res = await window.dcc.findInstall()
    if (res.found) { await scanInstall(res.path); return }
    patch({ installBusy: false, installNote: res.message })
  }

  const pickInstall = async () => {
    const dir = await window.dcc.pickInstall()
    if (dir) await scanInstall(dir)
  }

  const readTables = async () => {
    if (!install) return
    patch({ installBusy: true, installNote: 'Unscrambling the tables…' })
    // The tables that name everything: the top-level layout, and one bundle
    // table from the biggest package.
    const wanted = [...new Set([
      ...install.notable.map((n) => n.path),
      ...install.largestArchives.filter((a) => a.path.toLowerCase().endsWith('.toc')).map((a) => a.path),
    ])].slice(0, 5)
    const res = await window.dcc.readTables(install.root, wanted)
    patch({ installBusy: false })
    if (res.ok) patch({ tables: res.tables, installNote: null })
    else patch({ installNote: res.message })
  }

  const findArt = async () => {
    if (!install) return
    patch({ installBusy: true, installNote: 'Unscrambling the bundle tables and reading the names…' })
    const res = await window.dcc.findArt(install.root)
    patch({ installBusy: false })
    if (res.ok) {
      patch({ art: res.finds, installNote: null })
      const n = res.finds.reduce((t, f) => t + f.art.length, 0)
      dispatch({ type: 'log', line: { text: `read ${res.finds.length} bundle tables — ${n} art names`, kind: 'good' } })
    } else patch({ installNote: res.message })
  }

  const exportInstall = async () => {
    if (!install) return
    const md = [
      '# Game install scan',
      '',
      `- Root: ${install.root}`,
      `- Frostbite archives present: ${install.looksFrostbite ? 'yes' : 'no'}`,
      `- Files scanned: ${install.scannedFiles.toLocaleString()} in ${install.scannedDirs.toLocaleString()} directories`,
      `- Total size: ${(install.totalBytes / 1e9).toFixed(2)} GB${install.truncated ? ' (scan truncated)' : ''}`,
      '',
      '## By extension',
      '',
      '| Extension | Files | Bytes |',
      '| --- | --- | --- |',
      ...install.byExtension.map((e) => `| ${e.ext} | ${e.count} | ${e.bytes.toLocaleString()} |`),
      '',
      '## Biggest directories',
      '',
      ...install.biggestDirs.map((d) => `- ${d.path} — ${(d.bytes / 1e6).toFixed(1)} MB across ${d.files} files`),
      '',
      '## Notable files',
      '',
      ...install.notable.flatMap((n) => [
        `### ${n.path} (${n.bytes.toLocaleString()} bytes)`,
        '```',
        n.head,
        n.headAscii,
        '```',
        '',
      ]),
      '## Largest archives',
      '',
      ...install.largestArchives.flatMap((n) => [
        `### ${n.path} (${n.bytes.toLocaleString()} bytes)`,
        '```',
        n.head,
        n.headAscii,
        '```',
        '',
      ]),
      '## Notes',
      '',
      ...install.notes.map((n) => `- ${n}`),
      ...(tables ? [
        '',
        '## Tables',
        '',
        ...tables.flatMap((t) => [
          `### ${t.file} (${t.bytes.toLocaleString()} bytes read)`,
          '',
          `- Magic: ${t.magic}`,
          `- Obfuscated: ${t.obfuscated ? 'yes' : 'no'}`,
          `- Solved: ${t.solved ? 'yes' : 'no'}${t.scheme ? ` — ${t.scheme}` : ''} (${t.tried} combinations tried)`,
          `- Printable runs: ${t.strings}`,
          `- Known words: ${t.known.join(', ') || '(none)'}`,
          '',
          '```',
          ...(t.sample.length ? t.sample : ['(no readable strings)']),
          '```',
          '',
          'First 64 bytes:',
          '```',
          t.headHex,
          '```',
          '',
        ]),
      ] : []),
      ...(art ? [
        '',
        '## Bundle tables and asset names',
        '',
        ...art.flatMap((f) => [
          `### ${f.file}`,
          '',
          `- ${f.bytes.toLocaleString()} bytes read, ${f.solved ? `unscrambled with a ${f.keyLength}-byte key` : 'not scrambled or not solved'}`,
          `- ${f.totalStrings.toLocaleString()} strings, ${f.art.length} looking like art` +
            `, ${(f.playerArt ?? []).length} matching the save's player-art scheme`,
          '',
          // Listed first and on their own: a name in the save's own scheme is
          // what joins a recruit to a face, so it is the finding that matters.
          ...((f.playerArt ?? []).length
            ? ['Player art (joins to the save):', '```', ...(f.playerArt ?? []), '```', ''] : []),
          ...(f.art.length ? ['Art names:', '```', ...f.art, '```', ''] : []),
          'Sample of all names:',
          '```',
          ...f.sample.slice(0, 20),
          '```',
          '',
        ]),
      ] : []),

      // The extracted-art folder, described by name only. This is what makes a
      // category of art usable — helmets, logos, awards and bowls each have
      // their own scheme — and it travels as a few kilobytes of text rather
      // than as the images themselves.
      ...(save.faces ? [
        '',
        '## Extracted art folder',
        '',
        `- Root: ${save.faces.root}`,
        `- ${save.faces.files.toLocaleString()} images, ${(save.faces.bytes / 1e6).toFixed(0)} MB`,
        `- Matched ${save.faces.matched.toLocaleString()} of ${save.faces.players.toLocaleString()} players in the save`,
        '',
        '| Extension | Files | Bytes |',
        '| --- | --- | --- |',
        ...save.faces.byExtension.map((e) =>
          `| ${e.ext} | ${e.files.toLocaleString()} | ${e.bytes.toLocaleString()} |`),
        '',
        '### Folders, by size',
        '',
        ...save.faces.dirs.flatMap((d) => [
          `**${d.dir}** — ${d.files.toLocaleString()} files, ${(d.bytes / 1e6).toFixed(1)} MB`,
          '',
          '```',
          ...d.sample,
          '```',
          '',
        ]),
        ...(save.faces.unmatchedSample.length ? [
          '### Asset ids in the save with no image',
          '',
          '```',
          ...save.faces.unmatchedSample,
          '```',
          '',
        ] : []),
      ] : []),
    ].join('\n')
    const dest = await window.dcc.saveText('game-install-scan.md', md)
    if (dest) dispatch({ type: 'log', line: { text: `install scan written — ${dest}`, kind: 'good' } })
  }

  const makeBackup = async () => {
    if (!path) return
    const res = await window.dcc.backupSave(path)
    if (res.ok) setBackup(res.dest)
    else setError(res.message)
  }

  const exportReport = async () => {
    if (!report) return
    // Deliberately the report and not the save: it carries the structure
    // without carrying the file itself.
    const md = [
      `# Dynasty save analysis`,
      '',
      `- File: ${report.name}`,
      `- Size: ${report.bytes.toLocaleString()} bytes`,
      `- SHA-256: ${report.sha256}`,
      `- Container: ${report.container}`,
      `- Entropy: ${report.entropy} bits/byte`,
      `- Deflate streams found: ${report.compressedRegions.length}`,
      `- Total inflated: ${report.totalInflatedBytes.toLocaleString()} bytes`,
      '',
      '## Header',
      '```',
      report.headHex,
      report.headAscii,
      '```',
      '',
      '## Notes',
      ...report.notes.map((n) => `- ${n}`),
      '',
      '## Entropy profile',
      '```',
      ...report.entropyProfile.map((e) => `0x${e.offset.toString(16).padStart(8, '0')}  ${e.entropy}`),
      '```',
      '',
      '## Compressed regions',
      ...report.compressedRegions.flatMap((r) => [
        `### offset 0x${r.offset.toString(16)} (${r.method})`,
        `inflates to ${r.inflatedBytes.toLocaleString()} bytes`,
        '```',
        r.preview,
        '```',
      ]),
      // The structure of the save, and the closest thing it has to a table of
      // contents. Both come off the analysis rather than the roster pass, so a
      // report exported before a roster is read still carries them — which is
      // the point of a report: it is what you send when you do not yet know
      // what the save holds. This used to sit in the game-install scan, where
      // nobody looking at a save would ever have found it.
      ...(report.stores.length ? [
        '',
        '## Tables in the save',
        '',
        'Every store the save declares, with its row and member counts.',
        '',
        '| Store | Rows | Members |',
        '| --- | --- | --- |',
        ...report.stores.map((st) => `| ${st.name} | ${st.rows.toLocaleString()} | ${st.members} |`),
      ] : []),

      ...(report.classNames.length ? [
        '',
        '## Class names',
        '',
        "Every string shaped like one of the save's own class names, in full.",
        'Most are declared once, so none of them reach the frequency list below.',
        '',
        '```',
        ...report.classNames.map((c) => `${String(c.count).padStart(4)}  ${c.text}`),
        '```',
      ] : []),

      '',
      '## Strings',
      '```',
      ...report.strings.map((s) => `${String(s.count).padStart(4)}  ${s.text}`),
      '```',
      '',
      '## UTF-16 strings',
      '```',
      ...report.utf16Strings,
      '```',
    ].join('\n')
    const dest = await window.dcc.saveText('dynasty-save-analysis.md', md)
    if (dest) dispatch({ type: 'log', line: { text: `analysis written — ${dest}`, kind: 'good' } })
  }

  return (
    <>
      <SectionHeader
        title="Save"
        sub={<Meta>READ ONLY — NOTHING HERE WRITES TO YOUR SAVE</Meta>}
        right={<Btn variant="primary" onClick={pick}>Choose save file…</Btn>}
      />

      <div className="col" style={{ gap: 12, maxWidth: 860 }}>
        <ArtFolder />

        {save.roster ? (
          <Found roster={save.roster} me={myTeam} path={path}
            onApplied={() => { if (path) void readRoster(path) }} />
        ) : null}
        {report?.stores?.length ? <Stores stores={report.stores} path={path} /> : null}

        <Card className="card-pad">
          <Kicker>Why this exists</Kicker>
          <p className="body-serif" style={{ marginTop: 7, marginBottom: 0 }}>
            The dynasty save is an undocumented binary format, so before anything can read it, it
            has to be taken apart: what wraps it, which parts are compressed, and what readable
            structure is inside. This runs entirely on your machine. Export the report and the
            save itself never has to leave it.
          </p>
        </Card>

        {error ? (
          <Card className="card-pad" style={{ borderColor: 'var(--accent)' }}>
            <Kicker>Could not read that file</Kicker>
            <div className="body-serif" style={{ marginTop: 6 }}>{error}</div>
          </Card>
        ) : null}

        {busy ? <Card className="card-pad"><Meta color="var(--warn)">ANALYZING…</Meta></Card> : null}
        {restoring ? (
          <Card className="card-pad"><Meta color="var(--warn)">REOPENING THE LAST SAVE…</Meta></Card>
        ) : null}

        {!path && !busy && !restoring ? (
          <Card className="card-pad"><Empty>choose your DYNASTY-*.sav to begin</Empty></Card>
        ) : null}

        <Card className="card-pad">
          <Kicker>Game art</Kicker>
          <p className="body-serif" style={{ marginTop: 7 }}>
            Team logos, player portraits and coach faces are not in the save — they live in the
            game install, in Frostbite's asset archives. That is a different format and it has to
            be worked out the same way the save was. This reads the install and describes what is
            there; it decodes nothing and changes nothing.
          </p>
          {installNote ? <div className="effect" style={{ marginTop: 8 }}>{installNote}</div> : null}
          {install ? (
            <>
              <div className="grid-3" style={{ marginTop: 10 }}>
                <div><Meta size={9}>ARCHIVES</Meta><div className="num" style={{ fontSize: 15, color: install.looksFrostbite ? 'var(--good)' : 'var(--accent)' }}>{install.looksFrostbite ? 'Frostbite' : 'none found'}</div></div>
                <div><Meta size={9}>FILES</Meta><div className="num" style={{ fontSize: 15, color: 'var(--ink)' }}>{install.scannedFiles.toLocaleString()}</div></div>
                <div><Meta size={9}>SIZE</Meta><div className="num" style={{ fontSize: 15, color: 'var(--ink)' }}>{(install.totalBytes / 1e9).toFixed(1)} GB</div></div>
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 8, wordBreak: 'break-all' }}>{install.root}</div>
              <div style={{ marginTop: 10 }}>
                {install.byExtension.slice(0, 6).map((e) => (
                  <div key={e.ext} className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                    <Meta size={9}>{e.ext}</Meta>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ink2)' }}>
                      {e.count.toLocaleString()} files · {(e.bytes / 1e9).toFixed(2)} GB
                    </span>
                  </div>
                ))}
              </div>
              {tables ? (
                <div style={{ marginTop: 10 }}>
                  {tables.map((t) => (
                    <div key={t.file} style={{ borderTop: '1px solid var(--line)', paddingTop: 6, marginTop: 6 }}>
                      <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                        <Meta size={9}>{t.file}</Meta>
                        <Meta size={9} color={t.solved ? 'var(--good)' : 'var(--accent)'}>
                          {t.solved ? 'READABLE' : t.obfuscated ? 'SCRAMBLED — NOT SOLVED' : 'PLAIN'}
                        </Meta>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--ink3)' }}>
                          {t.strings.toLocaleString()} strings
                        </span>
                      </div>
                      {t.scheme ? <div className="mono" style={{ fontSize: 10, color: 'var(--ink3)' }}>{t.scheme}</div> : null}
                      {t.sample.length ? (
                        <div className="mono" style={{ fontSize: 10, color: 'var(--ink2)', marginTop: 3 }}>
                          {t.sample.slice(0, 6).join(' · ')}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {art ? (
                <div style={{ marginTop: 10 }}>
                  <Meta size={9}>
                    {art.length} BUNDLE TABLES · {art.reduce((t, f) => t + f.art.length, 0)} ART NAMES
                  </Meta>
                  {art.filter((f) => f.art.length).slice(0, 4).map((f) => (
                    <div key={f.file} style={{ borderTop: '1px solid var(--line)', paddingTop: 6, marginTop: 6 }}>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--ink3)' }}>{f.file}</div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--ink2)', marginTop: 3 }}>
                        {f.art.slice(0, 8).join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {install.notes.map((n, i) => (
                <p key={i} className="body-serif" style={{ marginTop: 8, marginBottom: 0, color: 'var(--ink3)' }}>{n}</p>
              ))}
            </>
          ) : null}
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <Btn variant="primary" onClick={findInstall} disabled={installBusy}>
              {installBusy ? 'Working…' : 'Find the game'}
            </Btn>
            <Btn onClick={pickInstall} disabled={installBusy}>Choose the folder…</Btn>
            {install ? <Btn onClick={readTables} disabled={installBusy}>Read the tables</Btn> : null}
            {tables ? <Btn onClick={findArt} disabled={installBusy}>Find the art</Btn> : null}
            {install ? <Btn onClick={exportInstall}>Export this scan</Btn> : null}
          </div>
        </Card>

        {report ? (
          <>
            <Card className="card-pad">
              <Kicker>{report.name}</Kicker>
              <div className="grid-3" style={{ marginTop: 10 }}>
                <div><Meta size={9}>SIZE</Meta><div className="num" style={{ fontSize: 15, color: 'var(--ink)' }}>{report.bytes.toLocaleString()} B</div></div>
                <div><Meta size={9}>CONTAINER</Meta><div className="num" style={{ fontSize: 15, color: 'var(--ink)' }}>{report.container}</div></div>
                <div><Meta size={9}>ENTROPY</Meta><div className="num" style={{ fontSize: 15, color: report.entropy > 7.5 ? 'var(--warn)' : 'var(--ink)' }}>{report.entropy}</div></div>
              </div>
              <div style={{ marginTop: 10 }}><Meta size={9}>SHA-256</Meta><div className="mono" style={{ fontSize: 10, color: 'var(--ink3)', wordBreak: 'break-all' }}>{report.sha256}</div></div>
              <div className="row" style={{ gap: 8, marginTop: 12 }}>
                <Btn variant="primary" onClick={exportReport}>Export analysis report</Btn>
                <Btn onClick={makeBackup}>Back up this save</Btn>
                <Btn onClick={compare}>Compare with another save…</Btn>
              </div>
              {backup ? <div className="effect" style={{ marginTop: 10 }}>BACKED UP TO {backup}</div> : null}
            </Card>

            <Card className="card-pad">
              <Kicker>Snapshot for the phone</Kicker>
              <p className="body-serif" style={{ marginTop: 7 }}>
                The save lives on this machine and only this app can read it, so the phone needs
                the data handed to it. A snapshot is one file holding every team, the whole
                season's games and results, your roster with ratings, and the recruiting pool.
                Move it to the phone and import it in the Android app's settings.
              </p>
              <Btn variant="primary" disabled={snapBusy} onClick={async () => {
                if (!path) return
                setSnapBusy(true)
                const res = await window.dcc.snapshot(path, state.teamId)
                setSnapBusy(false)
                if (res.ok) {
                  setSnap(`${res.teams} teams, ${res.games} games, ${res.players.toLocaleString()} players and ${res.recruits.toLocaleString()} recruits written to ${res.path}`)
                  dispatch({ type: 'log', line: { text: `snapshot written to ${res.path}`, kind: 'good' } })
                } else if (res.message !== 'cancelled') {
                  setSnap(res.message)
                }
              }}>
                {snapBusy ? 'Building…' : 'Export a snapshot…'}
              </Btn>
              {state.teamId === null ? (
                <Meta size={9} color="var(--warn)">
                  PICK YOUR TEAM IN THE TEAM SECTION FIRST, OR THE SNAPSHOT WILL NOT KNOW WHICH ROSTER IS YOURS
                </Meta>
              ) : null}
              {snap ? <div className="effect" style={{ marginTop: 10 }}>{snap.toUpperCase()}</div> : null}
            </Card>

            <Card className="card-pad">
              <Kicker>Roster</Kicker>
              {!roster ? (
                <>
                  <p className="body-serif" style={{ marginTop: 7 }}>
                    Names, hometowns, positions, overalls, redshirt status and all 53 ratings, read
                    straight out of the save. Ratings are 7-bit fields whose positions were worked
                    out from controlled edits and checked against a real rating card.
                  </p>
                  <Btn variant="primary" onClick={loadRoster} disabled={rosterBusy}>
                    {rosterBusy ? 'Reading…' : 'Read the roster'}
                  </Btn>
                </>
              ) : (
                <>
                  <div className="grid-3" style={{ marginTop: 10 }}>
                    <div><Meta size={9}>PLAYERS</Meta><div className="num" style={{ fontSize: 15, color: 'var(--ink)' }}>{roster.count.toLocaleString()}</div></div>
                    <div><Meta size={9}>RATINGS EACH</Meta><div className="num" style={{ fontSize: 15, color: 'var(--ink)' }}>{roster.ratingNames.length}</div></div>
                    <div><Meta size={9}>REDSHIRTED</Meta><div className="num" style={{ fontSize: 15, color: 'var(--ink)' }}>{roster.players.filter((p) => p.redshirt).length.toLocaleString()}</div></div>
                  </div>
                  <p className="body-serif" style={{ marginTop: 10, marginBottom: 0 }}>
                    Browse them in the Team section. Five rating pairs sit at known positions but
                    could be labeled the other way round — within each, the two behave almost
                    identically across the league, so nothing in the file separates them:{' '}
                    {roster.unverifiedPairs.map((p) => p.join(' / ')).join(', ')}.
                  </p>
                </>
              )}
            </Card>

            {report.zstd ? (
              <Card className="card-pad" style={{ borderColor: 'var(--accent)' }}>
                <Kicker>Compression dictionary</Kicker>
                <div className="grid-3" style={{ marginTop: 10 }}>
                  <div><Meta size={9}>ZSTD FRAMES</Meta><div className="num" style={{ fontSize: 15, color: 'var(--ink)' }}>{report.zstd.frames.toLocaleString()}</div></div>
                  <div><Meta size={9}>DICTIONARY</Meta><div className="num" style={{ fontSize: 15, color: 'var(--ink)' }}>{report.zstd.dictionaryId}</div></div>
                  <div><Meta size={9}>IN THE SAVE</Meta><div className="num" style={{ fontSize: 15, color: report.zstd.dictionaryInSave ? 'var(--good)' : 'var(--accent)' }}>{report.zstd.dictionaryInSave ? 'yes' : 'no'}</div></div>
                </div>
<p className="body-serif" style={{ marginTop: 9 }}>
                  {dict?.present ? (
                    <>
                      The game objects live inside these frames, compressed against a shared
                      dictionary the save does not carry. That dictionary is loaded and verified
                      against this save, so the frames are readable — about 6.8 MB of object data.
                      Replace it only if you point the app at a save from a different game build.
                    </>
                  ) : (
                    <>
                      The game objects live inside these frames, and every one of them is compressed
                      against a shared dictionary that is not stored in the save. Without that
                      dictionary the frames cannot be read. Search the game install for it — or any
                      other tool that already reads these saves, since it must carry the dictionary too.
                    </>
                  )}
                </p>

                {dict?.present ? (
                  <div className="effect" style={{ marginTop: 10 }}>
                    DICTIONARY {dict.id} LOADED — {dict.bytes?.toLocaleString()} BYTES. THE FRAMES ARE READABLE.
                  </div>
                ) : null}
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <Btn
                    onClick={async () => {
                      if (!path) return
                      setDictResult('Looking for the compression dictionary…')
                      const auto = await window.dcc.autoDictionary(path)
                      setDictResult(auto.found ? `${auto.message} ${auto.file}` : auto.message)
                      void window.dcc.dictionaryState().then(setDict)
                    }}
                  >
                    Find it automatically
                  </Btn>
                  <Btn variant="primary" onClick={chooseDictionary}>
                    {dict?.present ? 'Replace dictionary…' : 'Load dictionary file…'}
                  </Btn>
                  <Btn disabled={scanning} onClick={hunt}>
                    {scanning ? 'Scanning…' : 'Search a folder for it…'}
                  </Btn>
                </div>
                {dictResult ? <div style={{ marginTop: 9 }}><Meta size={10}>{dictResult}</Meta></div> : null}
                {scan ? (
                  <div className="col" style={{ gap: 7, marginTop: 12 }}>
                    <Meta size={10}>
                      {scan.filesScanned.toLocaleString()} files ·{' '}
                      {(scan.bytesScanned / 1024 ** 3).toFixed(2)} GB ·{' '}
                      {scan.dictionariesSeen.toLocaleString()} dictionaries seen
                    </Meta>
                    {scan.notes.map((n, i) => <span key={i} className="body-serif">{n}</span>)}
                    {scan.hits.map((h) => (
                      <div key={h.file + h.offset} className="col" style={{ gap: 2 }}>
                        <span className="mono" style={{ fontSize: 10.5, color: h.verified ? 'var(--good)' : 'var(--ink)', wordBreak: 'break-all' }}>
                          {h.verified ? '✓ ' : ''}{h.file}
                        </span>
                        <Meta size={9} color={h.verified ? 'var(--good)' : undefined}>
                          0x{h.offset.toString(16)} · {h.reason}
                        </Meta>
                        {h.sampleText ? (
                          <pre className="mono" style={{ fontSize: 10, color: 'var(--ink2)', whiteSpace: 'pre-wrap', margin: '3px 0 0' }}>
                            {h.sampleText}
                          </pre>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>
            ) : null}

            {diffing ? <Card className="card-pad"><Meta color="var(--warn)">COMPARING…</Meta></Card> : null}

            {diff ? (
              <Card className="card-pad" style={{ borderColor: 'var(--accent)' }}>
                <Kicker>
                  {diff.differingBytes.toLocaleString()} byte
                  {diff.differingBytes === 1 ? '' : 's'} changed
                </Kicker>
                <div style={{ marginTop: 6 }}>
                  <Meta size={10}>{diff.aName} → {diff.bName}</Meta>
                </div>
                {diff.decodedNote ? (
                  <div style={{ marginTop: 9 }}>
                    <span className="body-serif">{diff.decodedNote}</span>
                  </div>
                ) : null}
                {diff.frameDiffs?.length ? (
                  <div className="col" style={{ gap: 6, marginTop: 11 }}>
                    <Meta size={9}>INSIDE THE DECODED FRAMES</Meta>
                    {diff.frameDiffs.slice(0, 12).map((f) => (
                      <div key={f.frameOffset} className="col" style={{ gap: 2 }}>
                        <Meta size={10}>
                          frame 0x{f.frameOffset.toString(16)} · {f.differingBytes} byte(s)
                        </Meta>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--ink2)' }}>
                          {f.detail.slice(0, 8).map((d) => `+${d.at}: ${d.a}→${d.b}`).join('   ')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {diff.notes.length ? (
                  <div className="col" style={{ gap: 5, marginTop: 9 }}>
                    {diff.notes.map((n, i) => <span key={i} className="body-serif">{n}</span>)}
                  </div>
                ) : null}
                <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 11 }}>
                  <table className="tbl">
                    <thead>
                      <tr><th style={{ width: 110 }}>Offset</th><th style={{ width: 54 }}>Len</th><th style={{ width: 84 }}>Bits</th><th>Before</th><th>After</th></tr>
                    </thead>
                    <tbody>
                      {diff.runs.map((r) => (
                        <tr key={r.offset}>
                          <td className="num" style={{ color: 'var(--ink)' }}>0x{r.offset.toString(16)}</td>
                          <td className="num">{r.length}</td>
                          <td className="num" style={{ color: 'var(--accent)' }}>{r.bits}</td>
                          <td className="num" style={{ color: 'var(--ink3)' }}>{r.a}</td>
                          <td className="num" style={{ color: 'var(--ink3)' }}>{r.b}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : null}

            <Card className="card-pad">
              <Kicker>Header</Kicker>
              <pre className="mono" style={{ fontSize: 10.5, color: 'var(--ink2)', whiteSpace: 'pre-wrap', margin: '9px 0 0' }}>
                {report.headHex}
                {'\n'}
                {report.headAscii}
              </pre>
            </Card>

            {report.notes.length ? (
              <Card className="card-pad">
                <Kicker>What this suggests</Kicker>
                <div className="col" style={{ gap: 6, marginTop: 9 }}>
                  {report.notes.map((n, i) => <span key={i} className="body-serif">{n}</span>)}
                </div>
              </Card>
            ) : null}

            <Card className="card-pad">
              <Kicker>Entropy across the file</Kicker>
              <Meta size={9}>ABOVE 7.5 MEANS COMPRESSED OR ENCRYPTED</Meta>
              <div className="col" style={{ gap: 3, marginTop: 9 }}>
                {report.entropyProfile.map((e) => (
                  <div key={e.offset} className="row" style={{ gap: 9 }}>
                    <span className="num" style={{ width: 92, color: 'var(--ink4)', fontSize: 10 }}>
                      0x{e.offset.toString(16).padStart(8, '0')}
                    </span>
                    <div style={{ flex: 1 }}>
                      <Track value={e.entropy} max={8} fill={e.entropy > 7.5 ? 'var(--warn)' : 'var(--ink3)'} height={5} />
                    </div>
                    <span className="num" style={{ width: 34, color: 'var(--ink3)', fontSize: 10 }}>{e.entropy}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="card-pad">
              <Kicker>Compressed regions ({report.compressedRegions.length})</Kicker>
              {report.compressedRegions.length === 0 ? (
                <Empty>no deflate streams decoded — the format is not plain zlib</Empty>
              ) : (
                <div className="col" style={{ gap: 10, marginTop: 9 }}>
                  {report.compressedRegions.map((r) => (
                    <div key={r.offset} className="col" style={{ gap: 4 }}>
                      <Meta size={10}>
                        0x{r.offset.toString(16)} · {r.method} · inflates to {r.inflatedBytes.toLocaleString()} B
                      </Meta>
                      <pre className="mono" style={{ fontSize: 10, color: 'var(--ink3)', whiteSpace: 'pre-wrap', margin: 0 }}>
                        {r.preview}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="card-pad">
              <Kicker>Readable strings</Kicker>
              <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 9 }}>
                {report.strings.length === 0 ? <Empty>none found</Empty> : null}
                {report.strings.map((s) => (
                  <div key={s.text} className="row" style={{ gap: 10 }}>
                    <span className="num" style={{ width: 34, color: 'var(--ink4)', fontSize: 10 }}>{s.count}</span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ink2)' }}>{s.text}</span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </>
  )
}

/**
 * The tables the save declares, and a way to read one.
 *
 * The store directory says what exists and how wide a row is; it never says
 * which column is which. Every field decoded so far was found by looking at
 * rows beside a value already known — a poll's number one, a rank, a score —
 * and this is what makes that possible without a hex editor.
 */
function Stores({ stores, path }: {
  stores: { name: string; rows: number; members: number }[]
  path: string | null
}) {
  const [q, setQ] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [members, setMembers] = useState<Record<string, string>>({})
  const query = q.trim().toLowerCase()
  const shown = query
    ? stores.filter((s) => s.name.toLowerCase().includes(query))
    : stores.slice(0, 20)

  /** What the schema says this store holds — names, ranges and enums. */
  const explain = async (name: string, count: number) => {
    if (open === name) { setOpen(null); return }
    setOpen(name)
    if (members[name]) return
    const res = await window.dcc.schemaStore(name, count)
    setMembers((m) => ({
      ...m,
      [name]: res.ok
        ? `${res.type}\n` + res.members
            .map((x) => `  ${String(x.i).padStart(3)}  ${x.n}  ·  ` +
              (x.e ? `enum(${x.e.length}) ${x.e.slice(0, 6).join(' ')}`
                : x.lo !== undefined ? `${x.lo}..${x.hi}${x.w ? ` (${x.w} bits)` : ''}`
                : x.t))
            .join('\n')
        : res.message,
    }))
  }

  const dump = async (name: string) => {
    if (!path) return
    setNote(`reading ${name}…`)
    const res = await window.dcc.dumpStore(path, name, 60)
    setNote(res.ok
      ? `${name}: ${res.rows.toLocaleString()} rows of ${res.rowBytes} bytes — written to ${res.file}`
      : res.message)
  }

  return (
    <Card className="card-pad">
      <div className="card-head">
        <Kicker>Tables in the save</Kicker>
        <Meta size={10}>{stores.length} STORES</Meta>
      </div>
      <p className="body-serif" style={{ marginTop: 7 }}>
        Every table the save announces, with its row and member counts. Click a name and the
        game's own schema says what it holds — the members, their ranges, their enum values.
        Click Dump to write its first sixty rows to a file. Between the two, a column stops being
        anonymous: the schema says what is in the row, and the rows say which is which.
      </p>
      <Input placeholder="search the tables — poll, rank, award, stat…" value={q}
        onChange={(e) => setQ(e.target.value)} />
      <table className="tbl" style={{ marginTop: 10 }}>
        <thead>
          <tr><th>Store</th><th style={{ textAlign: 'right' }}>Rows</th><th style={{ textAlign: 'right' }}>Members</th><th /></tr>
        </thead>
        <tbody>
          {shown.map((st) => (
            <Fragment key={st.name}>
              <tr>
                <td className="name">
                  <button onClick={() => void explain(st.name, st.members)}
                    style={{ all: 'unset', cursor: 'pointer', color: open === st.name ? 'var(--accent)' : 'var(--ink)' }}>
                    {st.name}
                  </button>
                </td>
                <td className="num">{st.rows.toLocaleString()}</td>
                <td className="num" style={{ color: 'var(--ink3)' }}>{st.members}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="gs-close" disabled={!path} onClick={() => void dump(st.name)}>Dump</button>
                </td>
              </tr>
              {open === st.name ? (
                <tr>
                  <td colSpan={4} style={{ paddingTop: 0 }}>
                    <pre style={{
                      margin: 0, maxHeight: 260, overflow: 'auto', fontSize: 11,
                      color: 'var(--ink2)', background: 'var(--surface)',
                      border: '1px solid var(--line)', borderRadius: 6, padding: 10,
                    }}>{members[st.name] ?? 'reading the schema…'}</pre>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
      {!query && stores.length > shown.length ? (
        <Meta size={9}>SHOWING THE {shown.length} BIGGEST — SEARCH FOR THE REST</Meta>
      ) : null}
      {note ? <div style={{ marginTop: 9 }}><Meta size={9}>{note.toUpperCase()}</Meta></div> : null}
    </Card>
  )
}

/**
 * The game's own numbers, and whether this save gave them up.
 *
 * Both of these are searched for rather than read from a known offset, so what
 * matters is being able to see what the search found: a ranking that does not
 * match the game's is a column that means something else, and the only way to
 * tell is to look at the top of it beside the real thing.
 */
function Found({ roster, me, path, onApplied }: {
  roster: NonNullable<SaveState['roster']>; me: string | null; path: string | null
  onApplied: () => void
}) {
  const columns = roster.rankColumns ?? []
  const all = roster.heisman ?? []
  const heisman = all.filter((h) => h.index >= 0)

  return (
    <Card className="card-pad">
      <div className="card-head">
        <Kicker>The game's own rankings</Kicker>
        <Meta size={10}>
          {columns.length ? `${columns.length} FOUND` : 'NONE FOUND'}
          {heisman.length ? ` · HEISMAN ${heisman.length}` : ''}
        </Meta>
      </div>
      <p className="body-serif" style={{ marginTop: 7 }}>
        There is no poll table in the save: a team's rank is one of TeamStore's 424 members and
        nothing says which. DCC finds them by the one shape a ranking has — every place filled
        exactly once across all {Object.keys(columns[0]?.ranks ?? {}).length || 143} programs — and
        rejects a plain counter, which is a perfect ordering by accident.
      </p>

      <PollFinder me={me} path={path} onApplied={onApplied} />

      {columns.length === 0 ? (
        <Meta size={9} color="var(--warn)">NOTHING FOUND BY SHAPE ALONE — POINT AT A RANK INSTEAD</Meta>
      ) : (
        <div className="col" style={{ gap: 10, marginTop: 10 }}>
          {columns.map((c, i) => {
            const top = Object.entries(c.ranks)
              .sort((a, b) => a[1] - b[1])
              .slice(0, 10)
            return (
              <div key={i} style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
                  <Meta size={9} color="var(--accent)">#{i + 1}</Meta>
                  <Meta size={9}>{c.kind === 'top25' ? 'A POLL — 25 RANKED' : 'A FULL ORDERING'}</Meta>
                  <Meta size={9} color="var(--ink4)">
                    BIT {c.at} · {c.width} WIDE
                  </Meta>
                  {/* The fastest way to recognise your own poll: you already
                      know where your team sits in it. */}
                  {me ? (
                    <Meta size={9} color={c.ranks[me] ? 'var(--good)' : 'var(--ink4)'}>
                      {me.toUpperCase()}: {c.ranks[me] ? `NO. ${c.ranks[me]}` : 'UNRANKED'}
                    </Meta>
                  ) : null}
                </div>
                <div style={{ marginTop: 5, fontSize: 12, color: 'var(--ink2)' }}>
                  {top.map(([name, rank]) => `${rank}. ${name}`).join('  ·  ')}
                </div>
              </div>
            )
          })}
          <Meta size={9}>
            COMPARE THESE WITH THE GAME AND PICK YOURS UNDER LEAGUE → RANKINGS
          </Meta>
        </div>
      )}

      <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        <Kicker>The Heisman shortlist</Kicker>
        {heisman.length === 0 ? (
          <div style={{ marginTop: 6 }}>
            <Meta size={9} color="var(--warn)">
              {all.length
                ? `${all.length} ROWS ARE THERE, BUT NONE OF THEIR COLUMNS IS A PLAYER REFERENCE`
                : 'NO SHORTLIST IN THIS SAVE YET — THE GAME FILLS IT LATER IN THE SEASON'}
            </Meta>
            {all.length ? (
              <>
                <p className="body-serif" style={{ marginTop: 7 }}>
                  The table is here and it has the right number of rows; which of its four members
                  is the player is not written down, and nothing in these rows passes the test for
                  a reference. Rather than name five players it cannot vouch for, DCC prints the
                  rows. Send these and the column can be placed.
                </p>
                <pre style={{
                  marginTop: 6, fontSize: 11, color: 'var(--ink2)', background: 'var(--surface)',
                  border: '1px solid var(--line)', borderRadius: 6, padding: 10, overflowX: 'auto',
                }}>{all.map((h) => `row ${h.rank - 1}  ${h.words.join('  ')}`).join('\n')}</pre>
              </>
            ) : null}
          </div>
        ) : (
          <div className="col" style={{ gap: 0, marginTop: 6 }}>
            {heisman.map((h) => (
              <div key={h.rank} className="row"
                style={{ gap: 10, alignItems: 'baseline', borderTop: '1px solid var(--line)', padding: '5px 0' }}>
                <span className="num" style={{ color: 'var(--accent)', width: 20 }}>{h.rank}</span>
                <strong style={{ color: 'var(--ink)' }}>{h.first} {h.last}</strong>
                <Meta size={9}>{h.position}</Meta>
                <span className="num" style={{ color: 'var(--ink3)' }}>{h.overall}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

/**
 * Finding the poll by pointing at a rank you can read off the game.
 *
 * Sweeping the team table for the shape of a ranking found nothing in a real
 * save, and that is a finding rather than a failure: a poll leaves the unranked
 * teams holding whatever they held last week, so it is not the clean
 * permutation the shape test was looking for.
 *
 * One number settles it. You know where the game ranks you; a field where your
 * team holds that number, ten other programs hold ten different places, and no
 * team holds its own row number, is the poll. Name a second school and it is
 * beyond argument.
 */
/** The three the game's own screen switches between. */
const POLLS = ['CFP', 'MEDIA', 'COACHES'] as const

/**
 * The last sweep, kept for as long as the app runs.
 *
 * Not state, because it must survive the screen being thrown away and rebuilt —
 * which is exactly what leaving the tab does, and what made a finished search
 * run again.
 */
let lastFound: { for: string | null; found: PollCandidate[] } = { for: null, found: [] }

function PollFinder({ me, path, onApplied }: {
  me: string | null; path: string | null; onApplied: () => void
}) {
  // Kept in the browser's own storage: leaving this screen used to throw the
  // search away, and a screen that forgets what you just typed reads as one
  // that forgot what you just chose.
  const [rank, setRank] = useState(() => localStorage.getItem('dcc.poll.rank') ?? '')
  const [other, setOther] = useState(() => localStorage.getItem('dcc.poll.other') ?? '')
  const [otherRank, setOtherRank] = useState(() => localStorage.getItem('dcc.poll.otherRank') ?? '')
  // The result outlives the screen: it belongs to the save, and re-deriving it
  // costs a minute. Cleared when the save changes, which is the only thing that
  // can make it wrong.
  const [found, setFound] = useState<PollCandidate[] | null>(() => lastFound.for === path ? lastFound.found : null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<SavedPollView[]>([])

  const [rankFields, setRankFields] = useState<string[]>([])

  useEffect(() => { void window.dcc.savedPolls().then((r) => setSaved(r.polls)) }, [])

  // Coming back to the screen picks up where it was left. What it must not do
  // is search again: the sweep is the most expensive thing DCC does, and there
  // is nothing to find once all three polls are named. Searching on the way in
  // meant every visit to this tab froze the window for a minute to rediscover
  // what was already kept.
  useEffect(() => {
    if (!path || !me || !rank.trim() || found || busy) return
    if (POLLS.every((n) => saved.some((p) => p.name === n))) return
    void look()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, me, saved])

  // What the game's own schema says a team carries, so the number of orderings
  // a search turns up can be recognised rather than wondered at.
  useEffect(() => {
    void window.dcc.schemaStore('TeamStore', 424).then((r) => {
      if (r.ok) setRankFields(r.members.filter((m) => /Rank$/.test(m.n) && /Poll/.test(m.n)).map((m) => m.n))
    })
  }, [])

  const look = async () => {
    if (!path || !me || !rank.trim()) return
    setBusy(true); setNote(null); setFound(null)
    localStorage.setItem('dcc.poll.rank', rank)
    localStorage.setItem('dcc.poll.other', other)
    localStorage.setItem('dcc.poll.otherRank', otherRank)
    const known = [{ team: me, rank: Number(rank) }]
    if (other.trim() && otherRank.trim()) known.push({ team: other.trim(), rank: Number(otherRank) })
    const res = await window.dcc.findPoll(path, known)
    setBusy(false)
    if (!res.ok) { setNote(res.message); return }
    setFound(res.found)
    lastFound = { for: path, found: res.found }
    if (!res.found.length) {
      setNote('nothing in the team table holds those ranks — check the numbers, or the poll is somewhere else')
    }
  }

  const use = async (c: PollCandidate, name: string) => {
    const res = await window.dcc.usePoll({ name, at: c.at, width: c.width, base: c.base })
    setSaved(res.polls)
    // Applied here rather than asking for a step that does not exist: there is
    // no "read the roster" button once the roster has been read, and telling
    // someone to press one is how a working setting looked like a lost one.
    onApplied()
    setNote(`${name} kept — it is in League now`)
  }

  const forget = async (name: string) => {
    const res = await window.dcc.forgetPoll(name)
    setSaved(res.polls)
  }

  if (!me) return <Meta size={9} color="var(--ink4)">PICK YOUR TEAM FIRST</Meta>

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
      <Kicker>Point at a rank you know</Kicker>
      <p className="body-serif" style={{ marginTop: 7 }}>
        Open the game and read where it ranks you. Put that number in and DCC finds the fields
        holding it. Compare each against the game's own screen and say which is which; all three
        are kept, and League switches between them the way the game does.
      </p>
      {/* The schema settles what to expect. Nine rank fields on a team, so a
          search turning up nine orderings is the right answer rather than
          noise — and three of them are the ones the game's screen shows. */}
      {rankFields.length ? (
        <div style={{ marginTop: 8 }}>
          <Meta size={9} color="var(--ink4)">
            THE SCHEMA SAYS A TEAM CARRIES {rankFields.length}: {rankFields.join(' · ')}
          </Meta>
        </div>
      ) : null}
      <div className="row" style={{ gap: 8, marginTop: 9, alignItems: 'center', flexWrap: 'wrap' }}>
        <Meta size={9}>{me.toUpperCase()} IS NO.</Meta>
        <span style={{ width: 70 }}>
          <Input value={rank} placeholder="1" inputMode="numeric"
            onChange={(e) => setRank(e.target.value.replace(/[^0-9]/g, ''))} />
        </span>
        <Meta size={9}>AND</Meta>
        <span style={{ width: 170 }}>
          <Input value={other} placeholder="another school (optional)"
            onChange={(e) => setOther(e.target.value)} />
        </span>
        <Meta size={9}>IS NO.</Meta>
        <span style={{ width: 70 }}>
          <Input value={otherRank} placeholder="2" inputMode="numeric"
            onChange={(e) => setOtherRank(e.target.value.replace(/[^0-9]/g, ''))} />
        </span>
        <Btn variant="primary" disabled={busy || !rank.trim() || !path} onClick={() => void look()}>
          {busy ? 'Looking…' : 'Find it'}
        </Btn>
      </div>

      {found?.length ? (
        <div className="col" style={{ gap: 8, marginTop: 12 }}>
          {found.map((c) => (
            <div key={`${c.at}-${c.width}`} style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
              <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
                <Meta size={9} color="var(--good)">{c.ranked} RANKED</Meta>
                <Meta size={9} color="var(--ink4)">
                  BIT {c.at} · {c.width} WIDE{c.base === 0 ? ' · COUNTS FROM ZERO' : ''}
                </Meta>
                <span className="row" style={{ gap: 6, marginLeft: 'auto' }}>
                  <Meta size={9} color="var(--ink4)">THIS IS THE</Meta>
                  {POLLS.map((name) => (
                    <button key={name} className="gs-close"
                      style={saved.some((p) => p.name === name && p.at === c.at && p.width === c.width)
                        ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                      onClick={() => void use(c, name)}>{name}</button>
                  ))}
                </span>
              </div>
              <div style={{ marginTop: 5, fontSize: 12, color: 'var(--ink2)' }}>
                {c.top.map((t) => `${t.rank}. ${t.name}`).join('  ·  ')}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {saved.length ? (
        <div className="row" style={{ gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Meta size={9}>KEPT</Meta>
          {saved.map((p) => (
            <button key={p.name} className="gs-close" onClick={() => void forget(p.name)}
              title="Forget this one">
              {p.name} ✕
            </button>
          ))}
        </div>
      ) : null}
      {note ? <div style={{ marginTop: 9 }}><Meta size={9}>{note.toUpperCase()}</Meta></div> : null}
    </div>
  )
}
