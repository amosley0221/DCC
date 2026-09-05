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
  packManifest: () => packManifest,
  playerEntryName: () => playerEntryName,
  safe: () => safe,
  schoolEntryName: () => schoolEntryName,
  schoolPlan: () => schoolPlan,
  zipChunk: () => zipChunk,
  zipDirectory: () => zipDirectory
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
function packManifest(names, bytes, now = /* @__PURE__ */ new Date(), fit = {}) {
  const schools = {};
  const players = [];
  const awards = [];
  for (const name of names) {
    const school = /^schools\/(.+)__([a-z]+)\.png$/.exec(name);
    if (school) {
      (schools[school[1]] ??= []).push(school[2]);
      continue;
    }
    const player = /^players\/(.+)\.png$/.exec(name);
    if (player) {
      players.push(player[1]);
      continue;
    }
    const award = /^awards\/([^/]+)__([^/]+)\.png$/.exec(name);
    if (award) awards.push(`${award[1]}:${award[2]}`);
  }
  return {
    version: PACK_VERSION,
    built: now.toISOString(),
    schools,
    players,
    awards,
    fit: {
      jerseyScale: Number.isFinite(fit.jerseyScale) ? Number(fit.jerseyScale) : 1,
      jerseyDrop: Number.isFinite(fit.jerseyDrop) ? Number(fit.jerseyDrop) : 0
    },
    bytes
  };
}
function packEntries(entries, now = /* @__PURE__ */ new Date(), fit = {}) {
  const manifest = packManifest(
    entries.map((e) => e.name),
    entries.reduce((n, e) => n + e.data.length, 0),
    now,
    fit
  );
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
function zipChunk(entry, offset) {
  const name = Buffer.from(entry.name, "utf8");
  const crc = crc32(entry.data);
  const header = Buffer.concat([
    u32le(67324752),
    u16le(20),
    u16le(0),
    u16le(0),
    u16le(0),
    u16le(0),
    // time, date: not kept
    u32le(crc),
    u32le(entry.data.length),
    u32le(entry.data.length),
    u16le(name.length),
    u16le(0),
    name
  ]);
  return {
    bytes: Buffer.concat([header, entry.data]),
    record: { name: entry.name, crc, size: entry.data.length, offset }
  };
}
function zipDirectory(records, offset) {
  const central = records.map((r) => {
    const name = Buffer.from(r.name, "utf8");
    return Buffer.concat([
      u32le(33639248),
      u16le(20),
      u16le(20),
      u16le(0),
      u16le(0),
      u16le(0),
      u16le(0),
      u32le(r.crc),
      u32le(r.size),
      u32le(r.size),
      u16le(name.length),
      u16le(0),
      u16le(0),
      u16le(0),
      u16le(0),
      u32le(0),
      u32le(r.offset),
      name
    ]);
  });
  const dir = Buffer.concat(central);
  return Buffer.concat([
    dir,
    Buffer.concat([
      u32le(101010256),
      u16le(0),
      u16le(0),
      u16le(records.length),
      u16le(records.length),
      u32le(dir.length),
      u32le(offset),
      u16le(0)
    ])
  ]);
}
function zip(entries) {
  const parts = [];
  const records = [];
  let offset = 0;
  for (const e of entries) {
    const { bytes, record } = zipChunk(e, offset);
    parts.push(bytes);
    records.push(record);
    offset += bytes.length;
  }
  parts.push(zipDirectory(records, offset));
  return Buffer.concat(parts);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PACK_CATEGORIES,
  PACK_VERSION,
  awardEntryName,
  crc32,
  packEntries,
  packManifest,
  playerEntryName,
  safe,
  schoolEntryName,
  schoolPlan,
  zipChunk,
  zipDirectory
});
