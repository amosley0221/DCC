# DCC Design Tokens — implementation spec

Two themes sharing one token schema. Default: `night`. Theme is a user setting (Settings → Appearance), persisted; both must be fully supported. All values are Compose/M3-safe (solid colors, one linear gradient, standard elevation).

## Fonts
- night: display/serif = **Newsreader** (Google Fonts), mono = **IBM Plex Mono**, sans = **Public Sans**
- field: display/serif = **Zilla Slab**, mono = **Courier Prime**, sans = **Public Sans**
- sans is shared: body copy in chat bubbles, badges, status bars.

## Color — theme `night` ("Night Wire", default)
- bg0 `#131110` — screen background
- bg1 `#0E0C0B` — bars (top app bar surface, bottom nav, log panels)
- surface `#171412` — cards
- surfaceLine `#262220` — card borders
- line `#2A2624` — hairline dividers, progress tracks
- rule `#EDE6DA` — 2px header rule under screen titles
- ink `#EDE6DA` — primary text
- ink2 `#B5ACA0` — body/secondary
- ink3 `#8D857A` — metadata, labels
- ink4 `#6E675E` — disabled/inactive tabs
- accent `#B33A2B` — heat, kickers, active-tab indicator, badges, at-risk
- onAccent `#EDE6DA`
- good `#7D8F6A` — positive status
- warn `#C9873A` — held/warning status
- btnBg `#EDE6DA`, btnInk `#131110` — primary (filled) button
- effectBg `#1E1A17`, effectInk `#C8BFB2` — proposed-effect callout (2px left border accent)
- heatBoxBg `#1E1613` — heat meter panel on Call (bordered accent)
- heatFill: solid `#B33A2B`

## Color — theme `field` ("Field Office")
- bg0 `#1B241F`, bg1 `#141B17`
- surface `#222D26`, surfaceLine `#34443B`, line `#34443B`, track `#141B17`
- rule `#EFE7D5`
- ink `#EFE7D5`, ink2 `#C9C2AC`, ink3 `#8FA294`, ink4 `#6D7F72`
- accent `#C4502B`, accentSoft `#D98A4A`, onAccent `#EFE7D5`
- good `#7A8F5F`, warn `#C9873A`
- btnBg `#2A2318`, btnInk `#EFE7D5`
- Hero/actionable card is inverted paper: heroBg `#EFE7D5`, heroInk `#2A2318`, heroInk2 `#4C4436`, heroMeta `#8A8069`, effectBg `#E3D7BD`, effectInk `#4C4436`
- heatFill: gradient 90° `#7A8F5F → #C9873A → #C4502B`
- (night hero card = ordinary surface tokens; only field inverts.)

## Type scale (dp/sp)
- screenTitle: serif 600, 27sp / 1.0
- heroHeadline: serif 500, 20sp / 1.28
- headline: serif 500, 17sp / 1.32
- rowTitle: serif 500, 15.5sp
- bodySerif (story text): serif 400, 13.5sp / 1.62
- body (chat, descriptions): sans 400, 14sp / 1.5
- kicker: mono 600, 10sp, tracking 2sp, UPPERCASE
- metaMono: mono 400, 10–11.5sp, tracking 0.5–1sp
- button: mono 600, 12sp, tracking 1.5sp, UPPERCASE
- tab: mono 600, 11sp, tracking 1.5sp, UPPERCASE
- heatValue: mono 600, 22sp

## Spacing (4dp scale)
4, 8, 12, 16, 22, 28. Screen H-padding: 16dp (cards) / 22dp (editorial text block). Card padding: 16dp H, 13–15dp V. Card gap in lists: 10dp. Section gap: 12–14dp.

## Radii
- night: buttons 4dp, cards 6dp, chat bubbles 14dp
- field: buttons 6dp, cards 6dp, chat bubbles 12dp
- chips/filters: full (99dp); badges: full; progress tracks: 2–4dp

## Component states
- Primary button (APPROVE): filled btnBg/btnInk → pressed: 88% alpha overlay of bg0 → disabled: 38% alpha
- Secondary button (DISMISS): 1dp outline btn2Line, text btn2Ink → pressed: 8% ink overlay
- Bottom tab: inactive ink4 → active ink + 2dp accent underline (22dp wide); Queue badge always accent
- Filter chip: selected = filled btnBg/btnInk; unselected = 1dp surfaceLine outline, ink3 text
- Recruit interest bar: good ≥70, warn 50–69, accent <50 (5dp track, line/track color)
- Queue states: HELD = warn, APPLIED = good, FAILED = accent (mono 600 10sp, tracking 1.5)
- Heat meter: track = line/track token, fill = heatFill; threshold at 80 → past threshold the Call heat panel border and value pulse accent (Compose `animateColor`, no custom rendering)
- Touch targets ≥ 44dp; primary actions (approve/dismiss, reply chips) anchored bottom, thumb reach

## Heat semantics
0–49 calm · 50–79 elevated (shown persistently on Wire header + Call panel) · ≥80 consequence trigger (portal-board event). One value program-wide; Call shows per-call delta.

---

# Media (v2)

Media is enhancement, never structure. Every layout below is the no-media layout plus an optional slot; nothing reserves empty space when media is absent.

## Portrait component (`PlayerPortrait`)
Circular, 1:1. Sizes: **sm 40dp** (Board rows, story kickers), **md 56dp** (Call header), **lg 72dp** (full-size / specimen). Border: 1dp surfaceLine over art.
States:
- **loaded**: cached card art, circle-cropped, `ContentScale.Crop`.
- **generating**: 1.5dp **dashed** ring in ink4, transparent fill, centered "···" (mono 600, ink4). Ring rotates 360° / 8s linear, dots alpha-pulse 0.4→1 / 1.2s. Never an M3 spinner.
- **fallback**: solid tone circle + initials (serif 500; 14sp at 40dp, 18sp at 56dp, 24sp at 72dp; ink color). Tone = `tones[hash(fullName) % 6]`, stable per player.
  - night tones: `#3D2F2A #2F3A34 #33313F #3F382A #2A3340 #3A2A33`
  - field tones: `#3A4536 #4A3D2E #37453F #453231 #3C4030 #31404A`
- **Regenerate**: long-press any portrait → bottom sheet: Regenerate portrait / View full size / See in Reel. No visible affordance in primary views.

## Story media
- No image (common case): card is text-only — kicker, headline, body. This is the baseline layout.
- One image: 16:9 banner at top of card, full-bleed to card edges (top corners = card radius), 150dp tall at 390dp width, caption strip optional (mono 400 10sp, ink3).
- Several images: primary 16:9 player/banner + thumbnail row below, equal-width tiles 64dp tall, 8dp gap, radius 4dp; selected thumb = 2dp accent border. Count line under row: mono 10sp ink4.
- Suggested (matched by time): dashed 1dp border box (heroMeta color on hero card, ink4 elsewhere), radius = button radius; label `N CAPTURES MATCHED BY TIME · <timestamp>` mono 600 9.5sp; 88×56dp thumbs; actions ATTACH (outlined, ink) / IGNORE (text, meta color). Disappears entirely once resolved.

## Clips
- Inline player: 16:9, radius = card radius (6dp), centered 54dp play circle (btnBg/btnInk), `CLIP` chip top-left (mono 600 9sp, bar bg, 1dp line border), duration badge bottom-right (mono 600 10sp, bar bg, radius 3dp), 3dp scrub track (track/accent).
- Any thumbnail that is a clip carries the ▶ + duration badge — that badge is the only still-vs-clip differentiator, at every size.

## Reel (media view)
Mode of Wire (`STORIES · REEL` switch in Wire header) — not a 5th tab. 3-column square grid, 6dp gap, 4dp radius tiles, grouped by week (`WEEK N · OPPONENT` mono kicker). Filters: ALL / CLIPS / UNATTACHED chips. Tile overlay for attached media: `→ <story>` chip. Empty state (no captures ever): mode switch still present; Reel shows a single mono line "captures from your PC land here" — no placeholder grid.

## Windows agent addition
MEDIA WATCHER row (full-width card): watched folder path (mono), `N stills · N clips picked up`, upload status dot (good = current, warn = behind) + last upload time. Log lines for matches: `media ↑ <file> matched → story #N (Δ 41s)`.

## Media loading treatment
Loading tiles/banners: solid surface (no shimmer) that crossfades 200ms to the image on load. Failed load: collapses the slot entirely (story reverts to text-only layout) — never a broken-image placeholder.

---

# Tampering (v5) — both apps

## Gate
Window opens **regular-season week 11**. Before that the section is visible but contact is locked: warn-colored gate strip + progress bar (`TAMPERING OPENS WEEK 11 — n WEEK(S) OUT`); at/after wk 11 the strip flips to accent (`CONTACT IS LOGGED AND CARRIES REAL HEAT`). Week comes from the save; prototype exposes a stepper.

## Targets
All non-user rosters, sorted by OVR. Columns/rows: OVR · avatar · name · POS · team · **DEPTH** (`WR#2`; warn when depth > 1 — buried players are the receptive ones) · INTEREST (0–100, `—` before first contact) · action (`✆ TEXT` accent → `OPEN` → `BURNED` ink4). Filters: search + team chips (phone) / search + team chips + table (desktop). Both apps share convo state.

## Conversation
Texting, not a call: rounded asymmetric bubbles (14/4 radius), theirs = surface, mine = filled. Voice is a real 18–21-year-old — lowercase, fragments, "fr/idk/ngl", max two short lines; the model is told the player's OVR, depth slot, age, current program, and the standing offer. Typing indicator while in flight.
**Offer builder rail** (left on phone, drives the model): ROLE PROMISE (Backup / Rotational / Day-One Starter / Featured Playmaker, selected = accent), PROMISES checkboxes (guaranteed reps, NFL development plan, his jersey number, collective intro), NIL stepper in dynasty points with a fill bar and his current figure. Empty hype with no offer moves nothing.
**Live read**: INTEREST bar + value (good ≥70 / warn ≥35 / ink3 below), HEAT value, depth-chart note, standing (`LEADING` / `IN THE MIX` / `NOT IN IT YET`).

## Consequences and rewards
Every exchange returns interestDelta (−15…+20), heatDelta (0…+8) and a coach's-read note line. First contact with anyone = **heat +3**. Interest ≥ 70 unlocks `GET THE PLEDGE — QUEUE PORTAL COMMITMENT` (accent, full width) → enters the shared queue as a PORTAL write carrying role + NIL, applied by the PC like any other effect. A badly-handled exchange can make the player **report the contact**: heat +12, convo status BURNED (dead, no further texts), and a COMPLIANCE story auto-posts to the Wire with a pending penalty effect.

# Sections restructure (v4)

## Navigation
Bottom tabs (5, M3 max): `WIRE · RECRUIT · TEAM · COACH · QUEUE` (badge on Queue). Tab labels mono 600 10.5sp tracking 1. **Call is contextual**: ✆ icon (ink3, 44dp target) on every player/recruit row and player-centric Wire story opens the Call screen; heat stays on Wire header + Call panel.

## Section contents
- RECRUIT: My Board · Prospects · Class Ranks (sub-nav). All v3 recruiting specs live here (status levels, top-3 badges, interest rule, editor + filter sheets, add/remove).
- TEAM: Schedule · Roster · Depth · Rankings. Schedule: team picker (`ANY TEAM ▾`) to browse any program's schedule; game row = WK · opponent badge+name · meta (home/away, ranked, rivalry, kickoff) · result (W good / L accent / NEXT warn with accent border / — future). Played games carry a story chip: `STORY →` (ink3 outline, opens the game's Wire recap) or `✎ WRITE RECAP` (ink, btn2Line outline) when none exists — WRITE RECAP posts box score + time-matched captures to the story engine (Claude on the home server); the recap lands in the Wire with screenshots attached and the chip flips to `STORY →`. Generating state: chip shows `WRITING…` (warn, disabled). Depth chart: position chips; slot rows `QB1/QB2…` (slot mono, QB1 accent), drag handle ≡ to reorder — reorders queue like all save writes and generate a Wire story on apply. Roster + Rankings as specced in v3.
- COACH: stat trio (all-time record / natl titles (warn) / players drafted), career timeline by school, players-drafted list (round in warn for RD 1), honors, `EXPORT CAREER PAGE`, OFF THE BOOKS entry. Season history absorbed here.

## Windows app (full parity)
Desktop is a full workspace, not just an agent: same five sections in a left sidebar (`WIRE · RECRUIT · TEAM · COACH · QUEUE`), same data, same editing. Layout goes wide: content table + right rail (detail editor on Recruit, Top 25 + coach summary on Team). Tables: header row mono 600 9sp tracking 1.5 on bar bg; cells 10–13sp, hairline row borders; selected row = surface bg. Every editable control matches the phone spec (status chips, top-schools list, OVR stepper).
Sync rule: **only this machine writes the save.** Desktop edits enter the same queue but skip the relay hop; phone edits arrive via relay and appear live. Agent status (save verified / game running / relay+phone) is a persistent 3-dot strip pinned at the sidebar bottom. Writes held while the game runs, backup before every apply.

# Recruiting hub + Season (v3 — surfaces now live under the v4 sections)

## Board hub
Board tab = hub with mono sub-nav under the header: `MY BOARD · PROSPECTS · RANKINGS · ROSTER · SEASON`. Active item: ink + 2dp accent underline; inactive ink4. Horizontally scrollable.

## Recruit status
Levels (ordered): `TOP 8 → TOP 5 → TOP 3 → SOFT COMMIT → COMMITTED → HARD COMMIT → SIGNED`, plus `DECOMMITTED` (special).
- Status chip: outlined pill, mono 600 9.5sp, tracking 1. Color: SIGNED/HARD COMMIT/COMMITTED = good; SOFT COMMIT = warn; TOP 3/5/8 = ink3; DECOMMITTED = accent.
- Quick edit: tap status chip in a Board row → row expands with the full chip row (selected = accent-filled) + `FULL EDITOR →`.

## Top-3 school badges + interest rule (Board rows)
- Uncommitted recruits: row shows their top 3 schools as 22dp circular monogram badges, in the recruit's own board order (left = #1). Fictional monograms only, never licensed marks. My school badge = accent fill + accent ring; others = tone fill + surfaceLine ring.
- Committed/Signed: single school badge (the commitment), no top-3 row.
- Interest indicator: show iff `rank(mySchool on recruit board) ≤ currentStageSize` (TOP 8→8, TOP 5→5, TOP 3→3). Shown: mono 600 9sp, good color, `INTERESTED — YOU #n OF THEIR TOP N`. Not within cutoff: ink4, `NOT INTERESTED — YOU #n, OUTSIDE THEIR TOP N`. Committed elsewhere: accent.
- Full editor: bottom sheet — status chip grid, TOP SCHOOLS ordered list (drag handle ≡, remove ✕, `+ ADD SCHOOL`, my school row bordered accent), queue notice, `SAVE TO QUEUE` / `CANCEL`.

## Sync contract (critical path)
Every edit (recruit status, top schools, roster OVR, off-the-books boost, story effect) creates a queue entry on the phone: chip gains `● QUEUED` (warn dot, mono 9sp) until the PC agent confirms the write. Flow: Android edit → relay → agent Apply Queue (grouped by type, `FROM ANDROID <time>`) → backup → write on save unlock → confirmation clears the dot. Off-the-books items require an extra confirm on the agent (`NEEDS CONFIRM`, accent).

## Prospects (national pool, 3,000+)
Search field + inline filter chips (POS, STARS, STATE, STAGE, OVR, `⚙ ALL` opens the full sheet); active filter = filled chip with ✕. Full filter sheet: STARS multi-select row (5★–1★), POSITION chips (QB RB WR TE OT IOL EDGE DT LB CB S K/P), HOME STATE multi-select dropdown, STAGE dropdown, OVERALL dual-handle range (applies to revealed OVR only — hidden-OVR recruits are excluded while active), "only recruits interested in my school" toggle (uses the interest cutoff rule), RESET, `SHOW N RESULTS`. Result count line (mono 9.5sp ink4). Row: natl rank (mono, 34dp col) · name serif 14.5 · stars · meta line (pos · height · town, state · stage) · trailing `+` add-to-board or `✓ BOARD` + `−` remove (44dp targets). Board membership is app-local (phone DB, no save write — applies instantly, no queue). Expanded board rows also carry `− REMOVE`.

## School logos
Real team logos are licensed art the design can't ship. The badge slots (22dp circles, plus any larger schools UI) are image slots: the PC agent extracts each team's logo asset from YOUR game install and uploads it to the home server with the save data; the app renders that image in the slot, falling back to the fictional monogram when no asset exists. Same three states as portraits (loaded / fetching / monogram fallback).

## Rankings
Segmented: TOP 25 / PLAYERS / STANDINGS. Team row: rank (mono; your row = accent border + rank in accent + `YOU` tag) · school serif · record · trend (▲ good / ▼ accent / — ink4). Player rankings: NATL/position filter; row: rank · name · school · OVR (warn).

## Roster
Position-group chips + OVR sort. Row: OVR (mono 600 14sp; 90+ = warn tone, else ink2) · name · meta (pos · yr · dev trait) · ✎. Edit-in-row: `SET OVR` stepper (−/+, 44dp targets), queues like everything else.

## Season
Cards: LIFETIME coach record (record serif 26sp, schools/seasons/titles line, per-school history) · current season summary with milestones (tag column: CHAMP good / MILE warn / AWARD ink3) · award races · `EXPORT SEASON AS PAGE` (outlined, generates shareable static page on home server) · OFF THE BOOKS panel: dashed accent border, boosts with QUEUE buttons, disclosure line — every use posts a scandal-risk Wire story and +3 heat.
