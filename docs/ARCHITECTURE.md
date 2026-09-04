# How the two apps are meant to fit together

Recorded because it was implied by the design rather than stated, and it went
missing once already.

## The intended flow

```
  Android app                relay                Windows app              save file
  ───────────                ─────                ───────────              ─────────
  edit a recruit   ──────>   queued   ──────>   Queue section   ──────>   written here
  edit a player                                 holds writes              and only here
                                                until the game
                                                is closed
```

Both apps offer the same editing. Neither the phone nor the relay ever touches
the save. The Windows app on the gaming PC is the only writer, because it is
the only thing on the same machine as the file, and it holds every change until
the game is closed — writing under a running game would be overwritten at best.

## What already exists

The design anticipated this and it is in the code, unimplemented:

- **Queue** (`src/sections/Queue.tsx`) is the write pipeline. It already models
  `HELD` / `APPLIED` / `FAILED` per item, types the work (`RECRUIT`, `ROSTER`,
  `DEPTH`, `PORTAL`, `TRADE`, `STORY`, `OFFBOOKS`), knows whether the game is
  running, and offers *Close game + apply all*. It runs on the sample dynasty
  and applies nothing.
- **Relay** is two settings, `relayUrl` and `relayToken`, and a status light
  that reads `NO RELAY`. Nothing is behind them.

So the shape is right and the substance is missing. That is worth knowing
before either is redesigned.

## What has to be built

1. **A write path on Windows.** The save is zstd frames inside a Frostbite
   container, so writing means re-packing and preserving the container's
   integrity, then verifying by reading the result back and comparing every
   field that should not have changed. Back up first, always.
2. **Editing in the desktop app**, against fields whose meaning is settled.
3. **The relay**: the phone posts queued edits, the PC drains them. It carries
   changes, never the save.
4. **Editing in the Android app**, the same surface as the desktop.

Reading has to come first for each field. A field DCC cannot read correctly is
one it must not write.

## Fields that must be editable

Named as the requirement: **recruiting stage, commit score, school interest**.
None is located yet — see `SAVE-FORMAT.md`. That another tool edits them is
itself evidence they are stored rather than derived.

Beyond those, the same tools expose player profile, ratings, skill-group caps,
mental and physical ability tiers, and portrait selection. Two of their own
warnings are worth keeping in mind, because they mark the edges of what is
known to be safe:

- Home state, top schools, commitment status and signed school are *not*
  offered for editing — not confirmed safe to write.
- Named ability slots are not exposed by the save at all; only each slot's tier
  is.

## A note on portraits

DCC indexes 25,527 portraits from an extracted art folder. The other tool
reports the same 25,527. The asset id it shows for a player —
`Generic_4202_P_T0198_M_8_1` — is byte-for-byte what DCC reads from the player
record, which is a useful independent confirmation that this part is right.
