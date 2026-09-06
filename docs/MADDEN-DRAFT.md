# The Madden 27 draft class file

Notes on `CAREERDRAFTCFBCLASS*`, the file a CFB class becomes on its way into
Madden. Written down as it is found, so it is not lost the way the first
Cooper Barkate screenshot was.

Everything here is measured from two real files. Nothing is assumed.

## The container

The same `FBCHUNKS` header as a CFB dynasty save, and then — unlike the dynasty
save — **no compression at all**. No zlib stream, no `SPBF` stores, no
bit-packing. The whole file is plain records.

```
70 bytes   header, title string "Madden-27-RL1-9081279"
then       455 records of 5876 bytes
```

`455 × 5876 = 2,673,580`, and the header's length word at byte 14 reads
`0x28cbac`, which is that number exactly. So the length field is consistent and
a file that keeps the record count keeps it valid. 389 of the 455 records are
filled; the rest are empty slots.

## One record

| Offset | What |
| --- | --- |
| 0 | Gear and appearance, as **plain-text JSON** — helmet, facemask, gloves, cleats, body type |
| 5632 | First name |
| 5653 | Last name |
| 5674 | Portrait id (`PLACEHOLDER` throughout the classes seen) |
| 5710 | **Position** |
| 5711–5789 | The ratings, **one byte each, unpacked** |
| 5834–5842 | A few 16-bit fields, not yet identified |

## Position, byte 5710 — the same enum CFB uses

Byte 5710 is the position, and its values are **exactly `POSITIONS` from
`positions.ts`, in order** — the list DCC already had for the dynasty save. No
translation is needed between the two games at all.

| Value | Position | n | Weight | Height | What the group is best at |
| --- | --- | --- | --- | --- | --- |
| 0 | QB | 27 | 212 | 6ft2 | throwing |
| 1 | HB | 28 | 206 | 5ft10 | speed and carrying |
| 2 | FB | 1 | 215 | 5ft11 | — one in the class |
| 3 | WR | 78 | 193 | 6ft0 | catching — Barkate is here |
| 4 | TE | 8 | 247 | 6ft4 | catching, and blocks |
| 5–9 | LT LG C RG RT | 50 | 309–320 | 6ft3–6ft6 | run blocking |
| 10–11 | LE RE | 47 | 253–265 | 6ft4 | tackling, block shedding |
| 12 | DT | 24 | 310 | 6ft3 | block shedding |
| 13–15 | LOLB MLB ROLB | 36 | 233–237 | 6ft1–6ft3 | tackling |
| 16 | CB | 53 | 190 | 6ft0 | man coverage |
| 17–18 | FS SS | 22 | 199–206 | 6ft1 | zone coverage |
| 19 | K | 5 | 178 | 5ft11 | kicking |
| 20 | P | 5 | 205 | 6ft1 | kicking |

Two details confirm the order rather than assume it. **Centre is the shortest
lineman** — value 7 averages 6ft3 where the tackles at 5 and 9 average 6ft6,
which is what the enum predicts and a different arrangement would not. And
**value 19 is named**: Tate Sandell, Lucas Carneiro, Brock Taylor, Mateen
Bhaghani and Colton Boomer, five real placekickers. So 19 is K and 20 is P, and
no screenshot of a kicker was needed to say so.

### The one value past the end

Value 21 is a sixth group of five offensive linemen — Andrew Gentry, Nathan
Elwood, Luke Vonderhaar, John Pastore, Matthew McCoy — 285 to 325 lb, blocking
in the low sixties where the real line is high sixties, and awareness of 41
against the line's 58. CFB's list ends at P, so this is a position Madden has
and CFB does not, and **long snapper** is the obvious candidate.

It cannot be confirmed from the ratings, because Long Snap reads 1 for all 389
players including these five — CFB has no long-snapping rating to export, so
everybody comes across with the floor value.

## What these files are not

`CAREERBUCS` is a Madden career save — 5.6 MB, zlib from byte 82, inflating to
20 MB, and structured like the dynasty save rather than like a draft class. It
does **not** contain the class in `CAREERDRAFTCFBCLASS1`: Barkate, Mateer and
Uiagalelei are all absent from it. It is a career from before the import.

## The career save, and what adding Madden would actually cost

A Madden 27 career save is the *same format as a CFB dynasty save*, not a
cousin. Same `FBCHUNKS` wrapper, same zlib from byte 82, same `SPBF` store
headers, same `BSFT` block describing each store's own row size and member
offsets. Pointing DCC's reader at one originally found **nothing at all**, and
the reason was a single hard-coded number: `scanStores` required schema major
486, which is CFB's. Madden 27 declares **620**.

The version is now read off the save instead. With that one change DCC's
existing reader finds **92 stores in the Bucs career save**, and **38 of them
are stores CFB has too** — `TeamStore`, `DepthChartStore`, `HistoryEntryStore`,
`PlayerSeasonStatRecordStore`, `PlayerCareerStatRecordStore` among them.

So the structural half of a Madden reader already exists and always did. What
does not transfer is the meaning: every bit offset inside a record was derived
against CFB and would have to be derived again, which is the part that took this
project months. Two things make that cheaper the second time — the method is
known, and the draft class shows Madden 27 storing ratings **unpacked, one byte
each**, where CFB bit-packs everything.

The equivalent of `C27_486_1.gz` for Madden — its schema file from the game
install — would do for Madden what it did for CFB: name every member of all 92
stores, without giving away a single offset.

## Two career saves, a week apart

The second Bucs save is what turns one file into a method. What it establishes:

### Everything moves, so nothing may be addressed by offset

Every store in the later save sits **exactly 51,424 bytes** earlier than in the
first — all 91 of them, by the same amount, and one store
(`EvaluateCoachOffersRequestStore`) is present in the earlier save and absent
from the later one. A first attempt at diffing indexed the second save with the
first save's offsets and reported that every row of every store had changed,
which was nonsense produced by that shift.

So a Madden reader must locate every store by name in the file it is reading,
exactly as `storeTable` already does. No offset survives a save.

### What is live state and what is static

Done properly — locating each store in its own file, then comparing row for row
— **36 of 91 stores changed and 55 are byte-for-byte identical.** That split is
the most useful thing the second save gives: it says where the league's living
state is kept and what is fixed reference data not worth decoding.

The largest movers:

| Store | Rows changed | Row size |
| --- | --- | --- |
| `HistoryEntryStore` | 62,430 of 62,430 | 24 B |
| `DraftPickStore` | 672 of 672 | 16 B |
| `TeamStore` | 34 of 35 | 664 B |
| `PlayerContractStore` | 612 of 1,280 | 40 B |
| `PlayerSeasonStatRecordStore` | 32 of 322 | 24 B |

`PlayerSeasonStatRecordStore` moving in exactly **32** rows is worth noting:
that is the number of teams in the league, not the number of players, and it is
the same shape of trap as CFB's stat store, which turned out to be an all-time
record book rather than a leaderboard. It should be treated as suspect until
proven otherwise.

### The reference tag

`HistoryEntryStore` rows carry four-byte handles with the tag **`0x2118`** —
the same two-byte-tag, two-byte-index shape as CFB, where the player tag is
`0x213e`. Its 62,430 rows are all populated and all changed in a single week,
which is what a rolling log looks like.

### Names are not stored the way CFB stores them

CFB's roster was found because its player records sit at a fixed stride with the
names inside them. Madden's do not: a sweep for capitalised words at a repeating
stride finds no run longer than two, and the gaps between name-like strings are
spread across 43, 26, 62, 18 and 14 bytes with no winner. The names live in a
variable-length pool, so the technique that opened CFB will not open this. That
is a finding, not a failure — it says the roster has to be reached through the
references rather than by reading the strings.

## `DraftPickStore`, decoded

672 rows of 16 bytes: **3 future drafts × 7 rounds × 32 teams**. Each row is one
unexercised pick, and the player slot is empty in all 672 — this is pick
*inventory*, not draft results. Asking for a list of drafted players would not
have helped, which is worth recording because it was the obvious thing to ask
for.

| Bytes | Field |
| --- | --- |
| 0–1 | Draft year tag: **16 = 2028, 24 = 2029, 32 = 2030** |
| 2–3 | `round × 2080 + slot`, so round is `⌊lo / 2080⌋ + 1` and the slot is `lo % 2080` |
| 4–7 | The selected player. **Zero in every row** — a pick that has been used leaves this store |
| 8–11 | Original team, tag `0x2e5c` |
| 12–15 | Current owner, tag `0x2e5c` |

Rows are grouped by team, not by pick order. A first attempt assumed the 224
rows of a draft ran in overall-pick order and looked up slots 23, 55, 87 and so
on; the owners that came back were unrelated, which is what said the assumption
was wrong.

The overall pick number is `slot + 1 + (round − 1) × 32`.

### Verified against the game's own screen

The user's draft-capital screen lists Tampa Bay holding 2028 picks 23, 55, 87,
119, 151, 183 and 215, and seven more in each of 2029 and 2030. Read back out of
the save:

```
2028 Round 1 Pick 23    2028 Round 5 Pick 151
2028 Round 2 Pick 55    2028 Round 6 Pick 183
2028 Round 3 Pick 87    2028 Round 7 Pick 215
2028 Round 4 Pick 119
```

**Seven of seven, and 21 picks owned in total**, matching the screen exactly.

### What this anchors

- **Tampa Bay is team 6.** The user's team, which every other read hangs off.
- **`0x2e5c` is the team tag**, and team indices run 0–34 with 8, 9 and 18
  missing — 32 real teams in a 35-row `TeamStore`, the same shape as CFB's team
  table carrying non-school rows.
- **Trades are visible.** A pick whose two team references differ has been
  traded: 54 such picks in the earlier save, **73 in the later one**. A week of
  trading, readable without decoding a single trade record.

One thing not to trust yet: for 2029 and 2030 the game shows the pick as TBD and
the slot field holds a value anyway — Tampa Bay's reads 15 for most of 2029 and
23 for most of 2030, with round 7 disagreeing in both. Those are stale or
provisional and should not be shown as real pick numbers.

## `TeamStore`: one field found, and why the rest is not worth grinding

35 rows of 664 bytes with **319 members**. Far denser than CFB's team record, and
this is where having no member names starts to cost real time.

### Found and verified

**Byte 623 is the roster size.** Tampa Bay reads 59 in the later save, matching
the game's own "ROSTER SIZE 59 / 75", and the three non-team rows read 0 in both
saves. Across the league it runs 59–77.

It also dates the saves: the league-wide roster total falls from **2,359 to
2,245** between them, 114 players released, and `CutDayRequestStore` is among
the stores that changed. The two saves straddle cut day.

### Searched for and not there

**Cap room is not stored.** The screen shows Tampa Bay $63.2M and Chicago
$9.37M. Searched byte-aligned as 32-bit integers, bit-aligned at every offset
for widths 20 to 32, and as floats — nothing in the row is $63.2M, and no
candidate also gives another team $9.37M. Like the player overall in the draft
class, it is computed at display time from what *is* stored.

**Wins and losses were not found, and the search was wrong-headed.** The test
was for two byte columns summing to the same games-played total for all 32
teams. The first version returned 519 pairs, all degenerate: an all-zero column
plus a constant column sums to a constant. Tightened to require both columns to
vary and the total to rise between the two weeks, it returned none — because
these saves are in the **offseason**, where no games are played between them and
the test has nothing to detect. Wins and losses may well be in the row; this
just cannot find them from these two files.

### What the diff does say

87 of the 664 byte columns change between the two saves; the other 577 are
static. The changed bytes cluster in clean four-byte groups — 360–363, 412–415,
420–423, 456–459, 472–475 — that are neither plain integers nor floats, so they
are bit-packed fields spanning byte boundaries and need their widths before they
mean anything.

### The honest recommendation

`TeamStore` is the wrong thing to grind next. 319 anonymous members is exactly
the shape that a schema makes easy and that trial and error makes slow, and every
field needs its own answer key. `DraftPickStore` fell in one pass because it has
five members in sixteen bytes and its structure alone told the story.

The one anchor that would open `TeamStore` cheaply is **a standings screen
showing all 32 win-loss records**. Thirty-two known values matched against the
row is the same method that found the recruiting class ranking in CFB, and it
turns a guess into a search.
