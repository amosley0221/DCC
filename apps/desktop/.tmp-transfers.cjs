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

// electron/transfers.ts
var transfers_exports = {};
__export(transfers_exports, {
  LEDGER_VERSION: () => LEDGER_VERSION,
  buildRecord: () => buildRecord,
  emptyLedger: () => emptyLedger,
  fileRecord: () => fileRecord,
  moves: () => moves,
  paths: () => paths,
  playerKey: () => playerKey,
  yearOf: () => yearOf
});
module.exports = __toCommonJS(transfers_exports);
var LEDGER_VERSION = 1;
var emptyLedger = () => ({ version: LEDGER_VERSION, records: [] });
function playerKey(p) {
  return [p.first, p.last, p.hometown, p.homeState ?? ""].join("\0").toLowerCase();
}
function buildRecord(players, opts) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const p of players) {
    if (p.team === opts.unassigned) continue;
    const key = playerKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, first: p.first, last: p.last, position: p.position, overall: p.overall, team: p.team });
  }
  return {
    season: opts.season,
    week: opts.week,
    recordedAt: opts.now ?? (/* @__PURE__ */ new Date()).toISOString(),
    players: out
  };
}
function fileRecord(ledger, record) {
  const records = ledger.records.filter((r) => r.season !== record.season);
  records.push(record);
  records.sort((a, b) => a.season - b.season);
  return { ...ledger, version: LEDGER_VERSION, records };
}
function moves(ledger) {
  const out = [];
  const rs = [...ledger.records].sort((a, b) => a.season - b.season);
  for (let i = 1; i < rs.length; i++) {
    const before = new Map(rs[i - 1].players.map((p) => [p.key, p]));
    for (const p of rs[i].players) {
      const was = before.get(p.key);
      if (!was || was.team === p.team) continue;
      out.push({
        key: p.key,
        first: p.first,
        last: p.last,
        position: p.position,
        fromSeason: rs[i - 1].season,
        toSeason: rs[i].season,
        from: was.team,
        to: p.team,
        overallBefore: was.overall,
        overallAfter: p.overall
      });
    }
  }
  return out.sort((a, b) => b.toSeason - a.toSeason || b.overallAfter - a.overallAfter);
}
function paths(ledger) {
  const rs = [...ledger.records].sort((a, b) => a.season - b.season);
  const by = /* @__PURE__ */ new Map();
  for (const r of rs) {
    for (const p of r.players) {
      let e = by.get(p.key);
      if (!e) {
        e = { key: p.key, first: p.first, last: p.last, position: p.position, stops: [] };
        by.set(p.key, e);
      }
      e.first = p.first;
      e.last = p.last;
      e.position = p.position;
      const last = e.stops[e.stops.length - 1];
      if (!last || last.team !== p.team) e.stops.push({ season: r.season, team: p.team, overall: p.overall });
      else last.overall = p.overall;
    }
  }
  return [...by.values()].filter((e) => e.stops.length > 1);
}
function yearOf(ledger, season) {
  if (!ledger.latestYear || !ledger.records.length) return null;
  const latest = Math.max(...ledger.records.map((r) => r.season));
  return ledger.latestYear - (latest - season);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LEDGER_VERSION,
  buildRecord,
  emptyLedger,
  fileRecord,
  moves,
  paths,
  playerKey,
  yearOf
});
