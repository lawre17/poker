#!/usr/bin/env bash
#
# Upload the locally-built Kadi APK to the production server so the Laravel
# /download route can serve it (https://kadi.olininnovations.co.ke/download).
# Called automatically from the pre-push hook after a successful build.
#
# Env overrides: FORGE_USER, FORGE_HOST, FORGE_PATH, FORGE_SSH_KEY
# Skip with:     SKIP_APK_UPLOAD=1
#
set -euo pipefail

if [[ "${SKIP_APK_UPLOAD:-}" == "1" ]]; then
    echo "→ SKIP_APK_UPLOAD=1, skipping upload"
    exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FORGE_USER="${FORGE_USER:-forge}"
FORGE_HOST="${FORGE_HOST:-102.68.87.47}"
FORGE_PATH="${FORGE_PATH:-/home/forge/kadi.olininnovations.co.ke}"
SSH_TARGET="${FORGE_USER}@${FORGE_HOST}"

APK="$ROOT_DIR/android/app/build/outputs/apk/release/app-release.apk"
[[ -f "$APK" ]] || { echo "✗ No APK at $APK — run scripts/build-apk.sh first"; exit 1; }

SSH_OPTS=(-o ConnectTimeout=10)
[[ -n "${FORGE_SSH_KEY:-}" ]] && SSH_OPTS+=(-i "$FORGE_SSH_KEY")

# Reachability check first — the build is still valid locally if the box is down.
if ! ssh "${SSH_OPTS[@]}" -o BatchMode=yes "$SSH_TARGET" true 2>/dev/null; then
    echo "⚠ Cannot reach $SSH_TARGET via SSH — skipping upload (APK built locally at $APK)"
    exit 0
fi

echo "→ Uploading APK ($(du -h "$APK" | cut -f1)) to $SSH_TARGET…"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "mkdir -p ${FORGE_PATH}/storage/app/mobile"
rsync -avz --progress -e "ssh ${SSH_OPTS[*]}" "$APK" "${SSH_TARGET}:${FORGE_PATH}/storage/app/mobile/kadi.apk"
echo "✓ Uploaded → ${FORGE_PATH}/storage/app/mobile/kadi.apk (served at /download)"
