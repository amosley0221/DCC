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

// electron/artPack.ts
var artPack_exports = {};
__export(artPack_exports, {
  PACK_CATEGORIES: () => PACK_CATEGORIES,
  PACK_VERSION: () => PACK_VERSION,
  awardEntryName: () => awardEntryName,
  crc32: () => crc32,
  packEntries: () => packEntries,
  playerEntryName: () => playerEntryName,
  safe: () => safe,
  schoolEntryName: () => schoolEntryName,
  schoolPlan: () => schoolPlan
});
module.exports = __toCommonJS(artPack_exports);
var PACK_VERSION = 1;
var PACK_CATEGORIES = {
  icon: "logo",
  logoLight: "logo",
  logoGold: "gold",
  helmet: "helmet",
  jersey: "jersey"
};
var safe = (s) => s.replace(/[^A-Za-z0-9._-]+/g, "_");
var schoolEntryName = (school, mark) => `schools/${safe(school)}__${mark}.png`;
var playerEntryName = (assetId) => `players/${safe(assetId)}.png`;
var awardEntryName = (key) => {
  const [kind, ...rest] = key.split(":");
  return `awards/${safe(kind)}__${safe(rest.join(":"))}.png`;
};
function schoolPlan(schoolArt) {
  const order = Object.keys(PACK_CATEGORIES);
  const out = /* @__PURE__ */ new Map();
  for (const key of Object.keys(schoolArt)) {
    const sep = key.lastIndexOf("|");
    const school = key.slice(0, sep);
    const cat = key.slice(sep + 1);
    const mark = PACK_CATEGORIES[cat];
    if (!mark) continue;
    let inner = out.get(school);
    if (!inner) {
      inner = /* @__PURE__ */ new Map();
      out.set(school, inner);
    }
    const existing = inner.get(mark);
    if (existing && order.indexOf(cat) >= order.indexOf(existing)) continue;
    inner.set(mark, cat);
  }
  return out;
}
function packEntries(entries, now = /* @__PURE__ */ new Date(), fit = {}) {
  const schools = {};
  const players = [];
  const awards = [];
  for (const e of entries) {
    const school = /^schools\/(.+)__([a-z]+)\.png$/.exec(e.name);
    if (school) {
      (schools[school[1]] ??= []).push(school[2]);
      continue;
    }
    const player = /^players\/(.+)\.png$/.exec(e.name);
    if (player) {
      players.push(player[1]);
      continue;
    }
    const award = /^awards\/([^/]+)__([^/]+)\.png$/.exec(e.name);
    if (award) awards.push(`${award[1]}:${award[2]}`);
  }
  const manifest = {
    version: PACK_VERSION,
    built: now.toISOString(),
    schools,
    players,
    awards,
    fit: {
      jerseyScale: Number.isFinite(fit.jerseyScale) ? Number(fit.jerseyScale) : 1,
      jerseyDrop: Number.isFinite(fit.jerseyDrop) ? Number(fit.jerseyDrop) : 0
    },
    bytes: entries.reduce((n, e) => n + e.data.length, 0)
  };
  const all = [
    { name: "manifest.json", data: Buffer.from(JSON.stringify(manifest), "utf8") },
    ...entries
  ];
  return { bytes: zip(all), manifest };
}
var CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 4294967295;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
var u16le = (v) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(v & 65535);
  return b;
};
var u32le = (v) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0);
  return b;
};
function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const header = Buffer.concat([
      u32le(67324752),
      u16le(20),
      u16le(0),
      u16le(0),
      u16le(0),
      u16le(0),
      // time, date: not kept
      u32le(crc),
      u32le(e.data.length),
      u32le(e.data.length),
      u16le(name.length),
      u16le(0),
      name
    ]);
    local.push(header, e.data);
    central.push(Buffer.concat([
      u32le(33639248),
      u16le(20),
      u16le(20),
      u16le(0),
      u16le(0),
      u16le(0),
      u16le(0),
      u32le(crc),
      u32le(e.data.length),
      u32le(e.data.length),
      u16le(name.length),
      u16le(0),
      u16le(0),
      u16le(0),
      u16le(0),
      u32le(0),
      u32le(offset),
      name
    ]));
    offset += header.length + e.data.length;
  }
  const dir = Buffer.concat(central);
  return Buffer.concat([
    ...local,
    dir,
    Buffer.concat([
      u32le(101010256),
      u16le(0),
      u16le(0),
      u16le(entries.length),
      u16le(entries.length),
      u32le(dir.length),
      u32le(offset),
      u16le(0)
    ])
  ]);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PACK_CATEGORIES,
  PACK_VERSION,
  awardEntryName,
  crc32,
  packEntries,
  playerEntryName,
  safe,
  schoolEntryName,
  schoolPlan
});
