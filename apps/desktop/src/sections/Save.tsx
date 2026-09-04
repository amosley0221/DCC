import { useState } from 'react'
import { useStore } from '../store'
import { Btn, Card, Empty, Kicker, Meta, SectionHeader, Track } from '../ui'
import type { SaveReport, SaveDiff } from '../../electron/saveAnalysis'

/**
 * Dissects the dynasty save so the format can be worked out. Nothing here
 * writes to the save; the only file it creates is a copy and a report.
 */
export default function Save() {
  const { dispatch } = useStore()
  const [path, setPath] = useState<string | null>(null)
  const [report, setReport] = useState<SaveReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backup, setBackup] = useState<string | null>(null)
  const [diff, setDiff] = useState<SaveDiff | null>(null)
  const [diffing, setDiffing] = useState(false)

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

  const pick = async () => {
    const chosen = await window.dcc.pickSave()
    if (!chosen) return
    setPath(chosen)
    setReport(null)
    setError(null)
    setBusy(true)
    const res = await window.dcc.analyzeSave(chosen)
    setBusy(false)
    if (res.ok) {
      setReport(res.report)
      dispatch({ type: 'log', line: { text: `analysed ${chosen}`, kind: 'info' } })
    } else setError(res.message)
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

        {!path && !busy ? (
          <Card className="card-pad"><Empty>choose your DYNASTY-*.sav to begin</Empty></Card>
        ) : null}

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
