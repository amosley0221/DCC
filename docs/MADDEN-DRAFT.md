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
