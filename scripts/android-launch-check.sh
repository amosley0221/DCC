#!/usr/bin/env bash
# Installs the release APK on a running emulator, opens it, and fails if it
# crashes or dies. This is the check that catches a startup crash — the class of
# bug where the APK installs perfectly and only breaks when a person opens it.
#
# Runs as one command: android-emulator-runner feeds its `script:` to sh line by
# line, so multi-line shell constructs have to live in a file like this one.
set -euo pipefail

APK=${1:?usage: android-launch-check.sh <apk>}
PKG=com.dcc.app
ACTIVITY=$PKG/.MainActivity
SETTLE_SECONDS=${SETTLE_SECONDS:-25}

echo "==> installing $APK"
adb install -r "$APK"

adb logcat -c
echo "==> launching $ACTIVITY"
adb shell am start -W -n "$ACTIVITY"

# Watch it rather than sleeping blindly: a crash should fail fast, and the app
# has to still be alive at the end.
crashed=""
for i in $(seq 1 "$SETTLE_SECONDS"); do
  if adb logcat -d | grep -qE "FATAL EXCEPTION|ANR in $PKG"; then
    crashed="crash"
    break
  fi
  if ! adb shell pidof "$PKG" > /dev/null 2>&1; then
    crashed="exited"
    break
  fi
  sleep 1
done

adb logcat -d > logcat.txt

if [ -n "$crashed" ]; then
  echo "::error::The app $([ "$crashed" = crash ] && echo crashed on launch || echo exited after launch)."
  echo "----- logcat around the failure -----"
  grep -B 5 -A 60 -E "FATAL EXCEPTION|ANR in $PKG" logcat.txt | head -100 \
    || grep -E "$PKG|AndroidRuntime" logcat.txt | tail -60
  exit 1
fi

# Alive and not crashing is necessary but not sufficient — confirm it actually
# put a window up, so a blank or stuck start is caught too.
if ! adb shell dumpsys window windows 2>/dev/null | grep -q "$PKG"; then
  if ! adb shell dumpsys activity activities 2>/dev/null | grep -q "$PKG/.MainActivity"; then
    echo "::error::The app is running but never showed a window."
    grep -E "$PKG|AndroidRuntime" logcat.txt | tail -60
    exit 1
  fi
fi

# Take a picture of what it actually drew. "It launched" has passed before
# while the screen was the wrong one entirely, and a screenshot in the run's
# artifacts is the only part of this check a person can disagree with.
adb exec-out screencap -p > launch.png || echo "(could not capture a screenshot)"

# And read the words off it, because a picture nobody opens proves nothing.
# Compose publishes its text to the accessibility tree, so the shell's own
# furniture — the masthead and the tabs — is assertable. These strings belong
# to Gold Standard; the older themes' rail says WIRE and NATIONAL instead.
if adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1; then
  adb shell cat /sdcard/ui.xml > ui.xml
  echo "----- on screen -----"
  grep -o 'text="[^"]*"' ui.xml | sed 's/text="//;s/"$//' | grep -v '^$' | sort -u || true
  missing=""
  for want in DYNASTY Board Legacy; do
    grep -q "text=\"[^\"]*$want" ui.xml || missing="$missing $want"
  done
  if [ -n "$missing" ]; then
    echo "::error::Gold Standard's shell is not on screen. Missing:$missing"
    exit 1
  fi
  echo "==> the Gold Standard shell is on screen"
else
  echo "(could not read the view hierarchy; skipping the shell check)"
fi

echo "==> app launched, drew a window, and is still running after ${SETTLE_SECONDS}s"
