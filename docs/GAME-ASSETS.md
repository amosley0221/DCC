# Reading the game's art

Notes on getting logos, portraits and coach faces out of an EA College Football
27 install. This documents what has been established, including the things that
turned out to be wrong, because a wrong result that looked right cost more time
here than any of the unsolved problems.

Nothing extracted from the install is committed to this repository. The art is
EA's; it stays on the machine that owns the game, and DCC reads it at runtime.

## What the install looks like

From a scan of a real install (`E:\Games\EA SPORTS College Football 27\Data`,
50.5 GB, 337 files in 28 directories):

| Extension | Files | Bytes |
| --- | --- | --- |
| `.cas` | 271 | 50,399,985,664 |
| `.toc` | 48 | 107,392,652 |
| none | 2 | 1,687,229 |
| `.digest` | 16 | 16,448 |

The art is not stored as files. It lives inside the `.cas` blobs and is
addressed by the bundle tables, so the tables have to be read first.

Note that `Data` is the folder that contains `layout.toc` — there is no `Data`
folder *inside* it. The install finder looks for `layout.toc` next to a
`superbundlelayout` directory rather than assuming a fixed depth.

## Obfuscated tables

A table that begins with `0x00D1CE00` or `0x00D1CE01` — "DICE" — is scrambled.
The layout is fixed, and **the key is in the file**:

| Offset | Length | Meaning |
| --- | --- | --- |
| `0x000` | 4 | magic, `0x00D1CE00` or `0x00D1CE01` |
| `0x128` | 257 | the key, each byte masked with `0x7B` |
| `0x22C` | rest | the payload, XORed with the key repeating |

So `plain[i] = file[0x22C + i] ^ (file[0x128 + (i % 257)] ^ 0x7B)`. That is
exact and takes about four milliseconds.

### Why this is worth stating plainly

DCC originally recovered the key by cryptanalysis instead — index of
coincidence to find the period, then per-column byte scoring. It worked, in the
sense that it produced readable output, and it was wrong anyway:

- It ran for about thirteen minutes on a full install, on the thread that draws
  the window, so the app appeared hung.
- **It was not reproducible.** The same `layout.toc` was reported as a 17-byte
  key on one run and a 13-byte key on another. For a repeating XOR at most one
  of those can be true, and both produced clean-looking asset names. A search
  over key lengths has enough freedom to fit a wrong key to real data and still
  score well, which means a plausible decode is not evidence of a correct one.

The search is still in the code as a fallback for a file that carries no usable
key, held to the same acceptance bar, but the scan now records whether the
answer was **read** or **searched for**. A guess should never be presented in
the same words as a reading.

`check-assets.cjs` builds files with a known plaintext and asserts the header
path is exact and does no searching, that the fallback still recovers 17- and
257-byte keys byte-exact, and that noise carrying the DICE marker is refused.
CI runs it.

## `layout.toc`

Decoding it gives the superbundle list. The ones that matter for art:

- `Win32/imageassetlibrarysb` — logos and portraits
- `Win32/cranium_sb` — player heads and faces
  (`football_installpackage_cranium`, 2.8 GB)
- `Win32/coachcontent_sb`, `Win32/coachcontentlaunch_sb` — coach content

Also present: `Win32/cameradirectorsb`, `Win32/expansionteamslaunch_sb`,
`Win32/frontendmatchlifesb`, `Win32/frontendscenessb`, `Win32/globals`,
`Win32/high_movies`, `Win32/launch_common`.

## `initfs_Win32`

Carries the DICE magic but does not yield to the header key or to the search.
It is genuinely encrypted rather than obfuscated — an earlier partial decode of
it contained the word `encrypted`. It is not needed for art and is not pursued.

## Still to do

1. Read `cas.cat` — the catalogue that maps an asset to a `.cas` file, offset
   and length.
2. Resolve names from the bundle tables to catalogue entries.
3. Parse the Frostbite texture header.
4. Decode BCn (block-compressed) pixel data.
5. Show logos, portraits and faces in the app, read from the user's install at
   runtime.
