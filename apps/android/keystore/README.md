# Signing key

`dcc-release.jks` signs every release APK. Android only lets an APK install over
an existing one when both are signed by the **same** key — so this key is
committed, and the key is what makes "update without uninstalling first" work.

| | |
| --- | --- |
| Keystore | `keystore/dcc-release.jks` |
| Store password | `dynastycommandcenter` |
| Key alias | `dcc` |
| Key password | `dynastycommandcenter` |
| Validity | 100 years |

## The tradeoff

This repository is public, so anyone can sign an APK with this key. For a
personal sideloaded companion app distributed only through this repo's own
releases that is a small risk: it matters only if you were tricked into
installing an APK from somewhere else. Nothing here is published to Play.

## Using your own key instead

CI prefers a private key when the repository has one, and falls back to this
file otherwise. To switch, add these repository secrets
(Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 your-key.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | store password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

Decide before you install the first build: switching keys later means
uninstalling the app once, because Android rejects an update signed by a
different key.
