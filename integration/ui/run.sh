#!/usr/bin/env bash
# Runs the browser checks (checks.py, then shots.py) against a throwaway native Jellyfin started by
# ../run.sh. Not part of CI. Requires python3 with playwright (+ its Chromium) and the File Transformation
# plugin: FILE_TRANSFORMATION_DIR = unzipped plugin folder (the release zip's contents, with the dlls).
#   Other systems: pip install playwright && playwright install chromium
#   NixOS: nix-shell -p dotnet-sdk_10 python3 python3Packages.playwright playwright-driver.browsers
#          (plus the libraries listed for integration/run.sh)
# Env: UI_OUT (screenshots, default integration/ui/out), JELLYFIN_VERSION, JELLYFIN_FFMPEG.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
: "${FILE_TRANSFORMATION_DIR:?set FILE_TRANSFORMATION_DIR to the unzipped File Transformation plugin folder}"
export FILE_TRANSFORMATION_DIR=$(cd "$FILE_TRANSFORMATION_DIR" && pwd)
export UI_OUT=${UI_OUT:-$here/out}
export TEST_CMD="cd '$here' && BASE_URL=http://localhost:8096 MEDIA_DIR=\$JELLYFIN_MEDIA python3 checks.py && python3 shots.py"
exec "$here/../run.sh"
