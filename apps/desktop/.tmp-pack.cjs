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
  box: () => box,
  buildPack: () => buildPack,
  crc32: () => crc32,
  encodePng: () => encodePng,
  safe: () => safe
});
module.exports = __toCommonJS(artPack_exports);
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var import_node_zlib2 = require("node:zlib");

// electron/gameAssets.ts
var import_node_zlib = require("node:zlib");
var LONG = 12;
var NOISE_RATE = (1 - 95 / 256) * Math.pow(95 / 256, LONG);
function decodePng(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 2303741511) return null;
  let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];
  let palette = null;
  let trns = null;
  let at = 8;
  while (at + 8 <= buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString("latin1", at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") palette = Buffer.from(data);
    else if (type === "tRNS") trns = Buffer.from(data);
    else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "IEND") break;
    at += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || !width || !height || !idat.length) return null;
  if (width * height > 8e6) return null;
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : 0;
  if (!channels) return null;
  if (colorType === 3 && !palette) return null;
  let raw;
  try {
    raw = (0, import_node_zlib.inflateSync)(Buffer.concat(idat));
  } catch {
    return null;
  }
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return null;
  const out = new Uint8Array(width * height * 4);
  const line = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = src[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += a + b >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (colorType === 3) {
        const idx = line[x];
        out[o] = palette[idx * 3];
        out[o + 1] = palette[idx * 3 + 1];
        out[o + 2] = palette[idx * 3 + 2];
        out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else {
        const i = x * channels;
        out[o] = line[i];
        out[o + 1] = line[i + 1];
        out[o + 2] = line[i + 2];
        out[o + 3] = channels === 4 ? line[i + 3] : 255;
      }
    }
    line.copy(prev);
  }
  return { px: out, width, height };
}

// electron/artPack.ts
var PACK_VERSION = 1;
var PACK_CATEGORIES = {
  icon: "logo",
  logoLight: "logo",
  logoGold: "gold",
  helmet: "helmet",
  jersey: "jersey"
};
function buildPack(input) {
  const schoolPx = input.schoolPx ?? 160;
  const playerPx = input.playerPx ?? 256;
  const entries = [];
  const schools = {};
  const players = [];
  let skipped = 0;
  const order = Object.keys(PACK_CATEGORIES);
  const wanted = /* @__PURE__ */ new Map();
  for (const key of Object.keys(input.schoolArt)) {
    const sep = key.lastIndexOf("|");
    const school = key.slice(0, sep);
    const cat = key.slice(sep + 1);
    const as = PACK_CATEGORIES[cat];
    if (!as) continue;
    let inner = wanted.get(school);
    if (!inner) {
      inner = /* @__PURE__ */ new Map();
      wanted.set(school, inner);
    }
    const existing = inner.get(as);
    if (existing && order.indexOf(cat) >= order.indexOf(existing)) continue;
    inner.set(as, cat);
  }
  for (const [school, cats] of wanted) {
    for (const [as, cat] of cats) {
      const file = input.schoolArt[`${school}|${cat}`];
      const png = shrink((0, import_node_path.join)(input.root, file), schoolPx);
      if (!png) {
        skipped++;
        continue;
      }
      entries.push({ name: `schools/${safe(school)}__${as}.png`, data: png });
      (schools[school] ??= []).push(as);
    }
  }
  for (const [assetId, file] of Object.entries(input.facePaths)) {
    const png = shrink((0, import_node_path.join)(input.root, file), playerPx);
    if (!png) {
      skipped++;
      continue;
    }
    entries.push({ name: `players/${safe(assetId)}.png`, data: png });
    players.push(assetId);
  }
  const manifest = {
    version: PACK_VERSION,
    built: (/* @__PURE__ */ new Date()).toISOString(),
    schools,
    players,
    bytes: entries.reduce((n, e) => n + e.data.length, 0)
  };
  entries.unshift({ name: "manifest.json", data: Buffer.from(JSON.stringify(manifest), "utf8") });
  return { bytes: zip(entries), manifest, skipped };
}
var safe = (s) => s.replace(/[^A-Za-z0-9._-]+/g, "_");
function shrink(path, max) {
  let buf;
  try {
    buf = (0, import_node_fs.readFileSync)(path);
  } catch {
    return null;
  }
  const img = decodePng(buf);
  if (!img) return null;
  const { px, width, height } = img;
  if (width <= max && height <= max) return encodePng(px, width, height);
  const scale = max / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  return encodePng(box(px, width, height, w, h), w, h);
}
function box(px, sw, sh, dw, dh) {
  const out = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * sh / dh);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sh / dh));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * sw / dw);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sw / dw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const o = (sy * sw + sx) * 4;
          const av = px[o + 3];
          r += px[o] * av;
          g += px[o + 1] * av;
          b += px[o + 2] * av;
          a += av;
          n++;
        }
      }
      const d = (y * dw + x) * 4;
      out[d] = a ? Math.round(r / a) : 0;
      out[d + 1] = a ? Math.round(g / a) : 0;
      out[d + 2] = a ? Math.round(b / a) : 0;
      out[d + 3] = Math.round(a / n);
    }
  }
  return out;
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
function crc32(buf, seed = 0) {
  let c = seed ^ 4294967295;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
var u32be = (v) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(v >>> 0);
  return b;
};
function chunk(type, data) {
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  return Buffer.concat([u32be(data.length), td, u32be(crc32(td))]);
}
function encodePng(px, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(px.buffer, px.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", (0, import_node_zlib2.deflateSync)(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
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
  box,
  buildPack,
  crc32,
  encodePng,
  safe
});
