"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// electron/saveWrite.ts
var saveWrite_exports = {};
__export(saveWrite_exports, {
  KICKOFF_SLOTS: () => KICKOFF_SLOTS,
  applyDepthEdits: () => applyDepthEdits,
  applyGameEdits: () => applyGameEdits,
  applyPlayerEdits: () => applyPlayerEdits,
  backupPath: () => backupPath,
  checkEdits: () => checkEdits,
  checkPlayerEdits: () => checkPlayerEdits,
  packContainer: () => packContainer,
  readContainer: () => readContainer,
  readGameConditions: () => readGameConditions,
  readPlayerNumbers: () => readPlayerNumbers,
  writeDepthEdits: () => writeDepthEdits,
  writeGameEdits: () => writeGameEdits,
  writePlayerEdits: () => writePlayerEdits
});
module.exports = __toCommonJS(saveWrite_exports);
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var import_node_zlib = require("node:zlib");

// electron/saveAnalysis.ts
var ZSTD_DICT_MAGIC = Buffer.from([55, 164, 48, 236]);
var ZSTD_FRAME_MAGIC = Buffer.from([40, 181, 47, 253]);
var NAME_TABLE = 16010856;
var NAME_STRIDE = 138;
var NAME_SLOTS = 17470;
var RECORD_STRIDE = 192;
var RECORD_BASE = 65890;
var REDSHIRT_BIT = 1088;
var RECRUIT_BIT = 658;
var HEIGHT_BIT = 650;
var WEIGHT_BIT = 365;
var STARS_BIT = 1241;
var NIL_BIT = 171;
var CLASS_YEAR_BIT = 1189;
var DEV_TRAIT_BIT = 322;
var STATE_BIT = 998;
var PIPELINE_BIT = 1037;
var DEALBREAKER_BIT = 867;
var PITCH_BIT = 1109;
var ARCHETYPE_BIT = 511;
var PLAYER_ID_BIT = 191;
var CLASS_YEARS = ["HighSchool", "JuniorCollege_Sophomore", "JuniorCollege_Junior"];
var DEV_TRAITS = ["Normal", "Impact", "Star", "Elite"];
var HOME_STATES = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "NewHampshire", "NewJersey", "NewMexico", "NewYork", "NorthCarolina", "NorthDakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "RhodeIsland", "SouthCarolina", null, "Tennessee", "Texas", "Utah", null, "Virginia", "Washington", "WestVirginia", "Wisconsin", "Wyoming"];
var PIPELINES = ["Alabama", "Arizona", "Arkansas", "Big Apple", "Big Sky", "Central Florida", "Colorado", "East Texas", "Hawaii", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Metro Atlanta", "Michigan", "Minnesota", "Mississippi", "Missouri", "Nebraska", "Nevada", "New England", "New Mexico", "North Carolina", "North Florida", "North Texas", "Northern California", "Ohio", "Oklahoma", "Pacific Northwest", "Pennsylvania", "South Carolina", "South Florida", "South Georgia", "Southern California", "Southwest Texas", "Tennessee", "Tidewater", "Utah", "West Virginia", "Wisconsin"];
var DEALBREAKERS = [null, null, "Brand Exposure", null, "Championship Contender", "Coach Prestige", null, "Conference Prestige", "Playing Style", "Playing Time", "Pro Potential", null, "Proximity to Home"];
var IDEAL_PITCHES = ["College Experience", "Team Player", "Campus Personality", "It's Game Time", "Prestigious", "Student of the Game", "Hometown Hero", "Prove Yourself", "The Clutch", "TV Time", "Coach's Favorite", "Aspirational", "To the House", "Football Influencer", "Time to Get to Work", "Starter", "Grassroots", "Conference Spotlight", "Sunday Bound", "Work Horse"];
var ARCHETYPES = {
  "QB": ["Field General", null, "Improviser", "Scrambler", "Pure Scrambler"],
  "HB": ["HB Power Blocking", "HB Power Receiving", "HB Elusive Power", null, null, "HB Power Back", "HB Elusive Back", "HB Receiving Back"],
  "FB": [null, null, null, null, "FB Blocking", "FB Utility"],
  "WR": ["Physical Route Runner", "Shifty Route Runner", "Physical Blocker", "Gadget Receiver", "Physical", null, "Deep Threat", "Playmaker"],
  "TE": ["Physical Route Runner", "Possession Blocking", "Possession", null, null, null, "Blocking", "Vertical Threat"],
  "LT": ["Power", "Well Rounded", "Agile", null, null, null, null, "Pass Protector"],
  "LG": [null, null, null, "G Pass Protector", "G Well Rounded", "G Power", "G Agile"],
  "C": [null, null, null, "Pass Protector", "Power", "Well Rounded", "Agile"],
  "RG": [null, null, null, "G Pass Protector", "G Well Rounded", "G Power", "G Agile"],
  "RT": ["Power", "Well Rounded", "Agile", null, null, null, null, "Pass Protector"],
  "LE": ["Power Rusher", "Pure Power", "Run Stopper", null, null, null, null, "Smaller Speed Rusher"],
  "RE": ["Power Rusher", "Pure Power", "Run Stopper", null, null, null, null, "Smaller Speed Rusher"],
  "DT": [null, null, null, "Nose Tackle", "Pure Power", "Speed Rusher", "Power Rusher"],
  "LOLB": ["Power Rusher", "Pass Coverage", "Run Stopper"],
  "MLB": [null, null, null, "Field General", "Pass Coverage", "Run Stopper"],
  "ROLB": ["Power Rusher", "Pass Coverage", "Run Stopper"],
  "CB": ["Zone", "Hybrid Corner", null, null, null, null, "Manto Man", "Slot"],
  "FS": [null, null, "Zone", "Hybrid", "Run Support"],
  "SS": [null, null, "Zone", "Hybrid", "Run Support"],
  "K": [null, null, null, null, null, "KP Accurate", "KP Power"],
  "P": [null, null, null, null, null, "KP Accurate", "KP Power"]
};
var POSITION_BIT = 1010;
var POSITIONS = [
  "QB",
  "HB",
  "FB",
  "WR",
  "TE",
  "LT",
  "LG",
  "C",
  "RG",
  "RT",
  "LE",
  "RE",
  "DT",
  "LOLB",
  "MLB",
  "ROLB",
  "CB",
  "FS",
  "SS",
  "K",
  "P"
];
var OVERALL_BIT = 561;
var TEAM_BIT = 431;
var TEAM_WIDTH = 8;
var RATING_BITS = {
  Speed: 849,
  Acceleration: 504,
  Agility: 490,
  Strength: 824,
  Awareness: 536,
  Carrying: 696,
  "BC Vision": 575,
  "Break Tackle": 586,
  Trucking: 927,
  "Stiff Arm": 817,
  "Change of Direction": 632,
  "Spin Move": 856,
  "Juke Move": 714,
  Catching: 842,
  "Catch in Traffic": 671,
  "Spectacular Catch": 657,
  "Short Route Running": 895,
  "Medium Route Running": 625,
  "Deep Route Running": 294,
  Release: 959,
  Jumping: 721,
  "Throwing Power": 888,
  "Short Throw Accuracy": 799,
  "Medium Throw Accuracy": 785,
  "Deep Throw Accuracy": 778,
  "Throw on the Run": 810,
  "Break Sack": 600,
  "Play Action": 497,
  "Pass Blocking": 543,
  "Pass Block Power": 522,
  "Pass Block Finesse": 568,
  "Run Blocking": 920,
  "Run Block Power": 913,
  "Run Block Finesse": 906,
  "Lead Block": 703,
  "Impact Blocking": 753,
  "Play Recognition": 984,
  Tackling: 831,
  "Hit Power": 689,
  "Block Shedding": 607,
  "Finesse Moves": 593,
  "Power Moves": 938,
  Pursuit: 952,
  "Man Coverage": 618,
  "Zone Coverage": 991,
  Press: 945,
  "Kick/Punt Return": 682,
  "Kicking Power": 735,
  "Kicking Accuracy": 728,
  Stamina: 863,
  Toughness: 874,
  Injury: 746
};
function bits(payload, base, end, w) {
  let v = 0;
  for (let b = end - w + 1; b <= end; b++) {
    v = v << 1 | payload[base + (b >> 3)] >> 7 - (b & 7) & 1;
  }
  return v;
}
function text(payload, off, max) {
  let e = off;
  while (e < off + max && payload[e] >= 32 && payload[e] < 127) e++;
  return payload.subarray(off, e).toString("latin1");
}
function readRoster(payload) {
  const out = [];
  const end = RECORD_BASE * RECORD_STRIDE + NAME_SLOTS * RECORD_STRIDE;
  if (payload.length < Math.max(end, NAME_TABLE + NAME_SLOTS * NAME_STRIDE)) return out;
  for (let i = 0; i < NAME_SLOTS; i++) {
    const n = NAME_TABLE + i * NAME_STRIDE;
    const assetId = text(payload, n + 17, 33);
    if (!/^(Unique|Generic)_/.test(assetId)) continue;
    const first = text(payload, n, 17);
    const last = text(payload, n + 50, 21);
    if (!first && !last) continue;
    const base = (RECORD_BASE + i) * RECORD_STRIDE;
    const ratings = {};
    for (const [name, bit] of Object.entries(RATING_BITS)) ratings[name] = bits(payload, base, bit, 7);
    const team = /^Generic_\d+_P_T(\d+)_/.exec(assetId);
    out.push({
      index: i,
      first,
      last,
      hometown: text(payload, n + 112, 26),
      assetId,
      teamId: team ? team[1] : null,
      position: POSITIONS[bits(payload, base, POSITION_BIT, 5)] ?? "\u2014",
      team: bits(payload, base, TEAM_BIT, TEAM_WIDTH),
      overall: bits(payload, base, OVERALL_BIT, 7),
      redshirt: bits(payload, base, REDSHIRT_BIT, 1) === 1,
      playerId: bits(payload, base, PLAYER_ID_BIT, 14),
      recruitFlag: bits(payload, base, RECRUIT_BIT, 1) === 1,
      heightIn: bits(payload, base, HEIGHT_BIT, 7),
      weightLb: bits(payload, base, WEIGHT_BIT, 8) + 160,
      stars: bits(payload, base, STARS_BIT, 3) + 1,
      nilK: bits(payload, base, NIL_BIT, 9) - 255,
      classYear: CLASS_YEARS[bits(payload, base, CLASS_YEAR_BIT, 2)] ?? null,
      devTrait: DEV_TRAITS[bits(payload, base, DEV_TRAIT_BIT, 2)] ?? null,
      homeState: HOME_STATES[bits(payload, base, STATE_BIT, 6)] ?? null,
      pipeline: PIPELINES[bits(payload, base, PIPELINE_BIT, 6)] ?? null,
      dealbreaker: DEALBREAKERS[bits(payload, base, DEALBREAKER_BIT, 4)] ?? null,
      idealPitch: IDEAL_PITCHES[bits(payload, base, PITCH_BIT, 5)] ?? null,
      archetype: (ARCHETYPES[POSITIONS[bits(payload, base, POSITION_BIT, 5)] ?? ""] ?? [])[bits(payload, base, ARCHETYPE_BIT, 3)] ?? null,
      ratings
    });
  }
  return out;
}
var DEPTH_REF_TAG = 8510;
var DEPTH_SLOT_BYTES = 24;
var DEPTH_SLOT_FIELDS = 6;
var DEPTH_SLOTS_PER_TEAM = 35;
function depthSlotSize(payload, at, rows) {
  if (at < 0 || at + DEPTH_SLOT_BYTES > payload.length) return -1;
  let n = 0;
  let ended = false;
  for (let k = 0; k < DEPTH_SLOT_FIELDS; k++) {
    const o = at + k * 4;
    const tag = payload.readUInt16BE(o);
    const row = payload.readUInt16BE(o + 2);
    if (tag === 0 && row === 0) {
      ended = true;
      continue;
    }
    if (tag !== DEPTH_REF_TAG || ended || !rows(row)) return -1;
    n++;
  }
  return n;
}
function readDepthCharts(payload, rosterRows) {
  const has = (r) => rosterRows.has(r);
  let best = { at: -1, n: 0 };
  let i = 0;
  while (i + DEPTH_SLOT_BYTES <= payload.length) {
    if (depthSlotSize(payload, i, has) > 0) {
      const at = i;
      let n = 0;
      while (depthSlotSize(payload, i, has) > 0) {
        n++;
        i += DEPTH_SLOT_BYTES;
      }
      if (n > best.n) best = { at, n };
    } else i += 1;
  }
  if (best.at < 0 || best.n < DEPTH_SLOTS_PER_TEAM) return null;
  let start = best.at;
  while (depthSlotSize(payload, start - DEPTH_SLOT_BYTES, has) >= 0) start -= DEPTH_SLOT_BYTES;
  let end = start;
  while (depthSlotSize(payload, end, has) >= 0) end += DEPTH_SLOT_BYTES;
  const count = (end - start) / DEPTH_SLOT_BYTES;
  if (count % DEPTH_SLOTS_PER_TEAM !== 0) return null;
  const charts = [];
  for (let block = 0; block < count / DEPTH_SLOTS_PER_TEAM; block++) {
    const slots = [];
    for (let s = 0; s < DEPTH_SLOTS_PER_TEAM; s++) {
      const at = start + (block * DEPTH_SLOTS_PER_TEAM + s) * DEPTH_SLOT_BYTES;
      const rows = [];
      for (let k = 0; k < DEPTH_SLOT_FIELDS; k++) {
        const o = at + k * 4;
        if (payload.readUInt16BE(o) !== DEPTH_REF_TAG) break;
        rows.push(payload.readUInt16BE(o + 2));
      }
      slots.push({ slot: s, rows, offset: at });
    }
    charts.push({ block, slots });
  }
  return charts;
}
function readStores(payload) {
  const marker = Buffer.from("SPBF", "latin1");
  const bsft = Buffer.from("BSFT", "latin1");
  const out = [];
  let i = 0;
  while ((i = payload.indexOf(marker, i)) !== -1) {
    i += 4;
    if (i + 16 > payload.length) break;
    const major = payload.readUInt32BE(i);
    const nameLen = payload.readUInt32BE(i + 12);
    if (major !== 486 || nameLen === 0 || nameLen > 96 || i + 16 + nameLen > payload.length) continue;
    const name = payload.subarray(i + 16, i + 16 + nameLen).toString("latin1");
    if (!/^[A-Za-z0-9_]+$/.test(name)) continue;
    const after = i + 16 + nameLen;
    const at = payload.indexOf(bsft, after);
    if (at < 0 || at > after + 64) continue;
    out.push({
      name,
      offset: i - 4,
      rows: payload.readUInt32BE(at + 16),
      members: payload.readUInt32BE(at + 20)
    });
  }
  return out.sort((a, b) => b.rows - a.rows);
}
var GAME_BITS = {
  kickoff: [578, 11],
  attendance: [589, 19],
  homeScore: [640, 8],
  awayScore: [648, 8],
  temperature: [664, 8],
  homeOT: [676, 7],
  awayOT: [683, 7],
  awayQ1: [690, 7],
  awayQ2: [697, 7],
  homeQ4: [708, 7],
  homeQ3: [715, 7],
  homeQ2: [722, 7],
  homeQ1: [729, 7],
  wind: [736, 5],
  awayQ3: [747, 7],
  awayQ4: [754, 7],
  month: [778, 4],
  weather: [782, 4],
  week: [791, 4],
  day: [795, 5],
  /** 1 for a simulated game, 0 for one the user played; bit 789 is the reverse. */
  simmed: [786, 1],
  userPlayed: [789, 1],
  overtime: [790, 1]
};
function seasonGameTable(payload) {
  const t = storeTable(payload, "SeasonGameStore");
  return t && { data: t.data, rows: t.rows };
}
function storeTable(payload, name) {
  const store = readStores(payload).find((s) => s.name === name);
  if (!store) return null;
  const bsft = payload.indexOf(Buffer.from("BSFT", "latin1"), store.offset);
  if (bsft < 0 || bsft + 28 + store.members * 4 > payload.length) return null;
  const memberBits = [];
  for (let i = 0; i < store.members; i++) memberBits.push(payload.readUInt32BE(bsft + 28 + i * 4));
  return {
    data: bsft + 28 + store.members * 4,
    rows: store.rows,
    rowBytes: payload.readUInt32BE(bsft + 12) * 4,
    memberBits
  };
}

// electron/gameEnums.ts
var WEATHER = [
  "Clear",
  "Overcast",
  "Partly cloudy",
  "Windy",
  "Light rain",
  "Rain",
  "Heavy rain",
  "Light snow",
  "Snow",
  "Heavy snow",
  "Dynamic rain",
  "Dynamic snow",
  "Random"
];

// electron/saveWrite.ts
var LENGTH_AT = 74;
var STREAM_AT = 82;
function readContainer(file) {
  if (file.subarray(0, 8).toString("latin1") !== "FBCHUNKS") return null;
  if (file.length < STREAM_AT + 16) return null;
  const declared = file.readUInt32LE(LENGTH_AT);
  if (declared <= 0 || STREAM_AT + declared > file.length) return null;
  try {
    return { file, payload: (0, import_node_zlib.inflateSync)(file.subarray(STREAM_AT, STREAM_AT + declared)), declared };
  } catch {
    return null;
  }
}
function packContainer(c, payload) {
  const stream = (0, import_node_zlib.deflateSync)(payload, { level: 9 });
  if (STREAM_AT + stream.length > c.file.length) return null;
  const out = Buffer.alloc(c.file.length);
  c.file.copy(out, 0, 0, STREAM_AT);
  out.writeUInt32LE(stream.length, LENGTH_AT);
  stream.copy(out, STREAM_AT);
  return out;
}
var KICKOFF_SLOTS = [720, 750, 810, 840, 900, 960, 1020, 1080, 1110, 1170, 1215, 1260, 1290, 1365];
function readGameConditions(payload, row) {
  const table = seasonGameTable(payload);
  if (!table || row < 0 || row >= table.rows) return null;
  const at = table.data + row * 100;
  const rd = ([bit, w]) => {
    let v = 0;
    for (let b = bit; b < bit + w; b++) v = v << 1 | payload[at + (b >> 3)] >> 7 - (b & 7) & 1;
    return v;
  };
  return {
    kickoff: rd(GAME_BITS.kickoff),
    temperatureF: rd(GAME_BITS.temperature) - 40,
    weather: rd(GAME_BITS.weather),
    windMph: rd(GAME_BITS.wind)
  };
}
function checkEdits(edits, rowCount) {
  const out = [];
  for (const e of edits) {
    if (!Number.isInteger(e.row) || e.row < 0 || e.row >= rowCount) {
      out.push({ row: e.row, field: "row", message: "no such game in this save" });
    }
    if (e.kickoff !== void 0 && (e.kickoff < 0 || e.kickoff > 2047)) {
      out.push({ row: e.row, field: "kickoff", message: "kickoff must be a time of day" });
    }
    if (e.temperatureF !== void 0 && (e.temperatureF < -40 || e.temperatureF > 120)) {
      out.push({ row: e.row, field: "temperature", message: "the game stores -40\xB0F to 120\xB0F" });
    }
    if (e.weather !== void 0 && (e.weather < 0 || e.weather >= WEATHER.length)) {
      out.push({ row: e.row, field: "weather", message: `the Weather field only holds ${WEATHER.join(", ")}` });
    }
    if (e.windMph !== void 0 && (e.windMph < 0 || e.windMph > 25)) {
      out.push({ row: e.row, field: "wind", message: "the game stores 0 to 25 mph" });
    }
  }
  return out;
}
function putBits(buf, at, bit, width, value) {
  for (let i = 0; i < width; i++) {
    const b = bit + i;
    const on = value >> width - 1 - i & 1;
    const o = at + (b >> 3), mask = 1 << 7 - (b & 7);
    if (on) buf[o] |= mask;
    else buf[o] &= ~mask;
  }
}
function applyGameEdits(payload, edits) {
  const table = seasonGameTable(payload);
  if (!table) throw new Error("this save has no game table");
  const next = Buffer.from(payload);
  const touched = /* @__PURE__ */ new Set();
  const fields = [
    ["kickoff", GAME_BITS.kickoff],
    ["temperatureF", GAME_BITS.temperature],
    ["weather", GAME_BITS.weather],
    ["windMph", GAME_BITS.wind]
  ];
  for (const e of edits) {
    const at = table.data + e.row * 100;
    for (const [name, [bit, width]] of fields) {
      const v = e[name];
      if (v === void 0) continue;
      putBits(next, at, bit, width, name === "temperatureF" ? v + 40 : v);
      for (let b = bit; b < bit + width; b++) touched.add(at + (b >> 3));
    }
  }
  return { next, touched };
}
function backupPath(path, now = /* @__PURE__ */ new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
  return (0, import_node_path.join)((0, import_node_path.dirname)(path), `${path.split(/[\\/]/).pop()}.${stamp}.dccbak`);
}
function writeGameEdits(path, edits) {
  if (!edits.length) return { ok: false, message: "nothing to change" };
  const file = (0, import_node_fs.readFileSync)(path);
  const c = readContainer(file);
  if (!c) return { ok: false, message: "this file is not a save DCC can read" };
  const table = seasonGameTable(c.payload);
  if (!table) return { ok: false, message: "this save has no game table" };
  const problems = checkEdits(edits, table.rows);
  if (problems.length) {
    return { ok: false, message: problems.map((p) => `${p.field}: ${p.message}`).join("; ") };
  }
  const { next, touched } = applyGameEdits(c.payload, edits);
  if (next.length !== c.payload.length) return { ok: false, message: "the edit changed the payload size" };
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== c.payload[i] && !touched.has(i)) {
      return { ok: false, message: `refusing to write: byte 0x${i.toString(16)} changed and should not have` };
    }
  }
  const rebuilt = packContainer(c, next);
  if (!rebuilt) return { ok: false, message: "the edited save does not compress small enough to fit its file" };
  const check = readContainer(rebuilt);
  if (!check || !check.payload.equals(next)) {
    return { ok: false, message: "the rebuilt save did not read back identically; nothing was written" };
  }
  const changed = [];
  for (const e of edits) {
    const was = readGameConditions(c.payload, e.row);
    const now = readGameConditions(check.payload, e.row);
    if (!was || !now) return { ok: false, message: `could not read game ${e.row} back` };
    for (const k of ["kickoff", "temperatureF", "weather", "windMph"]) {
      const want = k === "kickoff" ? e.kickoff : k === "temperatureF" ? e.temperatureF : k === "weather" ? e.weather : e.windMph;
      if (want !== void 0 && now[k] !== want) {
        return { ok: false, message: `game ${e.row}: ${k} read back as ${now[k]}, not ${want}; nothing was written` };
      }
      if (want === void 0 && now[k] !== was[k]) {
        return { ok: false, message: `game ${e.row}: ${k} changed without being asked to; nothing was written` };
      }
    }
    if (JSON.stringify(was) !== JSON.stringify(now)) changed.push({ row: e.row, before: was, after: now });
  }
  if (!changed.length) return { ok: false, message: "the save already holds those values" };
  const backup = backupPath(path);
  (0, import_node_fs.copyFileSync)(path, backup);
  const tmp = `${path}.dccnew`;
  try {
    (0, import_node_fs.writeFileSync)(tmp, rebuilt);
    (0, import_node_fs.renameSync)(tmp, path);
  } catch (err) {
    try {
      (0, import_node_fs.unlinkSync)(tmp);
    } catch {
    }
    return { ok: false, message: `could not write the save: ${String(err?.message ?? err)}`, backup };
  }
  return {
    ok: true,
    message: `updated ${changed.length} game${changed.length === 1 ? "" : "s"}`,
    backup,
    changed
  };
}
var RATING_MIN = 0;
var RATING_MAX = 99;
function checkPlayerEdits(edits, playerCount) {
  const out = [];
  for (const e of edits) {
    if (!Number.isInteger(e.index) || e.index < 0 || e.index >= playerCount) {
      out.push({ row: e.index, field: "player", message: "no such player in this save" });
      continue;
    }
    const check = (field, v) => {
      if (v === void 0) return;
      if (!Number.isInteger(v) || v < RATING_MIN || v > RATING_MAX) {
        out.push({ row: e.index, field, message: `must be a whole number from ${RATING_MIN} to ${RATING_MAX}` });
      }
    };
    check("overall", e.overall);
    if (e.nilK !== void 0 && (!Number.isInteger(e.nilK) || e.nilK < -255 || e.nilK > 256)) {
      out.push({ row: e.index, field: "nilK", message: "the field holds -255 to 256 (in thousands)" });
    }
    for (const [name, v] of Object.entries(e.ratings ?? {})) {
      if (!(name in RATING_BITS)) {
        out.push({ row: e.index, field: name, message: "not a rating DCC can place" });
        continue;
      }
      check(name, v);
    }
  }
  return out;
}
var PLAYER_FIELD_WIDTH = 7;
var startOf = (endBit) => endBit - PLAYER_FIELD_WIDTH + 1;
function readPlayerNumbers(payload, index) {
  const at = (RECORD_BASE + index) * RECORD_STRIDE;
  if (at + RECORD_STRIDE > payload.length) return null;
  const rd = (endBit) => {
    let v = 0;
    for (let b = startOf(endBit); b <= endBit; b++) v = v << 1 | payload[at + (b >> 3)] >> 7 - (b & 7) & 1;
    return v;
  };
  const ratings = {};
  for (const [name, bit2] of Object.entries(RATING_BITS)) ratings[name] = rd(bit2);
  const bit = (b, w) => {
    let v = 0;
    for (let i = b; i < b + w; i++) v = v << 1 | payload[at + (i >> 3)] >> 7 - (i & 7) & 1;
    return v;
  };
  return {
    overall: rd(OVERALL_BIT),
    ratings,
    redshirt: bit(REDSHIRT_BIT, 1) === 1,
    nilK: bit(NIL_BIT, 9) - 255
  };
}
function applyPlayerEdits(payload, edits) {
  const next = Buffer.from(payload);
  const touched = /* @__PURE__ */ new Set();
  for (const e of edits) {
    const at = (RECORD_BASE + e.index) * RECORD_STRIDE;
    const write = (endBit, value) => {
      const start = startOf(endBit);
      putBits(next, at, start, PLAYER_FIELD_WIDTH, value);
      for (let b = start; b <= endBit; b++) touched.add(at + (b >> 3));
    };
    if (e.overall !== void 0) write(OVERALL_BIT, e.overall);
    for (const [name, v] of Object.entries(e.ratings ?? {})) {
      const bit = RATING_BITS[name];
      if (bit !== void 0) write(bit, v);
    }
    if (e.redshirt !== void 0) {
      putBits(next, at, REDSHIRT_BIT, 1, e.redshirt ? 1 : 0);
      touched.add(at + (REDSHIRT_BIT >> 3));
    }
    if (e.nilK !== void 0) {
      putBits(next, at, NIL_BIT, 9, e.nilK + 255);
      for (let b = NIL_BIT; b < NIL_BIT + 9; b++) touched.add(at + (b >> 3));
    }
  }
  return { next, touched };
}
function writePlayerEdits(path, edits, playerCount) {
  if (!edits.length) return { ok: false, message: "nothing to change" };
  const file = (0, import_node_fs.readFileSync)(path);
  const c = readContainer(file);
  if (!c) return { ok: false, message: "this file is not a save DCC can read" };
  const problems = checkPlayerEdits(edits, playerCount);
  if (problems.length) return { ok: false, message: problems.map((p) => `${p.field}: ${p.message}`).join("; ") };
  const { next, touched } = applyPlayerEdits(c.payload, edits);
  if (next.length !== c.payload.length) return { ok: false, message: "the edit changed the payload size" };
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== c.payload[i] && !touched.has(i)) {
      return { ok: false, message: `refusing to write: byte 0x${i.toString(16)} changed and should not have` };
    }
  }
  const rebuilt = packContainer(c, next);
  if (!rebuilt) return { ok: false, message: "the edited save does not compress small enough to fit its file" };
  const check = readContainer(rebuilt);
  if (!check || !check.payload.equals(next)) {
    return { ok: false, message: "the rebuilt save did not read back identically; nothing was written" };
  }
  const changed = [];
  for (const e of edits) {
    const was = readPlayerNumbers(c.payload, e.index);
    const now = readPlayerNumbers(check.payload, e.index);
    if (!was || !now) return { ok: false, message: `could not read player ${e.index} back` };
    const wanted = /* @__PURE__ */ new Map();
    if (e.overall !== void 0) wanted.set("overall", e.overall);
    for (const [n, v] of Object.entries(e.ratings ?? {})) wanted.set(n, v);
    for (const [field, want] of wanted) {
      const got = field === "overall" ? now.overall : now.ratings[field];
      if (got !== want) return { ok: false, message: `player ${e.index}: ${field} read back as ${got}, not ${want}; nothing was written` };
      const before = field === "overall" ? was.overall : was.ratings[field];
      if (before !== got) changed.push({ index: e.index, field, before, after: got });
    }
    for (const [field, want, before, after] of [
      ["redshirt", e.redshirt, was.redshirt, now.redshirt],
      ["nilK", e.nilK, was.nilK, now.nilK]
    ]) {
      if (want !== void 0) {
        if (after !== want) {
          return { ok: false, message: `player ${e.index}: ${field} read back as ${after}, not ${want}; nothing was written` };
        }
        if (before !== after) changed.push({ index: e.index, field, before: Number(before), after: Number(after) });
      } else if (before !== after) {
        return { ok: false, message: `player ${e.index}: ${field} changed without being asked to; nothing was written` };
      }
    }
    if (!wanted.has("overall") && was.overall !== now.overall) {
      return { ok: false, message: `player ${e.index}: overall changed without being asked to; nothing was written` };
    }
    for (const n of Object.keys(was.ratings)) {
      if (!wanted.has(n) && was.ratings[n] !== now.ratings[n]) {
        return { ok: false, message: `player ${e.index}: ${n} changed without being asked to; nothing was written` };
      }
    }
  }
  if (!changed.length) return { ok: false, message: "the save already holds those values" };
  const backup = backupPath(path);
  (0, import_node_fs.copyFileSync)(path, backup);
  const tmp = `${path}.dccnew`;
  try {
    (0, import_node_fs.writeFileSync)(tmp, rebuilt);
    (0, import_node_fs.renameSync)(tmp, path);
  } catch (err) {
    try {
      (0, import_node_fs.unlinkSync)(tmp);
    } catch {
    }
    return { ok: false, message: `could not write the save: ${String(err?.message ?? err)}`, backup };
  }
  return { ok: true, message: `updated ${changed.length} value${changed.length === 1 ? "" : "s"}`, backup, changed };
}
function applyDepthEdits(payload, edits, base) {
  const next = Buffer.from(payload);
  const touched = /* @__PURE__ */ new Set();
  for (const e of edits) {
    const at = base + (e.block * DEPTH_SLOTS_PER_TEAM + e.slot) * DEPTH_SLOT_BYTES;
    for (let k = 0; k < DEPTH_SLOT_FIELDS; k++) {
      const o = at + k * 4;
      const row = e.rows[k];
      if (row === void 0) {
        next.writeUInt32BE(0, o);
      } else {
        next.writeUInt16BE(DEPTH_REF_TAG, o);
        next.writeUInt16BE(row, o + 2);
      }
      for (let b = 0; b < 4; b++) touched.add(o + b);
    }
  }
  return { next, touched };
}
function writeDepthEdits(path, edits) {
  if (!edits.length) return { ok: false, message: "nothing to change" };
  for (const e of edits) {
    if (e.rows.length > DEPTH_SLOT_FIELDS) {
      return { ok: false, message: `a slot holds at most ${DEPTH_SLOT_FIELDS} players; slot ${e.slot} was given ${e.rows.length}` };
    }
    if (new Set(e.rows).size !== e.rows.length) {
      return { ok: false, message: `slot ${e.slot} lists the same player twice` };
    }
    if (e.rows.some((r) => !Number.isInteger(r) || r < 0 || r > 65535)) {
      return { ok: false, message: `slot ${e.slot} has a player row outside the table` };
    }
  }
  const file = (0, import_node_fs.readFileSync)(path);
  const c = readContainer(file);
  if (!c) return { ok: false, message: "this file is not a save DCC can read" };
  const rows = new Set(readRoster(c.payload).map((p) => p.index));
  const charts = readDepthCharts(c.payload, rows);
  if (!charts) return { ok: false, message: "this save has no depth chart DCC can find" };
  const base = charts[0].slots[0].offset;
  for (const e of edits) {
    if (!charts[e.block]) return { ok: false, message: `there is no team block ${e.block}` };
    if (e.slot < 0 || e.slot >= DEPTH_SLOTS_PER_TEAM) return { ok: false, message: `there is no slot ${e.slot}` };
    const was = charts[e.block].slots[e.slot].rows;
    if ([...was].sort().join() !== [...e.rows].sort().join()) {
      return { ok: false, message: `slot ${e.slot} of block ${e.block}: this writes a reorder, not a change of who is in the slot` };
    }
  }
  const { next, touched } = applyDepthEdits(c.payload, edits, base);
  if (next.length !== c.payload.length) return { ok: false, message: "the edit changed the payload size" };
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== c.payload[i] && !touched.has(i)) {
      return { ok: false, message: `refusing to write: byte 0x${i.toString(16)} changed and should not have` };
    }
  }
  const rebuilt = packContainer(c, next);
  if (!rebuilt) return { ok: false, message: "the edited save does not compress small enough to fit its file" };
  const check = readContainer(rebuilt);
  if (!check || !check.payload.equals(next)) {
    return { ok: false, message: "the rebuilt save did not read back identically; nothing was written" };
  }
  const after = readDepthCharts(check.payload, rows);
  if (!after) return { ok: false, message: "the rebuilt save no longer has a readable depth chart; nothing was written" };
  const asked = new Map(edits.map((e) => [`${e.block}:${e.slot}`, e.rows]));
  const changed = [];
  for (let b = 0; b < charts.length; b++) {
    for (let s = 0; s < DEPTH_SLOTS_PER_TEAM; s++) {
      const was = charts[b].slots[s].rows;
      const now = after[b].slots[s].rows;
      const want = asked.get(`${b}:${s}`);
      if (want) {
        if (now.join() !== want.join()) {
          return { ok: false, message: `slot ${s} of block ${b} read back as ${now.join(",")}, not ${want.join(",")}; nothing was written` };
        }
        if (was.join() !== now.join()) changed.push({ block: b, slot: s, before: was, after: now });
      } else if (was.join() !== now.join()) {
        return { ok: false, message: `slot ${s} of block ${b} changed without being asked to; nothing was written` };
      }
    }
  }
  if (!changed.length) return { ok: false, message: "the save already holds that order" };
  const backup = backupPath(path);
  (0, import_node_fs.copyFileSync)(path, backup);
  const tmp = `${path}.dccnew`;
  try {
    (0, import_node_fs.writeFileSync)(tmp, rebuilt);
    (0, import_node_fs.renameSync)(tmp, path);
  } catch (err) {
    try {
      (0, import_node_fs.unlinkSync)(tmp);
    } catch {
    }
    return { ok: false, message: `could not write the save: ${String(err?.message ?? err)}`, backup };
  }
  return { ok: true, message: `reordered ${changed.length} slot${changed.length === 1 ? "" : "s"}`, backup, changed };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  KICKOFF_SLOTS,
  applyDepthEdits,
  applyGameEdits,
  applyPlayerEdits,
  backupPath,
  checkEdits,
  checkPlayerEdits,
  packContainer,
  readContainer,
  readGameConditions,
  readPlayerNumbers,
  writeDepthEdits,
  writeGameEdits,
  writePlayerEdits
});
