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

## Position, byte 5710

22 distinct values across the 389 filled records, and the rating profiles split
by it exactly as football would:

- Six values (5, 6, 7, 8, 9, 21) are high in *both* byte 5712 and byte 5738,
  mean 62–71 and 64–70. Two blocking ratings and the offensive line.
- One value, 0, with 27 players, reads **75** at byte 5766 where every other
  group reads 11–21. A throwing rating, and those 27 are the quarterbacks.
- Value 3 is the largest group, 78 players, fast (byte 5718 mean 92) and no
  blocking at all. Cooper Barkate is in it, and he is a receiver.

Which value is which position still needs one player named on screen.

## What is still needed

**One screenshot of a single player's card in Madden**, showing his position and
his ratings. That is all. With the numbers beside the bytes below, most of the
block labels itself in one pass, because the values are distinctive enough to
line up unambiguously.

Cooper Barkate is **record 72**, position value 3. His bytes:

```
5717: 63   5718: 91   5719: 88   5720: 69   5721: 69   5722: 36   5723: 27
5724: 68   5725: 67   5726: 79   5727: 78   5728: 88   5729: 30   5730: 56
5731: 39   5732: 90   5733: 69   5734: 89   5735: 27   5736: 31   5737: 59
5738: 22   5739: 127  5740: 28   5744: 75   5750: 73   5751: 77   5752: 76
5753: 72   5758: 76   5759: 89   5760: 67   5761: 92   5762: 59   5763: 53
5772: 88   5773: 61   5788: 66
```

The 127 at 5739 is almost certainly a cap or sentinel rather than a rating.

The second thing needed cannot be done here at all: **whether Madden accepts a
file DCC has written**. There is no Madden in this environment, so the loop has
to be write, import, report back. Nothing found so far suggests a checksum, but
absence of evidence is not evidence here.

## What these files are not

`CAREERBUCS` is a Madden career save — 5.6 MB, zlib from byte 82, inflating to
20 MB, and structured like the dynasty save rather than like a draft class. It
does **not** contain the class in `CAREERDRAFTCFBCLASS1`: Barkate, Mateer and
Uiagalelei are all absent from it. It is a career from before the import.
