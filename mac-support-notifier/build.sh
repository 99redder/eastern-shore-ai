#!/bin/bash
set -euo pipefail
TASK_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
TASK_APP="$TASK_DIR/build/Ask K Alerts.app"
mkdir -p "$TASK_APP/Contents/MacOS" "$TASK_APP/Contents/Resources"
xcrun swiftc -swift-version 5 -target "$(uname -m)-apple-macosx13.0" -O -parse-as-library \
  "$TASK_DIR/SupportCore.swift" "$TASK_DIR/Keychain.swift" "$TASK_DIR/AskKAlerts.swift" \
  -framework AppKit -framework SwiftUI -framework Security \
  -o "$TASK_APP/Contents/MacOS/AskKAlerts"
cp "$TASK_DIR/Info.plist" "$TASK_APP/Contents/Info.plist"
python3 "$TASK_DIR/make-chime.py" "$TASK_APP/Contents/Resources/support-chime.wav"
# Reuse the site's support icon in a standard macOS icon container.
TASK_ICONSET="$TASK_DIR/build/Support.iconset"
mkdir -p "$TASK_ICONSET"
for TASK_SIZE in 16 32 128 256 512; do
  sips -z "$TASK_SIZE" "$TASK_SIZE" "$TASK_DIR/../icons/support-chat/icon-512.png" --out "$TASK_ICONSET/icon_${TASK_SIZE}x${TASK_SIZE}.png" >/dev/null
done
cp "$TASK_ICONSET/icon_32x32.png" "$TASK_ICONSET/icon_16x16@2x.png"
cp "$TASK_ICONSET/icon_256x256.png" "$TASK_ICONSET/icon_128x128@2x.png"
cp "$TASK_ICONSET/icon_512x512.png" "$TASK_ICONSET/icon_256x256@2x.png"
sips -z 64 64 "$TASK_DIR/../icons/support-chat/icon-512.png" --out "$TASK_ICONSET/icon_32x32@2x.png" >/dev/null
iconutil -c icns "$TASK_ICONSET" -o "$TASK_APP/Contents/Resources/Support.icns"
codesign --force --sign - --identifier ai.easternshore.support-notifier "$TASK_APP"
codesign --verify --strict "$TASK_APP"
printf 'Built: %s\n' "$TASK_APP"
