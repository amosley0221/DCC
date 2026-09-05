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
    # The tabs are drawn uppercased, so match without regard to case.
    grep -qi "text=\"[^\"]*$want" ui.xml || missing="$missing $want"
  done
  if [ -n "$missing" ]; then
    echo "::error::Gold Standard's shell is not on screen. Missing:$missing"
    exit 1
  fi
  echo "==> the Gold Standard shell is on screen"

  # Open the masthead control. This is the one that crashed on every tap in
  # 0.29.0 — Settings brings its own vertical scroll and it was being nested in
  # another one, which Compose measures with an infinite height and throws on.
  # Launching proves nothing about a screen nobody opened, so open it.
  # bounds="[264,150][340,226]" becomes 264,150,340,226.
  dots=$(grep -o "<node[^>]*text=\"•••\"[^>]*>" ui.xml | head -1 || true)
  bounds=$(printf '%s' "$dots" \
    | grep -o 'bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | head -1 \
    | sed 's/bounds="//; s/"$//; s/\]\[/,/; s/[][]//g' || true)
  x1=$(printf '%s' "$bounds" | cut -d, -f1)
  y1=$(printf '%s' "$bounds" | cut -d, -f2)
  x2=$(printf '%s' "$bounds" | cut -d, -f3)
  y2=$(printf '%s' "$bounds" | cut -d, -f4)
  if [ -n "$x2" ]; then
    echo "==> tapping the masthead control at $(( (x1 + x2) / 2 )),$(( (y1 + y2) / 2 ))"
    adb logcat -c
    adb shell input tap $(( (x1 + x2) / 2 )) $(( (y1 + y2) / 2 ))
    sleep 4
    adb logcat -d > logcat-ops.txt
    if grep -qE "FATAL EXCEPTION|ANR in $PKG" logcat-ops.txt; then
      echo "::error::The app crashed when the masthead control was tapped."
      grep -A 40 -E "FATAL EXCEPTION" logcat-ops.txt | head -60
      exit 1
    fi
    if ! adb shell pidof "$PKG" > /dev/null 2>&1; then
      echo "::error::The app died when the masthead control was tapped."
      tail -60 logcat-ops.txt
      exit 1
    fi
    adb shell uiautomator dump /sdcard/ops.xml > /dev/null 2>&1 || true
    adb shell cat /sdcard/ops.xml > ops.xml 2>/dev/null || true
    adb exec-out screencap -p > launch-ops.png || true
    echo "----- after the tap -----"
    grep -o 'text="[^"]*"' ops.xml | sed 's/text="//;s/"$//' | grep -v '^$' | sort -u || true
    if ! grep -qi 'text="[^"]*Appearance' ops.xml; then
      echo "::error::Tapping the masthead control did not open the settings screen."
      exit 1
    fi
    echo "==> the masthead control opens settings without crashing"
  else
    echo "(could not locate the masthead control; skipping the tap)"
  fi
else
  echo "(could not read the view hierarchy; skipping the shell check)"
fi

echo "==> app launched, drew a window, and is still running after ${SETTLE_SECONDS}s"
