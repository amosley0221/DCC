# Handoff: Dynasty Command Center (DCC)

A personal companion tool for an EA College Football 27 dynasty. Three machines:

| Machine | Role |
| --- | --- |
| **Gaming PC** (+ ROG Ally) | Runs the game **and** the full DCC desktop app. The **only** machine that reads or writes the dynasty save file. |
| **Home server** | Relay + database + LLM story/conversation generation + media storage. Never needs the game installed — it stores and serves bytes and text, it does not parse gameplay. |
| **Android phone** (Galaxy Z Fold, unfolded is the design target) | Full companion app. Everything the desktop can do except touching the save. |

**The asymmetry that matters:** both apps are full workspaces with feature parity. The difference is only *who writes the save*. Every mutation from either app enters one shared queue; the PC agent applies the queue to the save after a backup, once the game closes and the save unlocks.

---

## Deliverables the user expects

1. **Android app** — installable **APK** (Kotlin + Jetpack Compose, Material 3, phone/fold).
2. **Windows app** — distributable **.exe** (Electron + React, or another stack you judge better; must ship as an installable/portable exe).
3. Both talk to a **relay service** on the home server (LLM generation, shared queue, cloud save, media).

Do not stop at a dev-server-only build. The Android target must produce a signed-or-debug APK the user can sideload; the Windows target must produce a runnable exe.

---

## About the design files

`design-reference/DCC Prototype.dc.html` is a **design reference written in HTML**, not production code. It is a live, clickable prototype of both apps side by side — it exists so you can see intended layout, hierarchy, type, color, states, and interaction flow. **Do not port the HTML.** Rebuild it natively:

- Android → Kotlin + Jetpack Compose with Material 3
- Windows → your chosen desktop stack

The prototype opens in a browser. Click through it. It is the most accurate spec in this bundle — richer than any prose description, because every state is real.

`design-reference/DCC Tokens.md` is the token spec (colors, type, spacing, radii, component states) accumulated across the design process. Where it and the prototype disagree, **the prototype wins** — it is newer.

`support.js` is the prototype's runtime. It is needed only to open the HTML locally; it is not part of the product.

### Fidelity

**High fidelity.** Final colors, typography, spacing, and interaction behavior. Recreate faithfully using each platform's native components. The screenshots and the running prototype are both authoritative.

---

## Screenshots

`screenshots/` — each image shows **both apps at once** (Android fold on the left, Windows on the right) for one section, so you can see parity and where the two layouts intentionally diverge.

| File | Section |
| --- | --- |
| `01-wire-feed.png` | Wire — generated news feed, approvable story effects, heat meter |
| `02-national.png` | National — top stories, scores, leaders, standings |
| `03-recruit-my-board.png` | Recruit — my board, commitment stages, top-school badges, interest rule |
| `04-recruit-player-rankings.png` | Recruit — national prospect pool with search + filters |
| `05-team-schedule.png` | Team — schedule (any team), story chips, write-recap action |
| `06-team-roster-editor.png` | Team — roster list + player editor (OVR, dev, class, position, redshirt, release) |
| `07-team-depth-chart.png` | Team — depth chart by position group |
| `08-team-trade.png` | Team — trade builder with 85-man limit guard and value read |
| `09-tamper-targets.png` | Tamper — rival player targets, gated to week 11+ |
| `10-coach.png` | Coach — career record, titles, players drafted, history |
| `11-queue-sync.png` | Queue — shared queue, held/applied states, apply-all, live log |
| `12-export-draft-roster.png` | Export — Madden draft class + Play Now roster |
| `13-devices-cloud-save.png` | Devices — cloud save, machine list, lease/checkout |

---

## Visual language

Two complete themes ship; **Night Wire is the default** and a user setting switches them. The prototype has a theme prop — flip it to see Field Office.

### Night Wire (default)

| Token | Hex | Use |
| --- | --- | --- |
| bg | `#131110` | screen background |
| bar | `#0E0C0B` | nav rail / sidebar / app bar / log panels |
| card | `#171412` | cards, table selected row |
| cardLine | `#262220` | card borders |
| line | `#2A2624` | hairline dividers, progress tracks |
| rule | `#EDE6DA` | 2px header rule under section titles |
| ink | `#EDE6DA` | primary text |
| ink2 | `#B5ACA0` | body / secondary |
| ink3 | `#8D857A` | metadata, labels |
| ink4 | `#6E675E` | inactive nav, disabled |
| accent | `#B33A2B` | heat, kickers, active-tab indicator, badges, destructive, at-risk |
| onAccent | `#EDE6DA` | text on accent |
| good | `#7D8F6A` | positive / synced / committed |
| warn | `#C9873A` | held / ratings / caution |
| btnBg / btnInk | `#EDE6DA` / `#131110` | primary filled button |
| btn2Line / btn2Ink | `#3C3733` / `#8D857A` | secondary outline button |
| effectBg / effectInk | `#1E1A17` / `#C8BFB2` | proposed-effect callout (2px accent left border) |
| heatBoxBg | `#1E1613` | heat panel on call screens |

### Field Office (alternate)

`bg #1B241F` · `bar #141B17` · `card #222D26` · `cardLine/line #34443B` · `rule/ink #EFE7D5` · `ink2 #C9C2AC` · `ink3 #8FA294` · `ink4 #6D7F72` · `accent #C4502B` · `good #7A8F5F` · `warn #C9873A` · `btnBg #2A2318` / `btnInk #EFE7D5`. In this theme the **actionable** Wire story inverts onto paper: `heroBg #EFE7D5`, `heroInk #2A2318`, `heroInk2 #4C4436`, `effectBg #E3D7BD`. Heat fill is a 90° gradient `#7A8F5F → #C9873A → #C4502B`.

Player/team monogram avatar tones (night): `#3D2F2A #2F3A34 #33313F #3F382A #2A3340 #3A2A33` — (field): `#3A4536 #4A3D2E #37453F #453231 #3C4030 #31404A`.

### Type

- **Serif** (headlines, names, numbers): Newsreader (night) / Zilla Slab (field)
- **Mono** (labels, metadata, buttons, tabs, data): IBM Plex Mono (night) / Courier Prime (field)
- **Sans** (body prose, chat): Public Sans

| Role | Spec |
| --- | --- |
| section title | serif 600, 26–27sp / 1.0 |
| hero headline | serif 500, 20sp / 1.28 |
| headline | serif 500, 17sp / 1.32 |
| row title | serif 500, 13–15.5sp |
| story body | serif 400, 13.5sp / 1.62 |
| chat / prose | sans 400, 13–14sp / 1.5 |
| kicker | mono 600, 10sp, tracking 2sp, UPPERCASE |
| metadata | mono 400, 8.5–11.5sp, tracking 0.5–1.5sp |
| button | mono 600, 10–12sp, tracking 1.5sp, UPPERCASE |
| nav tab | mono 600, 10.5–11sp, tracking 1–1.5sp, UPPERCASE |
| heat value | mono 600, 19–22sp |

Never below 12sp on phone. Touch targets ≥ 44dp; primary actions sit in thumb reach.

### Spacing / radii

4dp scale: 4 · 8 · 12 · 16 · 22 · 28. Card padding 16dp H / 12–15dp V. List gap 8–10dp. Radii: buttons 4dp (night) / 6dp (field), cards 6dp, chat bubbles 12–14dp, chips and badges full, tracks 2–4dp.

### Component states

- **Primary button** — filled `btnBg`; pressed = 88% alpha; disabled = outline + `ink4` text (used for blocked actions, see Trade)
- **Secondary** — 1dp `btn2Line` outline, `btn2Ink` text; pressed = 8% ink overlay
- **Nav item** — inactive `ink4` → active `ink` + 2dp accent indicator (underline on phone rail, left edge on desktop sidebar)
- **Sub-tab chip** — selected = filled `btnBg`/`btnInk`; unselected = 1dp `cardLine` outline, `ink3`
- **Filter chip** — selected = filled accent or `btnBg`; unselected = outline
- **Queue state** — HELD `warn` · APPLIED `good` · FAILED `accent`, mono 600 9.5sp tracking 1.5
- **Sync dot** — `● QUEUED` in `warn` on any row with an unapplied edit
- **Selected row** — `card` bg + `accent` border

---

## Sections (both apps)

Nav order — phone: a **left nav rail** on the unfolded fold (`WIRE · NATIONAL · RECRUIT · TEAM · TAMPER · COACH · QUEUE`, heat value pinned at the rail bottom). Desktop: the same list in a left **sidebar**, plus PC-only `EXPORT` and `DEVICES`, with a 3-dot agent status strip pinned at the sidebar bottom (save verified / game running / relay+phone).

### 1. Wire — home
Generated news feed about the user's program. Each story is written from real save data by the LLM on the home server. Some carry a **proposed effect** (e.g. `Vale +2 Confidence · Okafor −1 Morale`) in a callout with a 2px accent left border, with `APPROVE` / `DISMISS`. Approving pushes the effect into the shared queue and marks the story `✓ APPROVED — IN QUEUE`; dismissing fades it to 45% opacity and marks `✕ DISMISSED`. Stories with no effect are read-only.

Header carries the **heat meter**: `HEAT nn`, a track with accent fill, and `THRESHOLD 80`. At ≥80 a critical banner appears above the feed warning of the consequence. Heat is program-wide and one value; typography is the priority on this screen — story text must be genuinely readable.

Media (designed, layered on top, never structural): stories may carry 0 images (most common — must not look broken), 1 image, several, a video clip with an inline player and a clear clip affordance, or app-matched **suggested** captures the user confirms or rejects. The PC agent watches a screenshots folder and matches by timestamp.

### 2. National
League-wide view: top stories, scores, statistical leaders, standings. Sub-tabs.

### 3. Recruit
Sub-tabs: **MY BOARD · PLAYER RANKINGS · TEAM RANKINGS · PROGRAM STATS**.

- **My board** — each recruit row: monogram avatar, name, position, stars, national rank, commitment-stage pill, and the recruit's **top-3 schools as 22dp circular monogram badges in the recruit's own board order** (left = their #1). The user's school badge is accent-filled. Committed/signed recruits show a single badge.
- **Interest rule (important):** show the interest line only if `rank(mySchool on recruit's board) ≤ currentStageSize`, where TOP 8→8, TOP 5→5, TOP 3→3. In range → `INTERESTED — YOU #n OF THEIR TOP N` in `good`. Out of range → `NOT INTERESTED — YOU #n, OUTSIDE THEIR TOP N` in `ink4`.
- **Commitment stages** (tap the pill to expand quick chips, or open the full editor): `TOP 8 · TOP 5 · TOP 3 · SOFT COMMIT · COMMITTED · HARD COMMIT · SIGNED · DECOMMITTED`. Any change queues.
- **Player rankings** — the full national prospect pool (3,000+; design assumes windowed/lazy rendering). Dense table: watch star, national rank, prospect (avatar + name + pos/stars), OVR, position rank, state rank, archetype, town, state, pipeline, stage, commit points, NIL, and add/remove-from-board. Search by name/town/state/pipeline. Filters: stars, position, home state, stage, and an **OVR range that applies to revealed ratings only** (hidden-OVR prospects are excluded while active), plus "only recruits interested in my school". Board membership is app-local (no save write, applies instantly).
- **Full prospect editor** — clicking a row opens the DynastyOS-style editor: ratings, rankings (national/position/state), archetype, hometown, pipeline, commit points, NIL, revealed flag, star rating, stage, drag-ordered top schools, watchlist. Edits queue.
- **Team rankings / program stats** — class rankings by school with commit counts and points; program-level recruiting stats.

**Dynamic board drift (designed):** after weeks 5, 10 and 15 the agent can generate ranking/rating movement across a random slice of the pool — most small, a few large enough to change star tier and draw new attention — applied through the same queue so it shows up in game and generates Wire stories.

### 4. Team
One team picker in the header scopes **every** sub-tab, so all of this works for any program, not just the user's. Header is identical across sub-tabs: team name (serif 26/16sp) + record/rank meta + team chips + sub-tab row.

Sub-tabs: **SCHEDULE · ROSTER · DEPTH · TRADE · TOP 25**.

- **Schedule** — week, opponent badge + name, meta (home/away, ranked, rivalry, kickoff), result (`W` good / `L` accent / `NEXT` warn with accent border / `—` future). Played games carry a story chip: `STORY →` opens the Wire recap, or `✎ WRITE RECAP` when none exists — that sends the box score plus time-matched screenshots to the story engine, posts the recap to the Wire with the images attached, and flips the chip. In-flight state: `WRITING…` in warn, disabled.
- **Roster** — player list (OVR, name, meta, position, dev trait, sync dot, ✆) with an editor panel: OVR stepper, dev trait (Normal/Impact/Star/Elite), class (FR/FR (RS)/SO/JR/SR), position reassignment, redshirt toggle, release. Every edit queues. ✆ opens a normal conversation on the user's own roster and a **tampering** conversation on a rival's.
- **Depth** — position groups with slot labels (`QB1`, `QB2`, …; QB1 in accent), drag handles to reorder. Reorders queue like any other write and generate a Wire story on apply.
- **Trade** — see below.
- **Top 25** — rankings; tapping a team switches the picker to it.

#### Trade (85-man limit)
Two roster panels, one per team, each with its own team picker. Tap players to move them to either side. **The limit is enforced by prevention, not error states:** each panel header shows `current/85 → projected` with the projected count colored live (`good` under, `warn` at exactly 85, `accent` over). If either side would exceed 85, the submit button becomes a dead outline reading `OVER THE LIMIT — CAN'T QUEUE` and a specific warning names the team and count. There is no failure path to hit — an illegal trade cannot be submitted. Uneven player counts are legal as long as both sides land ≤ 85.

A value read (derived from OVR) shows a balance bar and one of `BALANCED` / `YOU WIN THIS ONE` / `YOU GIVE UP MORE`. Queueing writes a `TRADE` item carrying both post-trade counts.

### 5. Tamper — live AI conversations
**Gated to week 11+.** Before then the section shows a locked state with the weeks remaining. Contact is logged and carries real heat.

Target list: rival players with position, team, OVR, depth-chart placement, and a `CONTACT` action; searchable and filterable by team. Opening a target gives a **texting conversation** with:

- **Dealbreaker** chip at the top — the player's one non-negotiable (e.g. *Championship Contender*, *Immediate Playing Time*, *NFL Pipeline*, *Close To Home*, *Scheme Fit*). If the user never addresses it he stays unconvinced regardless of money; if the user nails it he warms fast.
- **Offer builder** — role promise, promise checkboxes, and **NIL as market value vs budget**: a stepper against his current number with a live verdict `NOT A RAISE` / `A RAISE` / `INTERESTED`, colored accent/warn/good.
- **Recruiting battle** panel — the rival schools also chasing him, plus the user's standing: `NOT IN IT YET` / `IN THE MIX` / `LEADING`.
- **Live interest and heat** readouts that move on each exchange.
- Talking-point chips **and** a free-text composer — the user can tap a suggestion or type anything.
- `SCORING YOUR CALL…` between messages while the model responds.
- A pledge/commit action that unlocks at high interest.

Replies must read like a real 18–21-year-old athlete in a live text conversation — short, guarded at first, reactive to what was actually said and to the current offer. The model is given the player's persona, OVR, position, team, depth-chart placement, dealbreaker, rival suitors, current interest, and the full offer. Outcomes have consequences both ways: a bad exchange raises program heat (and can surface in the Wire); a good one raises interest toward a transfer commitment. Heat past 80 triggers consequences.

Same feature, same behavior, in **both** apps.

### 6. Coach
All-time record, national title count, players drafted (with rounds; RD 1 in warn), career timeline by school, honors, awards/champions/milestones, season history, export career page, and an "off the books" entry point for scandal-style edits.

### 7. Queue — the sync spine
Everything the user approved or edited, from either app, in one list: type tag (`STORY` / `RECRUIT` / `ROSTER` / `TRADE`), title, detail line explaining exactly what will change, and state. Header shows the blocking condition — `GAME RUNNING ON PC — SAVE LOCKED, WRITES HELD`.

Desktop adds `CLOSE GAME + APPLY ALL`: closes the game, unlocks the save, writes a backup/restore point, applies every held item, flips them to `APPLIED`, clears the `● QUEUED` dots everywhere in both apps, and appends to a live log. `LAUNCH GAME` re-locks. Phone edits arrive via the relay; desktop edits skip the relay hop. Same queue either way.

### 8. Export (Windows only)
Two sub-tabs.

- **Draft class → Madden** — departing seniors and early declares as a preview table (player, pos, OVR, year, archetype, round projection), each row showing its scrubbed export identity (`EXPORTS AS R. OKAFOR`). Options: include early declares, scrub names to initials, map archetypes to Madden, carry combine estimates. Generated players only — no real names or likenesses.
- **Roster → Play Now** — snapshot the live dynasty roster as a standalone roster file (this is the DynastyOS "spring training roster" equivalent). Team picker, summary (players / avg OVR / snapshot week), options: use depth chart as played, include injured, freeze progression at today, spring-training mode (drops outgoing seniors so you scrimmage next year's team).

Both run a staged progress sequence (`reading save… → … → writing file…`) and land on a result with the real output path, then log it. The dynasty save is never modified by an export.

### 9. Devices (Windows only) — cloud save
The home server holds the authoritative copy so the save syncs between the gaming PC and the ROG Ally. Machine list (Gaming PC / ROG Ally / Den Server) with hash and last upload.

**One writer at a time, enforced by lease.** Banner reads either `THIS PC HOLDS THE SAVE — SAFE TO PLAY` (good) or `SAVE CHECKED OUT — ROG ALLY, 14 MIN AGO` (accent). `RELEASE TO ROG ALLY` hands the lease over; when the other machine holds it, `REQUEST HANDOFF` plus a `FORCE TAKE — KEEP A RESTORE POINT` escape that turns the other machine's newer version into a restore point rather than discarding it. Cloud version history in the rail. Sidebar shows `!` on DEVICES when this machine does not hold the lease. The phone should surface which device holds the save so the user knows before sitting down.

---

## Architecture to build against

```
Android app ─┐
             ├─► Relay (home server) ──► DB + LLM generation + media store
Windows app ─┘            │
                          └──► cloud save copy + lease
Windows agent ──► reads/writes DYNASTY-*.sav  (only writer)
              ──► watches screenshots/clips folder, uploads matched media
              ──► hashes + uploads save, pulls when stale
```

- **Save access:** PC only. Hash and verify before every read; back up before every write; refuse writes while the game process holds the file.
- **Queue:** append-only, shared, `HELD → APPLIED/FAILED`. Both apps write to it; only the agent drains it.
- **LLM:** story generation and tamper/call conversations run on the home server. Conversations are real multi-turn exchanges with the player persona and offer state in the prompt.
- **Media:** agent-side folder watch, timestamp matching, upload to server; app renders from server URLs.
- **Portraits (designed, optional):** illustrated per-player art generated once from attributes and cached, so a player always looks the same. Three states — **loaded**, **generating** (visible often; must feel intentional, e.g. a tonal avatar block with a subtle pulse, never a broken-image look), and **fallback** = initials on the player's tone color, which must look deliberate enough that a user with no image provider still has a finished-looking app. A regenerate action lives in the player's detail view, not the list. Sizes: 22–24dp list monograms, 30–46dp roster/detail avatars, 52dp call header.
- **Server does not need the game installed.** Prefer parsing on the PC agent and uploading structured data, so the server keeps working when the PC is off.

## Constraints

- Android: implementable in Jetpack Compose with Material 3. No custom rendering or effects that need a custom graphics layer.
- **No licensed logos, team marks, or real player likenesses.** All schools in the design are fictional monograms. If the user wants real logos in their own running build, the badge slots are image slots: the PC agent extracts logo assets from the user's own game install and serves them from the home server, with the monogram as fallback. Do not bundle marks with the app.
- Dark by default; legible in a dim room (evening couch use).
- One-handed operation on the phone; primary actions in thumb reach.
- Media is enhancement, never structure. With no image generation and no screenshots ever taken, every screen must still look finished.

## Files in this bundle

```
README.md                                  ← this file, self-sufficient spec
screenshots/                               ← 13 references, both apps per section
design-reference/DCC Prototype.dc.html     ← live clickable prototype (open in a browser)
design-reference/DCC Tokens.md             ← token spec (prototype wins on conflict)
design-reference/support.js                ← prototype runtime only, not product code
```

Start by opening the prototype and clicking every section in both frames. Then build the Android APK and the Windows exe against this spec.
