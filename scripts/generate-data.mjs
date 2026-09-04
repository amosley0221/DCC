#!/usr/bin/env node
/**
 * Deterministic generator for the DCC seed dynasty.
 *
 * Both apps read the same generated JSON so the phone and the desktop always
 * show the identical universe. Regenerate with `npm run gen:data`; the output
 * is committed so a build never depends on running this.
 *
 * No licensed marks, real schools or real player likenesses: every school is a
 * fictional monogram and every player name is assembled from generic parts.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../shared/data/dcc-data.json')
const SEED = 0x0c27f00d

/** mulberry32 — small, fast, and stable across runs. */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const r = rng(SEED)
const pick = (xs) => xs[Math.floor(r() * xs.length)]
const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1))
/** Triangular-ish draw so ratings cluster in the middle instead of going flat. */
const bell = (lo, hi) => {
  const n = (r() + r() + r()) / 3
  return Math.round(lo + n * (hi - lo))
}

const SCHOOLS = [
  ['you', 'Your Program', 'YOU', 'Meridian', 'Gulf Atlantic'],
  ['southern', 'Southern', 'SOU', 'Southern', 'Gulf Atlantic'],
  ['northgate', 'Northgate', 'NGT', 'Northgate', 'Northern Belt'],
  ['lakeside', 'Lakeside', 'LKS', 'Lakeside', 'Northern Belt'],
  ['cascade', 'Cascade', 'CAS', 'Cascade', 'Pacific Rim'],
  ['verdant', 'Verdant State', 'VER', 'Verdant', 'Heartland'],
  ['ironwood', 'Ironwood', 'IRN', 'Ironwood', 'Northern Belt'],
  ['harbor', 'Harbor', 'HBR', 'Harbor', 'Atlantic Shore'],
  ['granite', 'Granite', 'GRA', 'Granite', 'Northern Belt'],
  ['copper', 'Copper Valley', 'CPV', 'Copper', 'Desert League'],
  ['prairie', 'Prairie', 'PRA', 'Prairie', 'Heartland'],
  ['delta', 'Delta', 'DLT', 'Delta', 'Gulf Atlantic'],
  ['summit', 'Summit', 'SMT', 'Summit', 'Pacific Rim'],
  ['coastal', 'Coastal', 'CST', 'Coastal', 'Atlantic Shore'],
  ['redstone', 'Redstone', 'RED', 'Redstone', 'Desert League'],
  ['alder', 'Alder', 'ALD', 'Alder', 'Pacific Rim'],
  ['bayou', 'Bayou', 'BAY', 'Bayou', 'Gulf Atlantic'],
  ['pinehurst', 'Pinehurst', 'PIN', 'Pinehurst', 'Atlantic Shore'],
  ['fairfield', 'Fairfield', 'FFD', 'Fairfield', 'Heartland'],
  ['sierra', 'Sierra', 'SIE', 'Sierra', 'Pacific Rim'],
  ['longview', 'Longview', 'LGV', 'Longview', 'Heartland'],
  ['ridgeway', 'Ridgeway', 'RDG', 'Ridgeway', 'Atlantic Shore'],
  ['marston', 'Marston', 'MRS', 'Marston', 'Desert League'],
  ['kingsport', 'Kingsport', 'KGP', 'Kingsport', 'Gulf Atlantic'],
]

const FIRST = ['Marcus','Dashawn','Jalen','Caleb','Tori','Rey','Eli','Bo','Trey','Sam','Dev','Kobe','Zion','Owen','Amir','Miles','Tate','Jace','Rome','Nash','Cade','Kai','Isaiah','Beau','Malik','Rowan','Silas','Emory','Jonah','Deacon','Ellis','Grady','Hollis','Ivan','Judah','Knox','Levi','Micah','Nolan','Otis','Pierce','Quincy','Reese','Sawyer','Tobias','Uriah','Vance','Wilder','Xavier','Yusuf','Zeke','Arlo','Bryce','Colt','Dane','Eero','Ford','Gage','Hank','Isaac']
const LAST  = ['Vale','Okafor','Pryor','Muzz','Hale','Amos','Vance','Bell','Grant','Pike','Tran','Solomon','Cole','Ford','Navarro','Barlow','Ashe','Whitlow','Reyes','Duke','Kessler','Marsh','Nolan','Oduya','Pace','Quill','Rhodes','Salter','Thorne','Udell','Vega','Wren','Yates','Zane','Abbott','Boone','Cardoza','Dunbar','Ellery','Faulk','Granger','Hobbs','Iverson','Jessup','Keeler','Lomax','Merritt','Nakos','Oyelaran','Prentiss','Quiroz','Rasmussen','Stapleton','Tovar','Ulmer','Voss','Waddell','Yancey','Zamora','Ackerley']

const POSITIONS = ['QB','RB','WR','TE','OT','IOL','EDGE','DT','LB','CB','S','K','P']
/** Recruiting pools skew heavily to skill and front-seven bodies; specialists are rare. */
const POS_WEIGHTS = { QB: 5, RB: 8, WR: 15, TE: 5, OT: 8, IOL: 8, EDGE: 10, DT: 8, LB: 12, CB: 11, S: 8, K: 1, P: 1 }
const POS_BAG = Object.entries(POS_WEIGHTS).flatMap(([p, w]) => Array(w).fill(p))
const ARCHETYPES = {
  QB: ['Field General','Improviser','Pocket Passer','Dual Threat'],
  RB: ['Power Back','Elusive Back','Receiving Back','Bruiser'],
  WR: ['Deep Threat','Route Runner','Physical','Slot'],
  TE: ['Vertical Threat','Possession','Blocking'],
  OT: ['Pass Protector','Agile','Power'],
  IOL: ['Pass Protector','Power','Agile'],
  EDGE: ['Speed Rusher','Power Rusher','Run Stopper'],
  DT: ['Run Stopper','Power Rusher','Speed Rusher'],
  LB: ['Field General','Run Support','Pass Coverage','Speed Rusher'],
  CB: ['Man to Man','Zone','Slot'],
  S: ['Zone','Hybrid','Run Support'],
  K: ['Accurate','Power'],
  P: ['Accurate','Power'],
}
/** Roster shape for an 85-man scholarship squad. */
const ROSTER_SHAPE = { QB: 5, RB: 7, WR: 12, TE: 5, OT: 7, IOL: 8, EDGE: 8, DT: 7, LB: 9, CB: 9, S: 6, K: 1, P: 1 }
const CLASSES = ['FR', 'FR (RS)', 'SO', 'JR', 'SR']
const DEV = ['Normal', 'Normal', 'Normal', 'Impact', 'Impact', 'Star', 'Elite']
const STAGES = ['TOP 8', 'TOP 5', 'TOP 3', 'SOFT COMMIT', 'COMMITTED', 'HARD COMMIT', 'SIGNED', 'DECOMMITTED']
const DEALBREAKERS = ['Championship Contender', 'Immediate Playing Time', 'NFL Pipeline', 'Close To Home', 'Scheme Fit']

const STATES = ['TX','FL','CA','GA','OH','PA','AL','LA','NC','SC','TN','VA','MI','IL','NJ','AZ','WA','OK','MS','MD']
const TOWNS = {
  TX: ['East Texas','Longview','Katy','Odessa','Tyler','Waco'],
  FL: ['Lake Mary','Naples','Ocala','Sanford','Pahokee','Venice'],
  CA: ['Southern California','Bellflower','Fresno','Modesto','Chino','Norwalk'],
  GA: ['Metro Atlanta','Valdosta','Macon','Rome','Albany','Warner'],
  OH: ['Erie','Massillon','Dayton','Akron','Lima','Toledo'],
  PA: ['Pennsylvania','Aliquippa','Erie','Scranton','Reading','Altoona'],
  AL: ['Mobile','Prattville','Hoover','Dothan','Selma','Gadsden'],
  LA: ['Bayou','Monroe','Ruston','Houma','Kenner','Slidell'],
  NC: ['North Carolina','Rocky Mount','Wilson','Shelby','Kinston','Hickory'],
  SC: ['Gaffney','Sumter','Florence','Rock Hill','Conway','Easley'],
  TN: ['Nashville','Memphis','Knoxville','Jackson','Cleveland','Cookeville'],
  VA: ['Hampton','Danville','Salem','Suffolk','Lynchburg','Bristol'],
  MI: ['Cass Tech','Muskegon','Saginaw','Flint','Belleville','Warren'],
  IL: ['Chicago Heights','Bolingbrook','Rockford','Peoria','Joliet','Decatur'],
  NJ: ['Paramus','Camden','Trenton','Union','Bergen','Vineland'],
  AZ: ['Chandler','Gilbert','Tucson','Peoria','Mesa','Yuma'],
  WA: ['Kennewick','Spokane','Tacoma','Everett','Yakima','Renton'],
  OK: ['Jenks','Bixby','Norman','Lawton','Muskogee','Edmond'],
  MS: ['Starkville','Meridian','Gulfport','Oxford','Brookhaven','Picayune'],
  MD: ['Baltimore','Bowie','Landover','Frederick','Salisbury','Hagerstown'],
}
const PIPELINES = SCHOOLS.map((s) => s[3])

let uid = 0
const id = (p) => `${p}${(++uid).toString(36)}`

function personName(used) {
  for (let i = 0; i < 40; i++) {
    const n = `${pick(FIRST)} ${pick(LAST)}`
    if (!used.has(n)) { used.add(n); return n }
  }
  const n = `${pick(FIRST)} ${pick(LAST)} ${used.size}`
  used.add(n)
  return n
}

const heightFor = (pos) => {
  const base = { QB: 74, RB: 70, WR: 73, TE: 77, OT: 78, IOL: 76, EDGE: 76, DT: 75, LB: 74, CB: 71, S: 72, K: 72, P: 73 }[pos]
  const inches = base + int(-2, 2)
  return `${Math.floor(inches / 12)}'${inches % 12}"`
}
const weightFor = (pos) => ({ QB: 215, RB: 205, WR: 190, TE: 250, OT: 310, IOL: 305, EDGE: 255, DT: 300, LB: 235, CB: 185, S: 200, K: 185, P: 195 }[pos]) + int(-12, 14)

// ── teams ─────────────────────────────────────────────────────────────────────
const teams = SCHOOLS.map(([tid, name, abbr, pipeline, conference], i) => ({
  id: tid,
  name,
  abbr,
  monogram: abbr.slice(0, 2),
  conference,
  pipeline,
  isUser: tid === 'you',
  tone: i % 6,
  rank: 0,
  wins: 0,
  losses: 0,
  prestige: tid === 'you' ? 7 : int(3, 9),
  trend: pick(['up', 'down', 'flat']),
}))
const byId = Object.fromEntries(teams.map((t) => [t.id, t]))

// Records first, then rank by win pct with prestige as the tiebreak.
for (const t of teams) {
  const strength = t.prestige / 10
  t.wins = Math.max(0, Math.min(9, Math.round(9 * (strength * 0.7 + r() * 0.45))))
  t.losses = 9 - t.wins
}
byId.you.wins = 7; byId.you.losses = 2
;[...teams]
  .sort((a, b) => b.wins - a.wins || b.prestige - a.prestige)
  .forEach((t, i) => { t.rank = i + 1 })

// ── rosters ───────────────────────────────────────────────────────────────────
const usedNames = new Set()
const players = []
for (const t of teams) {
  const ceiling = 62 + t.prestige * 3            // program prestige sets the ratings band
  for (const [pos, count] of Object.entries(ROSTER_SHAPE)) {
    for (let i = 0; i < count; i++) {
      const starter = i === 0
      const ovr = Math.max(58, Math.min(99, bell(ceiling - 24, ceiling + (starter ? 8 : 2))))
      players.push({
        id: id('p'),
        name: personName(usedNames),
        teamId: t.id,
        pos,
        ovr,
        depth: i + 1,
        year: pick(CLASSES),
        dev: ovr >= 88 ? pick(['Star', 'Elite', 'Impact']) : pick(DEV),
        archetype: pick(ARCHETYPES[pos]),
        height: heightFor(pos),
        weight: weightFor(pos),
        redshirt: false,
        hometown: (() => { const st = pick(STATES); return `${pick(TOWNS[st])}, ${st}` })(),
        dealbreaker: pick(DEALBREAKERS),
        nil: Math.round((ovr - 55) * 1.4) * 500,
      })
    }
  }
}
// Depth order should follow OVR inside each position group.
for (const t of teams) {
  for (const pos of POSITIONS) {
    players
      .filter((p) => p.teamId === t.id && p.pos === pos)
      .sort((a, b) => b.ovr - a.ovr)
      .forEach((p, i) => { p.depth = i + 1 })
  }
}

// ── prospects (national pool) ────────────────────────────────────────────────
const POOL = 3200
const prospects = []
for (let i = 0; i < POOL; i++) {
  const natlRank = i + 1
  // No specialist belongs in the top 150 of a national board.
  let pos = pick(POS_BAG)
  while (natlRank <= 150 && (pos === 'K' || pos === 'P')) pos = pick(POS_BAG)
  // Stars fall off with national rank the way a real board does.
  const stars = natlRank <= 32 ? 5 : natlRank <= 300 ? 4 : natlRank <= 1100 ? 3 : natlRank <= 2400 ? 2 : 1
  const revealed = r() < 0.62
  const ovr = Math.max(55, Math.min(92, Math.round(88 - Math.log10(natlRank + 1) * 9 + int(-4, 4))))
  const st = pick(STATES)
  // Their own board: 3–8 schools in the recruit's order.
  const boardSize = pick([3, 3, 5, 5, 8, 8])
  const board = []
  const poolIds = teams.map((t) => t.id)
  while (board.length < boardSize) {
    const c = pick(poolIds)
    if (!board.includes(c)) board.push(c)
  }
  // Roughly a fifth of the pool has the user's program somewhere on their list.
  if (r() < 0.2 && !board.includes('you')) board[int(0, board.length - 1)] = 'you'
  const stage = board.length === 8 ? 'TOP 8' : board.length === 5 ? 'TOP 5' : 'TOP 3'
  const committed = r() < 0.18
  prospects.push({
    id: id('r'),
    name: personName(usedNames),
    pos,
    stars,
    natlRank,
    posRank: 0,
    stateRank: 0,
    ovr,
    ovrRevealed: revealed,
    archetype: pick(ARCHETYPES[pos]),
    height: heightFor(pos),
    weight: weightFor(pos),
    town: pick(TOWNS[st]),
    state: st,
    pipeline: pick(PIPELINES),
    stage: committed ? pick(['SOFT COMMIT', 'COMMITTED', 'HARD COMMIT', 'SIGNED']) : stage,
    commitPoints: Math.max(0, Math.round((92 - ovr) * -3 + 260 + int(-40, 40))),
    nil: Math.round((stars * 9 + int(0, 14))) * 1000,
    topSchools: committed ? [pick(board)] : board,
    watchlist: false,
  })
}
// Position and state ranks derive from national order.
const posCount = {}, stCount = {}
for (const p of prospects) {
  posCount[p.pos] = (posCount[p.pos] || 0) + 1
  stCount[p.state] = (stCount[p.state] || 0) + 1
  p.posRank = posCount[p.pos]
  p.stateRank = stCount[p.state]
}
// Seed the user's board with prospects who actually rate the program.
const seededBoard = prospects.filter((p) => p.topSchools.includes('you')).slice(0, 24).map((p) => p.id)

// ── schedule (every team, 12 weeks) ──────────────────────────────────────────
const CURRENT_WEEK = 9
const schedule = []
for (const t of teams) {
  const opponents = teams.filter((o) => o.id !== t.id)
  for (let wk = 1; wk <= 12; wk++) {
    const opp = opponents[(wk * 3 + t.rank) % opponents.length]
    const played = wk < CURRENT_WEEK
    const home = wk % 2 === 0
    const win = played ? t.prestige + (home ? 1 : 0) + int(-4, 4) > opp.prestige : null
    schedule.push({
      id: id('g'),
      teamId: t.id,
      week: wk,
      opponentId: opp.id,
      home,
      ranked: opp.rank <= 25,
      rivalry: (t.rank + opp.rank) % 11 === 0,
      kickoff: pick(['12:00', '15:30', '19:00', '19:30', '20:00']),
      result: played ? (win ? 'W' : 'L') : wk === CURRENT_WEEK ? 'NEXT' : null,
      score: played ? `${int(17, 45)}–${int(6, 34)}` : null,
      storyId: null,
    })
  }
}

// ── wire stories ─────────────────────────────────────────────────────────────
const userRoster = players.filter((p) => p.teamId === 'you').sort((a, b) => b.ovr - a.ovr)
const s = (n) => userRoster[n].name
const stories = [
  {
    id: 'st1', kicker: "Coach's Report", week: 9, time: '06:20',
    headline: `${s(0).split(' ')[1]} outplays QB1 in closed scrimmage`,
    body: `Redshirt freshman ${s(0)} went 14-of-16 against the first-team defense Thursday. Staffers say the huddle noticed. Key ${s(3).split(' ')[1]} pressed all afternoon and threw two picks trying to answer.`,
    effect: { label: `${s(0).split(' ')[1]} +2 Confidence · ${s(3).split(' ')[1]} −1 Morale`, targets: [{ playerId: userRoster[0].id, stat: 'confidence', delta: 2 }, { playerId: userRoster[3].id, stat: 'morale', delta: -1 }] },
    status: 'open', media: [],
  },
  {
    id: 'st2', kicker: 'Recruiting', week: 9, time: '07:02',
    headline: `${prospects[4].name.split(' ')[1]} trims list to three — you made the cut`,
    body: `Four-star ${prospects[4].pos} ${prospects[4].name} named his finalists and you made the cut. Their new coordinator has been in the house twice this month, and it is landing with his family.`,
    effect: null, status: 'open', media: [],
  },
  {
    id: 'st3', kicker: 'Staff', week: 9, time: '09:41',
    headline: 'Beat writer: OL coach taking calls',
    body: 'Quiet interest from two programs. Nothing formal yet, but his agent has been visible.',
    effect: null, status: 'open', media: [],
  },
  {
    id: 'st4', kicker: 'Locker Room', week: 8, time: '18:12',
    headline: `${s(6).split(' ')[1]} cleared, expected back for the rivalry week`,
    body: `Full participation Wednesday. Training staff signed off. He took first-team reps in the walkthrough and looked like himself in the change-of-direction work.`,
    effect: { label: `${s(6).split(' ')[1]} +3 Health · +1 Confidence`, targets: [{ playerId: userRoster[6].id, stat: 'health', delta: 3 }] },
    status: 'open', media: [],
  },
  {
    id: 'st5', kicker: 'Portal', week: 8, time: '11:35',
    headline: 'Two mid-major starters enter, both list you',
    body: 'A rotational edge and a two-year starting corner hit the portal Monday. Both have you in their early cut.',
    effect: null, status: 'open', media: [],
  },
  {
    id: 'st6', kicker: 'Game Recap', week: 8, time: '22:50',
    headline: `Defense holds late, ${byId.you.name.toLowerCase()} escapes on the road`,
    body: `Fourth-down stop with 1:12 left. ${s(9)} had two of the three sacks. Offense punted on four of six second-half drives and it nearly cost the night.`,
    effect: null, status: 'open', media: [],
  },
]

// ── coach career ─────────────────────────────────────────────────────────────
const coach = {
  name: 'Head Coach',
  record: { wins: 96, losses: 41 },
  titles: 2,
  drafted: 31,
  timeline: [
    { school: 'Prairie', years: '2019–2022', record: '31–19', note: 'Took over a 3–9 roster' },
    { school: 'Harbor', years: '2023–2025', record: '28–11', note: 'Conference title 2024' },
    { school: 'Your Program', years: '2026–', record: '37–11', note: 'Natl title 2027' },
  ],
  draftPicks: userRoster.slice(0, 9).map((p, i) => ({
    name: p.name, pos: p.pos, round: i < 2 ? 1 : i < 4 ? 2 : int(3, 7), year: 2026 + (i % 3), team: 'NFL',
  })),
  honors: [
    { tag: 'CHAMP', text: 'National Championship — 2027' },
    { tag: 'CHAMP', text: 'National Championship — 2030' },
    { tag: 'AWARD', text: 'Coach of the Year — 2024, 2027' },
    { tag: 'MILE', text: '100th career win — Week 4, 2031' },
    { tag: 'MILE', text: '30th player drafted — 2031' },
  ],
}

// ── national ─────────────────────────────────────────────────────────────────
const national = {
  leaders: [
    { cat: 'PASSING YDS', rows: players.filter((p) => p.pos === 'QB').sort((a, b) => b.ovr - a.ovr).slice(0, 5).map((p, i) => ({ name: p.name, team: byId[p.teamId].name, value: `${3100 - i * 180}` })) },
    { cat: 'RUSHING YDS', rows: players.filter((p) => p.pos === 'RB').sort((a, b) => b.ovr - a.ovr).slice(0, 5).map((p, i) => ({ name: p.name, team: byId[p.teamId].name, value: `${1580 - i * 90}` })) },
    { cat: 'RECEIVING YDS', rows: players.filter((p) => p.pos === 'WR').sort((a, b) => b.ovr - a.ovr).slice(0, 5).map((p, i) => ({ name: p.name, team: byId[p.teamId].name, value: `${1340 - i * 75}` })) },
    { cat: 'SACKS', rows: players.filter((p) => p.pos === 'EDGE').sort((a, b) => b.ovr - a.ovr).slice(0, 5).map((p, i) => ({ name: p.name, team: byId[p.teamId].name, value: `${14.5 - i * 1.5}` })) },
  ],
  scores: schedule
    .filter((g) => g.week === CURRENT_WEEK - 1 && g.home)
    .slice(0, 8)
    .map((g) => ({ home: byId[g.teamId].name, away: byId[g.opponentId].name, score: g.score, final: true })),
}

// ── devices / cloud save ─────────────────────────────────────────────────────
const devices = {
  holder: 'gaming-pc',
  machines: [
    { id: 'gaming-pc', name: 'Gaming PC', role: 'Primary writer', hash: 'a41f9c2e', lastUpload: '4 min ago', online: true },
    { id: 'rog-ally', name: 'ROG Ally', role: 'Handheld', hash: 'a41f9c2e', lastUpload: '2 h ago', online: true },
    { id: 'den-server', name: 'Den Server', role: 'Relay + store', hash: 'a41f9c2e', lastUpload: '4 min ago', online: true },
  ],
  history: [
    { version: 'v418', when: '4 min ago', size: '18.2 MB', machine: 'Gaming PC' },
    { version: 'v417', when: '2 h ago', size: '18.2 MB', machine: 'ROG Ally' },
    { version: 'v416', when: 'Yesterday 23:10', size: '18.1 MB', machine: 'Gaming PC' },
    { version: 'v415', when: 'Yesterday 20:44', size: '18.1 MB', machine: 'Gaming PC' },
  ],
}

const data = {
  meta: { seed: SEED, generated: 'deterministic', season: 2031, currentWeek: CURRENT_WEEK, userTeamId: 'you', rosterLimit: 85 },
  teams, players, prospects, schedule, stories, coach, national, devices,
  seededBoard,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(data))
const kb = (JSON.stringify(data).length / 1024).toFixed(0)
console.log(`wrote ${OUT} — ${teams.length} teams, ${players.length} players, ${prospects.length} prospects, ${schedule.length} games (${kb} KB)`)
