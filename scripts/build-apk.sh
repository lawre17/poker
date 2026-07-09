#!/usr/bin/env bash
#
# Build the Kadi release APK (debug-signed, JS bundled — runs standalone, no
# Metro). Output: android/app/build/outputs/apk/release/app-release.apk, plus a
# version-named copy at the repo root for manual sharing.
#
# Env overrides: JAVA_HOME, ANDROID_HOME
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
APK="$ROOT_DIR/android/app/build/outputs/apk/release/app-release.apk"

echo "→ Building Kadi release APK (JAVA_HOME=$JAVA_HOME)…"
( cd "$ROOT_DIR/android" && ./gradlew assembleRelease )

[[ -f "$APK" ]] || { echo "✗ Build finished but APK not found at $APK"; exit 1; }

VERSION="$(node -p "require('$ROOT_DIR/app.json').expo.version" 2>/dev/null || echo dev)"
rm -f "$ROOT_DIR"/Kadi-v*.apk
cp "$APK" "$ROOT_DIR/Kadi-v${VERSION}.apk"
echo "✓ Built Kadi-v${VERSION}.apk ($(du -h "$APK" | cut -f1))"
