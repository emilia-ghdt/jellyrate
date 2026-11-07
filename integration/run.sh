#!/usr/bin/env bash
# Builds the plugin, starts a throwaway native Jellyfin 12 server (portable tarball, no Docker) with it
# and runs the integration tests against it.
set -euo pipefail
cd "$(dirname "$0")/.."
root=$PWD

version=${JELLYFIN_VERSION:-12.4}
port=8096
if curl -fs "http://localhost:$port/System/Info/Public" > /dev/null; then
  echo "Port $port is already in use" >&2
  exit 1
fi
cache=$root/integration/.cache
tarball=$cache/jellyfin_${version}-amd64.tar.gz
server=$cache/server-$version
data=$root/integration/data

ffmpegtar=$cache/jellyfin-ffmpeg-7.1.4-3.tar.xz
ffmpegdir=$cache/ffmpeg-7.1

# Download and unpack the server once; later runs reuse the cache.
if [ ! -f "$server/jellyfin.dll" ]; then
  mkdir -p "$cache"
  curl -fsSL "https://repo.jellyfin.org/files/server/linux/latest-stable/amd64/jellyfin_${version}-amd64.tar.gz" -o "$tarball"
  rm -rf "$server"
  mkdir -p "$server"
  # The tarball contains a single "jellyfin" directory.
  tar -xzf "$tarball" -C "$server" --strip-components=1
fi

# Jellyfin refuses to start without a valid ffmpeg. Set JELLYFIN_FFMPEG to use your own (e.g. on NixOS).
if [ -z "${JELLYFIN_FFMPEG:-}" ]; then
  if [ ! -x "$ffmpegdir/ffmpeg" ]; then
    curl -fsSL "https://repo.jellyfin.org/files/ffmpeg/linux/latest-7.x/amd64/jellyfin-ffmpeg_7.1.4-3_portable_linux64-gpl.tar.xz" -o "$ffmpegtar"
    rm -rf "$ffmpegdir"
    mkdir -p "$ffmpegdir"
    tar -xJf "$ffmpegtar" -C "$ffmpegdir"
  fi
  JELLYFIN_FFMPEG=$ffmpegdir/ffmpeg
fi

rm -rf "$data"
work=$data/work
plugin=$work/data/plugins/JellyRate_1.0.0.0
media=$data/media
mkdir -p "$plugin" "$work/config" "$work/cache" "$data/log" \
  "$media/movies/Test Movie (2020)" "$media/shows/Test Show (2020)/Season 01"

dotnet publish Jellyfin.Plugin.JellyRate -c Release -o "$data/publish"
cp "$data/publish/Jellyfin.Plugin.JellyRate.dll" "$plugin/"
# Optional (used by ui/run.sh): the File Transformation plugin, needed for the web UI injection.
if [ -n "${FILE_TRANSFORMATION_DIR:-}" ]; then
  mkdir -p "$work/data/plugins/FileTransformation_3.0.3.0"
  cp -r "$FILE_TRANSFORMATION_DIR"/. "$work/data/plugins/FileTransformation_3.0.3.0/"
fi

# Tiny placeholder files: Jellyfin lists them by file name even though they are not playable.
echo placeholder > "$media/movies/Test Movie (2020)/Test Movie (2020).mkv"
echo placeholder > "$media/shows/Test Show (2020)/Season 01/Test Show (2020) S01E01.mkv"

# "dotnet jellyfin.dll" instead of the apphost, which does not run on e.g. NixOS.
dotnet "$server/jellyfin.dll" \
  --datadir "$work/data" --configdir "$work/config" --cachedir "$work/cache" \
  --logdir "$data/log" --webdir "$server/jellyfin-web" --ffmpeg "$JELLYFIN_FFMPEG" > "$data/server.out" 2>&1 &
pid=$!
cleanup() {
  kill "$pid" 2>/dev/null && wait "$pid" 2>/dev/null || true
  cat "$data"/log/*.log > "$data/jellyfin.log" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT

for _ in $(seq 120); do
  # The log line appears only once the real server is up (a setup server answers earlier).
  grep -q 'Startup complete' "$data/server.out" && break
  if ! kill -0 "$pid" 2>/dev/null || grep -q '\[FTL\]' "$data/server.out"; then
    grep -v 'Seed migration' "$data/server.out" | tail -40
    echo "Jellyfin failed to start" >&2
    exit 1
  fi
  sleep 1
done

# TEST_CMD (set by ui/run.sh) replaces the integration tests.
export JELLYFIN_URL=http://localhost:$port JELLYFIN_MEDIA=$media
if [ -n "${TEST_CMD:-}" ]; then bash -c "$TEST_CMD"; else dotnet test Jellyfin.Plugin.JellyRate.IntegrationTests; fi
