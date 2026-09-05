"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// electron/saveAnalysis.ts
var saveAnalysis_exports = {};
__export(saveAnalysis_exports, {
  ARCHETYPES: () => ARCHETYPES,
  ARCHETYPE_BIT: () => ARCHETYPE_BIT,
  CLASS_YEARS: () => CLASS_YEARS,
  CLASS_YEAR_BIT: () => CLASS_YEAR_BIT,
  COACH_STRIDE: () => COACH_STRIDE,
  DEALBREAKERS: () => DEALBREAKERS,
  DEALBREAKER_BIT: () => DEALBREAKER_BIT,
  DEPTH_REF_TAG: () => DEPTH_REF_TAG,
  DEPTH_SLOTS: () => DEPTH_SLOTS,
  DEPTH_SLOTS_PER_TEAM: () => DEPTH_SLOTS_PER_TEAM,
  DEPTH_SLOT_BYTES: () => DEPTH_SLOT_BYTES,
  DEPTH_SLOT_FIELDS: () => DEPTH_SLOT_FIELDS,
  DEV_TRAITS: () => DEV_TRAITS,
  DEV_TRAIT_BIT: () => DEV_TRAIT_BIT,
  GAME_BITS: () => GAME_BITS,
  HEIGHT_BIT: () => HEIGHT_BIT,
  HOME_STATES: () => HOME_STATES,
  IDEAL_PITCHES: () => IDEAL_PITCHES,
  NAME_SLOTS: () => NAME_SLOTS,
  NAME_STRIDE: () => NAME_STRIDE,
  NAME_TABLE: () => NAME_TABLE,
  NIL_BIT: () => NIL_BIT,
  OVERALL_BIT: () => OVERALL_BIT,
  PIPELINES: () => PIPELINES,
  PIPELINE_BIT: () => PIPELINE_BIT,
  PITCH_BIT: () => PITCH_BIT,
  PLAYER_ID_BIT: () => PLAYER_ID_BIT,
  POSITIONS: () => POSITIONS,
  POSITION_BIT: () => POSITION_BIT,
  RATINGS_UNPLACED: () => RATINGS_UNPLACED,
  RATING_BITS: () => RATING_BITS,
  RATING_PAIRS_UNVERIFIED: () => RATING_PAIRS_UNVERIFIED,
  RECORD_BASE: () => RECORD_BASE,
  RECORD_STRIDE: () => RECORD_STRIDE,
  RECRUIT_BIT: () => RECRUIT_BIT,
  REDSHIRT_BIT: () => REDSHIRT_BIT,
  SEASON_GAME_ROW: () => SEASON_GAME_ROW,
  STARS_BIT: () => STARS_BIT,
  STATE_BIT: () => STATE_BIT,
  TEAM_BIT: () => TEAM_BIT,
  TEAM_UNASSIGNED: () => TEAM_UNASSIGNED,
  TEAM_WIDTH: () => TEAM_WIDTH,
  WEIGHT_BIT: () => WEIGHT_BIT,
  analyzeSave: () => analyzeSave,
  autoFindDictionary: () => autoFindDictionary,
  checkDictionary: () => checkDictionary,
  decodeFrames: () => decodeFrames,
  diffSaves: () => diffSaves,
  findDictionary: () => findDictionary,
  readCoaches: () => readCoaches,
  readDepthCharts: () => readDepthCharts,
  readRoster: () => readRoster,
  readSavePayload: () => readSavePayload,
  readSeasonGames: () => readSeasonGames,
  readStores: () => readStores,
  readTeamNames: () => readTeamNames,
  sampleFrames: () => sampleFrames,
  seasonGameTable: () => seasonGameTable,
  teamTableOrder: () => teamTableOrder,
  zstdSupported: () => zstdSupported
});
module.exports = __toCommonJS(saveAnalysis_exports);
var import_node_crypto = require("node:crypto");
var import_node_zlib = require("node:zlib");
var zlib = __toESM(require("node:zlib"), 1);
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var zstdDecompressSync2 = zlib.zstdDecompressSync;
var zstdSupported = typeof zstdDecompressSync2 === "function";
var NO_ZSTD = "This build cannot read zstd frames. Reinstall the latest DCC \u2014 older builds shipped a runtime without zstd support.";
function shannon(buf) {
  if (buf.length === 0) return 0;
  const freq = new Array(256).fill(0);
  for (const b of buf) freq[b]++;
  let h = 0;
  for (const f of freq) {
    if (!f) continue;
    const p = f / buf.length;
    h -= p * Math.log2(p);
  }
  return h;
}
function sniffContainer(head) {
  const notes = [];
  const u32 = head.readUInt32BE(0);
  const magics = [
    ["ZIP archive", (b) => b.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))],
    ["gzip", (b) => b[0] === 31 && b[1] === 139],
    ["zlib stream", (b) => b[0] === 120 && [1, 94, 156, 218].includes(b[1])],
    ["LZ4 frame", (b) => b.readUInt32LE(0) === 407708164],
    ["Zstandard", (b) => b.readUInt32LE(0) === 4247762216],
    ["bzip2", (b) => b.subarray(0, 3).toString("latin1") === "BZh"],
    ["7-zip", (b) => b.subarray(0, 2).toString("latin1") === "7z"],
    ["SQLite database", (b) => b.subarray(0, 15).toString("latin1") === "SQLite format 3"],
    ["Frostbite FBCHUNKS", (b) => b.subarray(0, 8).toString("latin1") === "FBCHUNKS"],
    ["EA DBF-style", (b) => b.subarray(0, 3).toString("latin1") === "DBF"]
  ];
  for (const [name, test] of magics) {
    try {
      if (test(head)) return { container: name, notes };
    } catch {
    }
  }
  notes.push(
    `No known container magic. First four bytes are 0x${u32.toString(16).padStart(8, "0")} (${head.readUInt32LE(0)} as little-endian, which is often a length or version field).`
  );
  return { container: "unrecognised", notes };
}
function findCompressedRegions(buf, limit = 40) {
  const found = [];
  const printable = (b) => b.subarray(0, 160).toString("latin1").replace(/[^\x20-\x7e]/g, "\xB7");
  for (let i = 0; i + 2 < buf.length && found.length < limit; i++) {
    const a = buf[i];
    const b = buf[i + 1];
    const isZlib = a === 120 && [1, 94, 156, 218].includes(b) && ((a << 8) + b) % 31 === 0;
    const isGzip = a === 31 && b === 139;
    if (!isZlib && !isGzip) continue;
    const slice = buf.subarray(i);
    try {
      const out = isGzip ? (0, import_node_zlib.gunzipSync)(slice) : (0, import_node_zlib.inflateSync)(slice);
      if (out.length < 64) continue;
      found.push({
        offset: i,
        method: isGzip ? "gzip" : "zlib",
        compressedBytes: slice.length,
        inflatedBytes: out.length,
        preview: printable(out)
      });
      i += 1024;
    } catch {
    }
  }
  if (found.length === 0) {
    for (let i = 0; i < Math.min(buf.length, 1 << 20); i += 512) {
      try {
        const out = (0, import_node_zlib.inflateRawSync)(buf.subarray(i));
        if (out.length > 4096) {
          found.push({
            offset: i,
            method: "raw-deflate",
            compressedBytes: buf.length - i,
            inflatedBytes: out.length,
            preview: printable(out)
          });
          break;
        }
      } catch {
      }
    }
  }
  return found;
}
function extractStrings(buf, min = 5, cap = 120) {
  const counts = /* @__PURE__ */ new Map();
  let cur = [];
  const flush = () => {
    if (cur.length >= min) {
      const s = Buffer.from(cur).toString("latin1");
      if (/[A-Za-z]{3}/.test(s)) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    cur = [];
  };
  for (const b of buf) {
    if (b >= 32 && b <= 126) cur.push(b);
    else flush();
  }
  flush();
  return [...counts.entries()].map(([text2, count]) => ({ text: text2, count })).sort((a, b) => b.count - a.count || b.text.length - a.text.length).slice(0, cap);
}
function extractClassNames(buf, cap = 2e3) {
  const counts = /* @__PURE__ */ new Map();
  let cur = [];
  const flush = () => {
    if (cur.length >= 5 && cur.length <= 48) {
      const s = Buffer.from(cur).toString("latin1");
      const shaped = /^[A-Z][A-Za-z0-9]*(\[\])?$/.test(s);
      const camel = (s.match(/[A-Z]/g) ?? []).length >= 2;
      if (shaped && camel) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    cur = [];
  };
  for (const b of buf) {
    if (b >= 32 && b <= 126) cur.push(b);
    else flush();
  }
  flush();
  return [...counts.entries()].map(([text2, count]) => ({ text: text2, count })).sort((a, b) => a.text.localeCompare(b.text)).slice(0, cap);
}
function extractUtf16(buf, min = 5, cap = 60) {
  const out = [];
  let cur = [];
  for (let i = 0; i + 1 < buf.length; i += 2) {
    const lo = buf[i];
    const hi = buf[i + 1];
    if (hi === 0 && lo >= 32 && lo <= 126) cur.push(String.fromCharCode(lo));
    else {
      if (cur.length >= min) out.push(cur.join(""));
      cur = [];
      if (out.length >= cap) break;
    }
  }
  return [...new Set(out)].slice(0, cap);
}
function readFrostbite(buf) {
  if (buf.subarray(0, 8).toString("latin1") !== "FBCHUNKS") return null;
  try {
    const dataOffset = buf.readUInt32LE(10);
    const payloadBytes = buf.readUInt32LE(14);
    const [y, mo, d, h, mi, sec] = [22, 24, 26, 28, 30, 32].map((o) => buf.readUInt16LE(o));
    const build = buf.subarray(34, 58).toString("latin1").replace(/\0+$/, "");
    let streamAt = -1;
    for (let i = dataOffset; i < Math.min(dataOffset + 256, buf.length - 1); i++) {
      if (buf[i] === 120 && ((buf[i] << 8) + buf[i + 1]) % 31 === 0) {
        streamAt = i;
        break;
      }
    }
    if (streamAt < 0) return null;
    const payload = (0, import_node_zlib.inflateSync)(buf.subarray(streamAt));
    return {
      header: {
        version: buf.readUInt16LE(8),
        dataOffset,
        payloadBytes,
        build,
        saved: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")} ${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(sec).padStart(2, "0")}`,
        innerMagic: payload.subarray(0, 4).toString("latin1"),
        inflatedBytes: payload.length
      },
      payload
    };
  } catch {
    return null;
  }
}
function readSavePayload(path) {
  return readFrostbite((0, import_node_fs.readFileSync)(path))?.payload ?? null;
}
function analyzeSave(path) {
  const bytes = (0, import_node_fs.statSync)(path).size;
  const buf = (0, import_node_fs.readFileSync)(path);
  const head = buf.subarray(0, 64);
  const { container, notes } = sniffContainer(head);
  const frostbite = readFrostbite(buf);
  const blocks = Math.min(64, Math.max(1, Math.ceil(buf.length / (256 * 1024))));
  const blockSize = Math.ceil(buf.length / blocks);
  const entropyProfile = Array.from({ length: blocks }, (_, i) => ({
    offset: i * blockSize,
    entropy: Number(shannon(buf.subarray(i * blockSize, (i + 1) * blockSize)).toFixed(2))
  }));
  const regions = frostbite ? [{
    offset: frostbite.header.dataOffset,
    method: "zlib",
    compressedBytes: frostbite.header.payloadBytes,
    inflatedBytes: frostbite.header.inflatedBytes,
    preview: frostbite.payload.subarray(0, 160).toString("latin1").replace(/[^\x20-\x7e]/g, "\xB7")
  }] : findCompressedRegions(buf);
  const inflated = frostbite ? frostbite.payload : regions.length ? Buffer.concat(
    regions.slice(0, 8).map((r) => {
      try {
        const s = buf.subarray(r.offset);
        return r.method === "gzip" ? (0, import_node_zlib.gunzipSync)(s) : (0, import_node_zlib.inflateSync)(s);
      } catch {
        return Buffer.alloc(0);
      }
    })
  ) : Buffer.alloc(0);
  const textSource = inflated.length > 0 ? inflated : buf;
  const entropy = Number(shannon(buf).toFixed(3));
  if (frostbite) {
    notes.push(
      `Frostbite save from build ${frostbite.header.build}, written ${frostbite.header.saved}. The payload is ${frostbite.header.innerMagic} and inflates to ${frostbite.header.inflatedBytes.toLocaleString()} bytes \u2014 it is compressed, not encrypted.`
    );
  }
  if (entropy > 7.9 && regions.length === 0) {
    notes.push(
      "Entropy is very high with no decodable deflate streams, which points at encryption or an unknown compression scheme rather than plain zlib."
    );
  }
  if (regions.length > 0) {
    notes.push(
      `${regions.length} deflate stream(s) decoded \u2014 the readable structure is inside these, not in the outer file.`
    );
  }
  let zstd;
  if (inflated.length > 0) {
    const magic = Buffer.from([40, 181, 47, 253]);
    let i = 0, frames = 0, sized = 0, sizeSum = 0, dictId = 0;
    while ((i = inflated.indexOf(magic, i)) !== -1) {
      const fhd = inflated[i + 4];
      const didLen = [0, 1, 2, 4][fhd & 3];
      const fcsLen = [fhd >> 5 & 1 ? 1 : 0, 2, 4, 8][fhd >> 6 & 3];
      if (didLen && i + 5 + didLen <= inflated.length) {
        dictId = didLen === 4 ? inflated.readUInt32LE(i + 5) : didLen === 2 ? inflated.readUInt16LE(i + 5) : inflated[i + 5];
      }
      if (fcsLen && i + 5 + didLen + fcsLen <= inflated.length) {
        sizeSum += fcsLen === 1 ? inflated[i + 5 + didLen] : inflated.readUInt16LE(i + 5 + didLen);
        sized++;
      }
      frames++;
      i += 4;
    }
    if (frames > 0) {
      zstd = {
        frames,
        dictionaryId: `0x${(dictId >>> 0).toString(16)}`,
        dictionaryInSave: inflated.includes(Buffer.from([55, 164, 48, 236])),
        meanContentBytes: sized ? Math.round(sizeSum / sized) : 0
      };
      notes.push(
        `${frames.toLocaleString()} zstd frames, all using dictionary 0x${(dictId >>> 0).toString(16)}, which is ${zstd.dictionaryInSave ? "carried in the save itself" : "not stored in the save"}.`
      );
    }
  }
  return {
    frostbite: frostbite?.header,
    zstd,
    name: (0, import_node_path.basename)(path),
    bytes,
    sha256: (0, import_node_crypto.createHash)("sha256").update(buf).digest("hex"),
    headHex: head.toString("hex").replace(/(.{2})/g, "$1 ").trim(),
    headAscii: head.toString("latin1").replace(/[^\x20-\x7e]/g, "\xB7"),
    container,
    entropy,
    entropyProfile,
    compressedRegions: regions,
    totalInflatedBytes: regions.reduce((s, r) => s + r.inflatedBytes, 0),
    strings: extractStrings(textSource),
    classNames: extractClassNames(textSource),
    stores: readStores(textSource),
    utf16Strings: extractUtf16(textSource),
    notes
  };
}
function diffSaves(pathA, pathB, dictionary) {
  const a = readFrostbite((0, import_node_fs.readFileSync)(pathA));
  const b = readFrostbite((0, import_node_fs.readFileSync)(pathB));
  if (!a || !b) throw new Error("Both files must be FBCHUNKS saves");
  const A = a.payload;
  const B = b.payload;
  const n = Math.min(A.length, B.length);
  const notes = [];
  if (A.length !== B.length) {
    notes.push(
      `Payloads differ in length by ${Math.abs(B.length - A.length)} bytes, so offsets past the first insertion will not line up. A pair taken minutes apart usually matches exactly.`
    );
  }
  const runs = [];
  let differing = 0;
  let start = -1;
  let last = -1;
  const push = (from, to) => {
    const len = to - from + 1;
    const changed = A[from] ^ B[from];
    runs.push({
      offset: from,
      length: len,
      a: A.subarray(from, Math.min(from + 24, to + 1)).toString("hex"),
      b: B.subarray(from, Math.min(from + 24, to + 1)).toString("hex"),
      bits: changed.toString(2).padStart(8, "0")
    });
  };
  for (let i = 0; i < n; i++) {
    if (A[i] === B[i]) continue;
    differing++;
    if (start >= 0 && i - last <= 16) {
      last = i;
      continue;
    }
    if (start >= 0) push(start, last);
    start = i;
    last = i;
  }
  if (start >= 0) push(start, last);
  if (differing === 1) {
    notes.push(
      "Exactly one byte changed, so that byte is the field you edited. The bit column shows which bit moved \u2014 several booleans usually share a byte."
    );
  } else if (differing === 0) {
    notes.push("The payloads are identical \u2014 nothing was saved between these two files.");
  }
  let frameDiffs;
  let decodedNote;
  if (dictionary) {
    const da = decodeFrames(A, dictionary);
    const framesOf = (payload) => {
      const out = /* @__PURE__ */ new Map();
      let i = 0;
      while ((i = payload.indexOf(ZSTD_FRAME_MAGIC, i)) !== -1) {
        try {
          out.set(i, zstdDecompressSync2(payload.subarray(i), { dictionary }));
        } catch {
        }
        i += 4;
      }
      return out;
    };
    const fa = framesOf(A);
    const fb = framesOf(B);
    frameDiffs = [];
    for (const [off, bufA] of fa) {
      const bufB = fb.get(off);
      if (!bufB || bufA.equals(bufB)) continue;
      const detail = [];
      const n2 = Math.min(bufA.length, bufB.length);
      for (let k = 0; k < n2 && detail.length < 40; k++) {
        if (bufA[k] !== bufB[k]) detail.push({ at: k, a: bufA[k], b: bufB[k] });
      }
      frameDiffs.push({ frameOffset: off, differingBytes: detail.length, detail });
    }
    decodedNote = `${da.frames.toLocaleString()} frames decoded (${da.bytes.toLocaleString()} bytes of object data); ${frameDiffs.length} frame(s) differ. Comparing decoded frames is far sharper than comparing the compressed payload, where recompression alone moves hundreds of bytes.`;
  }
  return {
    frameDiffs,
    decodedNote,
    aName: (0, import_node_path.basename)(pathA),
    bName: (0, import_node_path.basename)(pathB),
    aInflated: A.length,
    bInflated: B.length,
    sameLength: A.length === B.length,
    differingBytes: differing,
    runs: runs.slice(0, 400),
    notes
  };
}
var ZSTD_DICT_MAGIC = Buffer.from([55, 164, 48, 236]);
var ZSTD_FRAME_MAGIC = Buffer.from([40, 181, 47, 253]);
function sampleFrames(payload, count = 6) {
  const frames = [];
  let at = payload.indexOf(ZSTD_FRAME_MAGIC);
  const stride = Math.max(1, Math.floor(payload.length / (count * 8)));
  let from = at;
  while (frames.length < count && from >= 0 && from < payload.length) {
    at = payload.indexOf(ZSTD_FRAME_MAGIC, from);
    if (at < 0) break;
    const next = payload.indexOf(ZSTD_FRAME_MAGIC, at + 4);
    const end = next > at ? next : Math.min(at + 2048, payload.length);
    if (end - at > 16) frames.push(payload.subarray(at, end));
    from = at + stride;
  }
  return frames;
}
function plausibility(buf) {
  if (buf.length === 0) return 0;
  let friendly = 0;
  const freq = new Uint32Array(256);
  for (const b of buf) {
    freq[b]++;
    if (b === 0 || b >= 32 && b <= 126) friendly++;
  }
  let h = 0;
  for (const f of freq) {
    if (!f) continue;
    const p = f / buf.length;
    h -= p * Math.log2(p);
  }
  return 0.5 * (friendly / buf.length) + 0.5 * (1 - h / 8);
}
function verifyDictionary(buf, offset, frames) {
  if (frames.length === 0) return [];
  const maxLen = Math.min(buf.length - offset, 4 * 1024 * 1024);
  const scoreAt = (len, using) => {
    let total = 0;
    for (const f of using) {
      let out2;
      try {
        out2 = zstdDecompressSync2(f, { dictionary: buf.subarray(offset, offset + len) });
      } catch {
        return -1;
      }
      total += plausibility(out2);
    }
    return total / using.length;
  };
  const coarse = frames.slice(0, 2);
  const seen = [];
  const whole = scoreAt(maxLen, frames);
  if (whole > 0) {
    let preview = "";
    try {
      preview = zstdDecompressSync2(frames[0], { dictionary: buf.subarray(offset, offset + maxLen) }).subarray(0, 180).toString("latin1").replace(/[^\x20-\x7e]/g, ".");
    } catch {
    }
    if (whole > 0.6) return [{ length: maxLen, score: Number(whole.toFixed(4)), preview }];
    seen.push({ length: maxLen, score: whole });
  }
  for (let len = 512; len <= maxLen; len += 4) {
    const v = scoreAt(len, coarse);
    if (v > 0.5) seen.push({ length: len, score: v });
  }
  if (seen.length === 0) return [];
  seen.sort((a, b) => b.score - a.score);
  const out = [];
  const tried = /* @__PURE__ */ new Set();
  for (const c of seen.slice(0, 12)) {
    for (let len = c.length - 8; len <= c.length + 8; len++) {
      if (len < 1 || len > maxLen || tried.has(len)) continue;
      tried.add(len);
      const v = scoreAt(len, frames);
      if (v > 0) {
        let preview = "";
        try {
          preview = zstdDecompressSync2(frames[0], { dictionary: buf.subarray(offset, offset + len) }).subarray(0, 180).toString("latin1").replace(/[^\x20-\x7e]/g, ".");
        } catch {
        }
        out.push({ length: len, score: Number(v.toFixed(4)), preview });
      }
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 5);
}
function findDictionary(root, dictionaryId, frames, budgetBytes = 12 * 1024 ** 3) {
  const idLE = Buffer.alloc(4);
  idLE.writeUInt32LE(dictionaryId >>> 0);
  const hits = [];
  const notes = [];
  let filesScanned = 0;
  let bytesScanned = 0;
  let dictionariesSeen = 0;
  const walk = (dir, depth) => {
    if (depth > 10 || bytesScanned > budgetBytes) return;
    let entries;
    try {
      entries = (0, import_node_fs.readdirSync)(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (bytesScanned > budgetBytes) return;
      const full = (0, import_node_path.join)(dir, e.name);
      if (e.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!e.isFile()) continue;
      let size = 0;
      try {
        size = (0, import_node_fs.statSync)(full).size;
      } catch {
        continue;
      }
      if (size === 0 || size > 3 * 1024 ** 3) continue;
      let buf;
      try {
        buf = (0, import_node_fs.readFileSync)(full);
      } catch {
        continue;
      }
      filesScanned++;
      bytesScanned += buf.length;
      let at = 0;
      let perFile = 0;
      while ((at = buf.indexOf(ZSTD_DICT_MAGIC, at)) !== -1 && perFile < 500) {
        perFile++;
        dictionariesSeen++;
        const id = at + 8 <= buf.length ? buf.readUInt32LE(at + 4) : 0;
        const matches = id >>> 0 === dictionaryId >>> 0;
        if (!matches && frames.length) {
          const patched = Buffer.from(buf.subarray(at, Math.min(at + 4 * 1024 * 1024, buf.length)));
          patched.writeUInt32LE(dictionaryId >>> 0, 4);
          const cands = verifyDictionary(patched, 0, frames);
          if (cands.length) {
            hits.push({
              file: full,
              offset: at,
              dictionaryId: `0x${(id >>> 0).toString(16)}`,
              matches: false,
              verified: true,
              lengthBytes: cands[0].length,
              sampleText: cands[0].preview,
              candidates: cands,
              reason: `declares id 0x${(id >>> 0).toString(16)} but the content decodes this save's frames once the id is patched \u2014 ${cands[0].length.toLocaleString()} bytes`
            });
            at += 4;
            continue;
          }
        }
        if (matches) {
          const cands = verifyDictionary(buf, at, frames);
          const best = cands[0];
          hits.push({
            file: full,
            offset: at,
            dictionaryId: `0x${(id >>> 0).toString(16)}`,
            matches: true,
            verified: !!best,
            lengthBytes: best?.length,
            sampleText: best?.preview,
            candidates: cands,
            reason: best ? `the dictionary the save uses \u2014 ${best.length.toLocaleString()} bytes, frames decode to plausible data (score ${best.score})` : "the dictionary id matches, but no length decoded frames to anything plausible"
          });
        } else if (hits.length < 40) {
          const next = buf.indexOf(ZSTD_DICT_MAGIC, at + 4);
          hits.push({
            file: full,
            offset: at,
            dictionaryId: `0x${(id >>> 0).toString(16)}`,
            matches: false,
            verified: false,
            reason: "a zstd dictionary, but not the one this save uses" + (next > at ? ` (up to ${(next - at).toLocaleString()} bytes)` : "")
          });
        }
        at += 4;
      }
      const idAt = buf.indexOf(idLE);
      if (idAt >= 0 && !hits.some((h) => h.file === full && h.verified)) {
        hits.push({
          file: full,
          offset: idAt,
          dictionaryId: `0x${(dictionaryId >>> 0).toString(16)}`,
          matches: false,
          verified: false,
          reason: perFile ? `references the dictionary id, and holds ${perFile} other dictionar${perFile === 1 ? "y" : "ies"} \u2014 it knows about this format` : "mentions the dictionary id but holds no dictionary \u2014 may embed one compressed"
        });
      }
    }
  };
  walk(root, 0);
  const verified = hits.filter((h) => h.verified);
  const matching = hits.filter((h) => h.matches);
  if (verified.length) {
    notes.push(`Found and verified the dictionary \u2014 frames from the save decompress with it.`);
  } else if (matching.length) {
    notes.push(
      "A dictionary with the right id is present, but no frame decoded against it. It is probably stored compressed or split, so the bytes at that offset are not the whole thing."
    );
  } else {
    notes.push(
      `Scanned ${dictionariesSeen} zstd dictionaries, none with id 0x${(dictionaryId >>> 0).toString(16)}. It is likely packed inside a game archive that has to be unpacked first.`
    );
  }
  hits.sort((a, b) => Number(b.verified) - Number(a.verified) || Number(b.matches) - Number(a.matches));
  return { root, filesScanned, bytesScanned, dictionariesSeen, hits: hits.slice(0, 80), notes };
}
function decodeFrames(payload, dictionary) {
  const parts = [];
  const offsets = [];
  let i = 0;
  let failed = 0;
  while ((i = payload.indexOf(ZSTD_FRAME_MAGIC, i)) !== -1) {
    try {
      parts.push(zstdDecompressSync2(payload.subarray(i), { dictionary }));
      offsets.push(i);
    } catch {
      failed++;
    }
    i += 4;
  }
  const data = Buffer.concat(parts);
  return { frames: parts.length, failed, bytes: data.length, data, offsets };
}
function checkDictionary(payload, dictionary) {
  if (!zstdSupported) {
    return { ok: false, frames: 0, failed: 0, bytes: 0, message: NO_ZSTD };
  }
  if (dictionary.length < 8 || dictionary.readUInt32LE(0) !== 3962610743) {
    return { ok: false, frames: 0, failed: 0, bytes: 0, message: "That file is not a zstd dictionary." };
  }
  let i = 0;
  let ok = 0;
  let failed = 0;
  let bytes = 0;
  while ((i = payload.indexOf(ZSTD_FRAME_MAGIC, i)) !== -1 && ok + failed < 200) {
    try {
      bytes += zstdDecompressSync2(payload.subarray(i), { dictionary }).length;
      ok++;
    } catch {
      failed++;
    }
    i += 4;
  }
  const verdict = ok >= 8 && ok >= (ok + failed) * 0.8;
  const id = dictionary.readUInt32LE(4) >>> 0;
  return {
    ok: verdict,
    frames: ok,
    failed,
    bytes,
    message: verdict ? `Dictionary 0x${id.toString(16)} decodes this save's frames.` : `Dictionary 0x${id.toString(16)} did not decode this save (${ok} decoded, ${failed} failed).`
  };
}
function autoFindDictionary(payload, roots) {
  const candidates = [];
  let searched = 0;
  const walk = (dir, depth) => {
    if (depth > 9 || candidates.length > 40 || searched > 25e4) return;
    let entries;
    try {
      entries = (0, import_node_fs.readdirSync)(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      searched++;
      const full = (0, import_node_path.join)(dir, e.name);
      if (e.name === "zstd-dicts") {
        try {
          for (const g of (0, import_node_fs.readdirSync)(full, { withFileTypes: true })) {
            if (g.isDirectory()) candidates.push((0, import_node_path.join)(full, g.name, "dict.bin"));
          }
        } catch {
        }
        continue;
      }
      if (/^(Windows|\$Recycle\.Bin|System Volume Information|node_modules\.cache)$/i.test(e.name)) continue;
      walk(full, depth + 1);
    }
  };
  if (!zstdSupported) return { found: false, searched: 0, message: NO_ZSTD };
  for (const r of roots) walk(r, 0);
  for (const file of candidates) {
    let dict;
    try {
      dict = (0, import_node_fs.readFileSync)(file);
    } catch {
      continue;
    }
    const check = checkDictionary(payload, dict);
    if (check.ok) {
      return {
        found: true,
        file,
        bytes: dict.length,
        id: `0x${dict.readUInt32LE(4).toString(16)}`,
        frames: check.frames,
        searched,
        message: `Found the dictionary and verified it against this save.`
      };
    }
  }
  return {
    found: false,
    searched,
    message: candidates.length ? `Checked ${candidates.length} dictionary file(s); none decoded this save.` : "No zstd-dicts directory found. The dictionary ships with tools that read these saves."
  };
}
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
var TEAM_UNASSIGNED = 255;
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
var RATING_PAIRS_UNVERIFIED = [];
var RATINGS_UNPLACED = ["Throw Under Pressure"];
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
var CONFERENCES = [
  "Big Ten",
  "SEC",
  "ACC",
  "Big 12",
  "Pac-12",
  "American",
  "MAC",
  "MW",
  "CUSA",
  "Sun Belt",
  "Independent"
];
var COACH_STRIDE = 58;
function readCoaches(payload) {
  const isConf = (o) => {
    const t = text(payload, o, 20);
    return t !== null && CONFERENCES.includes(t);
  };
  const probe = Buffer.from("Big Ten", "latin1");
  let start = -1;
  for (let i = 0; (i = payload.indexOf(probe, i)) !== -1; i++) {
    const row = i - 19;
    let run = 0;
    for (let k = 1; k <= 4; k++) if (isConf(row + k * COACH_STRIDE + 19)) run++;
    if (run < 3) continue;
    let lo = row;
    while (lo - COACH_STRIDE >= 0 && isConf(lo - COACH_STRIDE + 19)) lo -= COACH_STRIDE;
    start = lo;
    break;
  }
  if (start < 0) return [];
  const out = [];
  for (let k = 0; ; k++) {
    const o = start + k * COACH_STRIDE;
    if (o + COACH_STRIDE > payload.length) break;
    const conference = text(payload, o + 19, 20);
    if (!conference || !CONFERENCES.includes(conference)) break;
    if (k >= 138) break;
    out.push({
      teamId: k,
      coach: text(payload, o, 19) || null,
      conference,
      division: text(payload, o + 37, 20) || null
    });
  }
  return out;
}
var DEPTH_REF_TAG = 8510;
var DEPTH_SLOT_BYTES = 24;
var DEPTH_SLOT_FIELDS = 6;
var DEPTH_SLOTS_PER_TEAM = 35;
var DEPTH_SLOTS = [
  { abbr: "3DRB", name: "Third-down back", side: "offense" },
  { abbr: "C", name: "Center", side: "offense" },
  { abbr: "CB", name: "Cornerback", side: "defense" },
  { abbr: "DT", name: "Defensive tackle", side: "defense" },
  { abbr: "FB", name: "Fullback", side: "offense" },
  { abbr: "FS", name: "Free safety", side: "defense" },
  { abbr: "GAD", name: "Gadget receiver", side: "offense" },
  { abbr: "HB", name: "Running back", side: "offense" },
  { abbr: "K", name: "Kicker", side: "special" },
  { abbr: "KOS", name: "Kickoff specialist", side: "special" },
  { abbr: "KR", name: "Kick returner", side: "special" },
  { abbr: "LE", name: "Left end", side: "defense" },
  { abbr: "LG", name: "Left guard", side: "offense" },
  { abbr: "LOLB", name: "Left outside linebacker", side: "defense" },
  { abbr: "LS", name: "Long snapper", side: "special" },
  { abbr: "LT", name: "Left tackle", side: "offense" },
  { abbr: "MLB", name: "Middle linebacker", side: "defense" },
  { abbr: "NT", name: "Nose tackle", side: "defense" },
  { abbr: "P", name: "Punter", side: "special" },
  { abbr: "PR", name: "Punt returner", side: "special" },
  { abbr: "PWHB", name: "Power back", side: "offense" },
  { abbr: "QB", name: "Quarterback", side: "offense" },
  { abbr: "RDT", name: "Tackle (3-4)", side: "defense" },
  { abbr: "RE", name: "Right end", side: "defense" },
  { abbr: "RG", name: "Right guard", side: "offense" },
  { abbr: "RLE", name: "Left end (3-4)", side: "defense" },
  { abbr: "ROLB", name: "Right outside linebacker", side: "defense" },
  { abbr: "RRE", name: "Right end (3-4)", side: "defense" },
  { abbr: "RT", name: "Right tackle", side: "offense" },
  { abbr: "SLCB", name: "Slot corner", side: "defense" },
  { abbr: "SLWR", name: "Slot receiver", side: "offense" },
  { abbr: "SS", name: "Strong safety", side: "defense" },
  { abbr: "SUBLB", name: "Sub-package linebacker", side: "defense" },
  { abbr: "TE", name: "Tight end", side: "offense" },
  { abbr: "WR", name: "Receiver", side: "offense" }
];
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
function readTeamNames(payload) {
  const tag = Buffer.from("teamdb_", "latin1");
  const hits = [];
  let i = 0;
  while ((i = payload.indexOf(tag, i)) !== -1) {
    hits.push(i);
    i++;
  }
  const inRun = hits.map((h, k) => k > 0 && h - hits[k - 1] === 503 || k + 1 < hits.length && hits[k + 1] - h === 503);
  const out = [];
  for (let k = 0; k < hits.length; k++) {
    if (!inRun[k]) continue;
    const slug = text(payload, hits[k] + 7, 24);
    const name = text(payload, hits[k] - 278, 30);
    if (!slug || !name || !/^[A-Z]/.test(name)) continue;
    out.push({
      slug,
      name,
      fullName: text(payload, hits[k] - 227, 30) || null,
      abbr: text(payload, hits[k] - 204, 8) || null,
      nickname: text(payload, hits[k] - 146, 24) || null,
      shortNickname: text(payload, hits[k] - 128, 24) || null,
      altAbbr: text(payload, hits[k] - 77, 8) || null
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
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
var G = GAME_BITS;
var G_AWAY_REF = 12;
var G_HOME_REF = 40;
var TEAM_TAG = 12702;
var SEASON_GAME_ROW = 100;
function teamTableOrder(teams) {
  const key = (t) => t.name === "UConn" ? "Connecticut" : t.fullName ?? t.name;
  return [...teams].sort((a, b) => key(a).localeCompare(key(b), "en"));
}
function seasonGameTable(payload) {
  const store = readStores(payload).find((s) => s.name === "SeasonGameStore");
  if (!store) return null;
  const bsft = payload.indexOf(Buffer.from("BSFT", "latin1"), store.offset);
  if (bsft < 0) return null;
  return { data: bsft + 28 + store.members * 4, rows: store.rows };
}
function readSeasonGames(payload, teams) {
  const table = seasonGameTable(payload);
  if (!table) return [];
  const { data, rows: rowCount } = table;
  const store = { rows: rowCount };
  const order = teamTableOrder(teams);
  const nameOf = (i) => i >= 0 && i < order.length ? order[i].name : null;
  const out = [];
  for (let r = 0; r < store.rows; r++) {
    const o = data + r * SEASON_GAME_ROW;
    if (o + SEASON_GAME_ROW > payload.length) break;
    const rd = ([bit, w]) => {
      let v = 0;
      for (let b = bit; b < bit + w; b++) v = v << 1 | payload[o + (b >> 3)] >> 7 - (b & 7) & 1;
      return v;
    };
    const ref = (at) => payload.readUInt16BE(o + at) === TEAM_TAG ? payload.readUInt16BE(o + at + 2) : -1;
    const homeIndex = ref(G_HOME_REF), awayIndex = ref(G_AWAY_REF);
    const week = rd(G.week);
    if (homeIndex < 0 || awayIndex < 0 || homeIndex >= order.length || awayIndex >= order.length) continue;
    const homeQ = [rd(G.homeQ1), rd(G.homeQ2), rd(G.homeQ3), rd(G.homeQ4)];
    const awayQ = [rd(G.awayQ1), rd(G.awayQ2), rd(G.awayQ3), rd(G.awayQ4)];
    const homeScore = rd(G.homeScore), awayScore = rd(G.awayScore);
    out.push({
      row: r,
      week,
      month: rd(G.month),
      day: rd(G.day),
      kickoff: rd(G.kickoff),
      attendance: rd(G.attendance),
      temperatureF: rd(G.temperature) - 40,
      weather: rd(G.weather),
      windMph: rd(G.wind),
      homeIndex,
      awayIndex,
      home: nameOf(homeIndex),
      away: nameOf(awayIndex),
      homeScore,
      awayScore,
      homeQ,
      awayQ,
      homeOT: rd(G.homeOT),
      awayOT: rd(G.awayOT),
      played: homeScore + awayScore > 0 || homeQ.some(Boolean) || awayQ.some(Boolean),
      userPlayed: rd(G.userPlayed) === 1,
      overtime: rd(G.overtime) === 1,
      postseason: rd(G.month) === 12 || rd(G.month) === 1
    });
  }
  return out.sort((a, b) => a.week - b.week || a.row - b.row);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ARCHETYPES,
  ARCHETYPE_BIT,
  CLASS_YEARS,
  CLASS_YEAR_BIT,
  COACH_STRIDE,
  DEALBREAKERS,
  DEALBREAKER_BIT,
  DEPTH_REF_TAG,
  DEPTH_SLOTS,
  DEPTH_SLOTS_PER_TEAM,
  DEPTH_SLOT_BYTES,
  DEPTH_SLOT_FIELDS,
  DEV_TRAITS,
  DEV_TRAIT_BIT,
  GAME_BITS,
  HEIGHT_BIT,
  HOME_STATES,
  IDEAL_PITCHES,
  NAME_SLOTS,
  NAME_STRIDE,
  NAME_TABLE,
  NIL_BIT,
  OVERALL_BIT,
  PIPELINES,
  PIPELINE_BIT,
  PITCH_BIT,
  PLAYER_ID_BIT,
  POSITIONS,
  POSITION_BIT,
  RATINGS_UNPLACED,
  RATING_BITS,
  RATING_PAIRS_UNVERIFIED,
  RECORD_BASE,
  RECORD_STRIDE,
  RECRUIT_BIT,
  REDSHIRT_BIT,
  SEASON_GAME_ROW,
  STARS_BIT,
  STATE_BIT,
  TEAM_BIT,
  TEAM_UNASSIGNED,
  TEAM_WIDTH,
  WEIGHT_BIT,
  analyzeSave,
  autoFindDictionary,
  checkDictionary,
  decodeFrames,
  diffSaves,
  findDictionary,
  readCoaches,
  readDepthCharts,
  readRoster,
  readSavePayload,
  readSeasonGames,
  readStores,
  readTeamNames,
  sampleFrames,
  seasonGameTable,
  teamTableOrder,
  zstdSupported
});
