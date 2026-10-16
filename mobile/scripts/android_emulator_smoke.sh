#!/usr/bin/env bash
# Runs as one shell under android-emulator-runner. No customer credentials.
set -euo pipefail
APK="$(find /tmp/companion-apk -name '*.apk' -print -quit)"
if [[ -z "$APK" ]]; then echo "Downloaded APK missing"; exit 1; fi
adb install -r "$APK"
adb reverse tcp:8081 tcp:8081

(
  cd mobile
  CI=1 EXPO_NO_TELEMETRY=1 npx expo start --offline --port 8081 > /tmp/companion-metro.log 2>&1
) &
METRO_PID=$!
trap 'kill "$METRO_PID" 2>/dev/null || true' EXIT

sleep 20
adb shell am start -n site.kontamou.companion/.MainActivity
sleep 35

adb shell uiautomator dump /sdcard/window.xml || true
adb pull /sdcard/window.xml /tmp/companion-ui.xml || true
adb shell screencap -p /sdcard/companion-screen.png || true
adb pull /sdcard/companion-screen.png /tmp/companion-screen.png || true
adb logcat -d -s ReactNativeJS:E AndroidRuntime:E ReactNative:E > /tmp/companion-error-log.txt || true
if grep -Ei 'FATAL EXCEPTION|Unable to load script|Invariant Violation|ReactNativeJS:.*Error:|AndroidRuntime:.*FATAL' /tmp/companion-error-log.txt; then
  echo "Android startup/runtime error found"
  exit 1
fi
if [[ -s /tmp/companion-ui.xml ]] && grep -Eiq 'KONTA MOY|KONTA|Companion|Ανακάλυψε|[α-ωάέήίόύώ]' /tmp/companion-ui.xml; then
  echo "Android Companion visible foreground UI confirmed"
else
  echo "App UI not yet confirmed. Attach Metro/emulator evidence for diagnosis."
  tail -60 /tmp/companion-metro.log || true
  exit 1
fi
