#!/usr/bin/env bash
# Copy the engineer screens from the admin repo into the Engineer app, so the app
# and admin.9jafiber.ng/field stay the same code.
#   ADMIN_REPO=/path/to/9jafiber-admin bash scripts/sync-field.sh
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
SRC="${ADMIN_REPO:-$HERE/../9jafiber-admin}/src/components/Field"
DST="$HERE/apps/engineer/src/field"
[ -d "$SRC" ] || { echo "Admin repo not found: $SRC (set ADMIN_REPO)"; exit 1; }
mkdir -p "$DST"
for f in FieldApp.tsx fieldApi.ts fieldOffline.ts ScanButton.tsx SignaturePad.tsx JobActionPanel.tsx; do cp "$SRC/$f" "$DST/$f"; done
echo "Copied from $SRC at $(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo '?')" > "$DST/SOURCE.txt"
echo "Synced: $(ls "$DST" | tr '\n' ' ')"
