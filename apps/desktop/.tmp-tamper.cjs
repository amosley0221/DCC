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

// electron/tamper.ts
var tamper_exports = {};
__export(tamper_exports, {
  TAMPER_OPENS_WEEK: () => TAMPER_OPENS_WEEK,
  capMove: () => capMove,
  resistance: () => resistance,
  standing: () => standing
});
module.exports = __toCommonJS(tamper_exports);
var TAMPER_OPENS_WEEK = 11;
function resistance(t, coach) {
  const because = [];
  let score = 40;
  if (!t.depth) {
    score -= 12;
    because.push("He is not on their depth chart at all.");
  } else if (t.depth.string === 1) {
    score += 26;
    because.push(`He starts at ${t.depth.slot}.`);
  } else if (t.depth.string === 2) {
    score -= 4;
    because.push(`He is second at ${t.depth.slot}, behind one man.`);
  } else {
    score -= 16;
    because.push(`He is ${t.depth.string}${ord(t.depth.string)} at ${t.depth.slot}, with ${t.depth.of - 1} ahead of him.`);
  }
  const games = t.teamWins + t.teamLosses;
  const winPct = games ? t.teamWins / games : 0.5;
  if (games >= 4) {
    if (winPct >= 0.8) {
      score += 14;
      because.push(`${t.team} is ${t.teamWins}-${t.teamLosses}.`);
    } else if (winPct <= 0.35) {
      score -= 12;
      because.push(`${t.team} is ${t.teamWins}-${t.teamLosses}.`);
    }
  }
  const gap = Math.round(coach.strength - t.teamStrength);
  if (gap >= 3) {
    score -= 10;
    because.push(`Your roster grades ${gap} points above theirs.`);
  } else if (gap <= -3) {
    score += 10;
    because.push(`Their roster grades ${-gap} points above yours.`);
  }
  if (t.overall >= t.teamStrength + 12) {
    score += 6;
    because.push("He is one of the best players on his team.");
  }
  const coachGames = coach.wins + coach.losses;
  if (coachGames >= 4) {
    const mine = coach.wins / coachGames;
    if (mine >= 0.8) {
      score -= 8;
      because.push(`You are ${coach.wins}-${coach.losses}.`);
    } else if (mine <= 0.35) {
      score += 8;
      because.push(`You are ${coach.wins}-${coach.losses}.`);
    }
  }
  return { score: clamp(score, 5, 95), because };
}
var ord = (n) => n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
var clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function capMove(raw, resist) {
  const ceiling = Math.max(1, Math.round((100 - resist) / 8));
  return clamp(Math.round(raw), -8, ceiling);
}
function standing(interest) {
  if (interest >= 85) return "He is coming with you if he enters.";
  if (interest >= 65) return "You are top of his list.";
  if (interest >= 45) return "You are on his list.";
  if (interest >= 25) return "He is listening.";
  if (interest > 0) return "He has not told you to stop.";
  return "Nothing yet.";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TAMPER_OPENS_WEEK,
  capMove,
  resistance,
  standing
});
