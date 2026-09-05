import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { useSave } from '../saveStore'
import { Btn, Card, Empty, Kicker, Meta, SectionHeader, Track } from '../ui'

/**
 * Dissects the dynasty save so the format can be worked out. Nothing here
 * writes to the save; the only file it creates is a copy and a report.
 *
 * The analysis itself lives in SaveProvider rather than here, so leaving the
 * section and coming back does not throw it away.
 */
export default function Save() {
  const { state, dispatch } = useStore()
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
    const res = await window.dcc.roster(from)
    patch({ rosterBusy: false })
    if (res.ok) {
      patch({ roster: { count: res.count, ratingNames: res.ratingNames, unverifiedPairs: res.unverifiedPairs, schools: res.schools, coaches: res.coaches, stores: res.stores, games: res.games, players: res.players } })
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
    dispatch({ type: 'log', line: { text: `analysed ${chosen}`, kind: 'info' } })

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

        {busy ? <Card className="card-pad"><Meta color="var(--warn)">ANALYSING…</Meta></Card> : null}
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
                    could be labelled the other way round — within each, the two behave almost
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
