# Releasing

One command cuts a release; pushing the tag builds and publishes it.

```bash
# 1. Describe the change under "## [Unreleased]" in CHANGELOG.md, then commit.
# 2. Cut the release (patch | minor | major | an explicit x.y.z):
npm run release -- patch

# 3. Push the branch and the tag. The tag is what starts the build.
git push -u origin HEAD
git push origin v0.1.1
```

`npm run release` bumps the version in the root `package.json`, dates the
`Unreleased` section as the new version, propagates the version to both apps,
commits, and creates an annotated tag.

## What the tag build does

`.github/workflows/release.yml` runs on any `v*` tag:

1. **check** — refuses to build if the tag does not match `package.json`, or if
   `CHANGELOG.md` has no section for that version. A release always has notes.
2. **android** — assembles a signed release APK as `DCC-<version>.apk`.
3. **windows** — builds the NSIS installer as `DCC-Setup-<version>.exe`, plus
   `latest.yml` and the `.blockmap` that `electron-updater` needs.
4. **publish** — creates the GitHub Release with that version's CHANGELOG
   section as the body and attaches every artifact.

To rebuild a tag that already exists, run the workflow manually from the Actions
tab and pass the tag.

## Where the version lives

The root `package.json` is the only place a version is edited by hand.
`scripts/sync-version.mjs` propagates it:

| Target | Value |
| --- | --- |
| `apps/desktop/package.json` | the same semver — electron-builder reads it |
| `apps/android/version.properties` | `versionName`, plus a `versionCode` derived as `major*10000 + minor*100 + patch` |

The derived `versionCode` always increases, which is what lets a new APK install
over an older one. Keep minor and patch below 100 and it stays monotonic.

## Why updates never need an uninstall

- **Windows** — the NSIS installer detects the existing install and replaces it.
  App state lives in `%APPDATA%`, not the install directory, and
  `deleteAppDataOnUninstall` is off, so an upgrade keeps your queue, board,
  theme and settings.
- **Android** — the system replaces an installed app in place only when the new
  APK is signed with the same key. Every release APK is signed with the key in
  `apps/android/keystore`, so upgrades work and app data is kept. See that
  directory's README for how to swap in a private key.

## Regenerating shared inputs

```bash
npm run gen:data                # rebuild the seed dynasty (deterministic)
node scripts/sync-assets.mjs    # copy it and the fonts into both apps
npm run gen:icons               # rebuild the Windows icon from the tokens
node scripts/fetch-fonts.mjs    # re-download the bundled typefaces
```

CI fails if the committed dataset does not match what the generator produces, so
run `sync-assets` after any regeneration.
