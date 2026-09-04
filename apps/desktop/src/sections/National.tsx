import { useState } from 'react'
import { useDynasty } from '../store'
import { Card, Kicker, Meta, SchoolBadge, SectionHeader, Tab } from '../ui'

const TABS = ['TOP STORIES', 'SCORES', 'LEADERS', 'STANDINGS'] as const

export default function National() {
  const { dynasty, d } = useDynasty()
  const [tab, setTab] = useState<(typeof TABS)[number]>('TOP STORIES')

  return (
    <>
      <SectionHeader
        title="National"
        sub={<Meta>SEASON {dynasty.meta.season} · {dynasty.teams.length} PROGRAMS</Meta>}
        right={
          <div className="subtabs">
            {TABS.map((t) => <Tab key={t} on={tab === t} onClick={() => setTab(t)}>{t}</Tab>)}
          </div>
        }
      />

      {tab === 'TOP STORIES' ? (
        <div className="col" style={{ gap: 10, maxWidth: 720 }}>
          {d.stories.slice(0, 4).map((s) => (
            <Card key={s.id} className="card-pad">
              <Kicker>{s.kicker}</Kicker>
              <h2 className="headline" style={{ marginTop: 5 }}>{s.headline}</h2>
              <p className="body-serif" style={{ marginTop: 6, marginBottom: 0 }}>{s.body}</p>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === 'SCORES' ? (
        <div className="grid-2" style={{ maxWidth: 900 }}>
          {dynasty.national.scores.map((g, i) => (
            <Card key={i} className="card-pad">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="row-title">{g.away}</span>
                <span className="num" style={{ color: 'var(--ink)' }}>{g.score?.split('–')[1]}</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', marginTop: 5 }}>
                <span className="row-title">{g.home}</span>
                <span className="num" style={{ color: 'var(--ink)' }}>{g.score?.split('–')[0]}</span>
              </div>
              <Meta size={9}>{g.final ? 'FINAL' : 'IN PROGRESS'}</Meta>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === 'LEADERS' ? (
        <div className="grid-2" style={{ maxWidth: 980 }}>
          {dynasty.national.leaders.map((l) => (
            <Card key={l.cat} className="card-pad">
              <Kicker>{l.cat}</Kicker>
              <div className="col" style={{ gap: 6, marginTop: 9 }}>
                {l.rows.map((row, i) => (
                  <div key={row.name} className="row" style={{ gap: 10 }}>
                    <span className="num" style={{ width: 16, color: 'var(--ink4)', fontSize: 11 }}>{i + 1}</span>
                    <span className="row-title" style={{ flex: 1 }}>{row.name}</span>
                    <Meta size={9.5}>{row.team}</Meta>
                    <span className="num" style={{ color: 'var(--ink)', fontWeight: 600, minWidth: 46, textAlign: 'right' }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === 'STANDINGS' ? (
        <Card style={{ maxWidth: 720, overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr><th style={{ width: 46 }}>Rank</th><th>School</th><th>Conference</th><th style={{ width: 70 }}>Record</th><th style={{ width: 60 }}>Trend</th></tr>
            </thead>
            <tbody>
              {dynasty.teams.slice().sort((a, b) => a.rank - b.rank).map((t) => (
                <tr key={t.id} aria-selected={t.isUser}>
                  <td className="num" style={{ color: t.isUser ? 'var(--accent)' : 'var(--ink3)' }}>{t.rank}</td>
                  <td>
                    <span className="row" style={{ gap: 8 }}>
                      <SchoolBadge teamId={t.id} size={20} />
                      <span className="row-title" style={{ color: 'var(--ink)' }}>{t.name}</span>
                      {t.isUser ? <Meta size={9} color="var(--accent)">YOU</Meta> : null}
                    </span>
                  </td>
                  <td><Meta size={10}>{t.conference}</Meta></td>
                  <td className="num">{t.wins}–{t.losses}</td>
                  <td style={{ color: t.trend === 'up' ? 'var(--good)' : t.trend === 'down' ? 'var(--accent)' : 'var(--ink4)' }}>
                    {t.trend === 'up' ? '▲' : t.trend === 'down' ? '▼' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </>
  )
}
