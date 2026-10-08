#!/usr/bin/env bash
# Offline checks for the AppImage permission wrapper.
# Set MEUXE_APPIMAGE_INTEGRATION=1 to also pack a tiny AppImage with the same
# linuxdeploy Tauri uses and confirm AppRun.wrapped is world-executable.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SEED="$ROOT/scripts/appimage/seed-linuxdeploy-plugin.sh"
VERIFY="$ROOT/scripts/appimage/verify-appimage-perms.sh"

if [ "$(uname -s)" != "Linux" ]; then
  echo "test-permissions: Linux only"
  exit 0
fi

tmp="$(mktemp -d)"
# nobody must be able to traverse this tree during the integration run.
chmod 755 "$tmp"
cleanup() {
  if [ -d "${tmp:-}" ]; then
    sudo rm -rf "$tmp" 2>/dev/null || rm -rf "$tmp"
  fi
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# --- wrapper normalizes modes and still forwards every argument ---
tools="$tmp/tools"
mkdir -p "$tools"
cat > "$tools/appimage-plugin-real.AppImage" << 'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$STUB_LOG"
exit 0
EOF
chmod 755 "$tools/appimage-plugin-real.AppImage"
printf 'not-really-apprun\n' > "$tools/AppRun-$(uname -m)"
chmod 770 "$tools/AppRun-$(uname -m)"

TAURI_TOOLS_DIR="$tools" bash "$SEED"

mode="$(stat -c '%a' "$tools/AppRun-$(uname -m)")"
[ "$mode" = "755" ] || fail "pre-seeded AppRun mode is $mode, expected 755"
grep -q 'meuxe-linuxdeploy-appimage-plugin' "$tools/linuxdeploy-plugin-appimage.AppImage" \
  || fail "wrapper was not installed"

appdir="$tmp/AppDir"
mkdir -p "$appdir/usr/bin"
printf '#!/bin/sh\necho hi\n' > "$appdir/usr/bin/tiny"
printf '#!/bin/sh\necho wrapped\n' > "$appdir/AppRun.wrapped"
chmod 770 "$appdir/usr/bin/tiny" "$appdir/AppRun.wrapped"
chmod 700 "$appdir" "$appdir/usr" "$appdir/usr/bin"

export STUB_LOG="$tmp/stub.log"
: > "$STUB_LOG"
"$tools/linuxdeploy-plugin-appimage.AppImage" --plugin-api-version
probe="$(cat "$STUB_LOG")"
[ "$probe" = "--plugin-api-version" ] || fail "probe args were [$probe]"
[ "$(stat -c '%a' "$appdir/AppRun.wrapped")" = "770" ] \
  || fail "probe changed AppRun.wrapped"

: > "$STUB_LOG"
"$tools/linuxdeploy-plugin-appimage.AppImage" --appdir "$appdir" --verbosity 0
[ "$(stat -c '%a' "$appdir/AppRun.wrapped")" = "775" ] \
  || fail "AppRun.wrapped mode is $(stat -c '%a' "$appdir/AppRun.wrapped"), expected 775"
[ "$(stat -c '%a' "$appdir/usr/bin/tiny")" = "775" ] \
  || fail "binary mode is $(stat -c '%a' "$appdir/usr/bin/tiny"), expected 775"
[ "$(stat -c '%a' "$appdir")" = "755" ] \
  || fail "AppDir mode is $(stat -c '%a' "$appdir"), expected 755"
[ "$(cat "$STUB_LOG")" = "--appdir $appdir --verbosity 0" ] \
  || fail "plugin args were [$(cat "$STUB_LOG")]"

# Second seed must not replace the stub plugin with a download.
TAURI_TOOLS_DIR="$tools" bash "$SEED"
head -1 "$tools/appimage-plugin-real.AppImage" | grep -q '#!/usr/bin/env bash' \
  || fail "second seed replaced the stub plugin"

echo "offline permission checks passed"

if [ "${MEUXE_APPIMAGE_INTEGRATION:-}" != "1" ]; then
  exit 0
fi

command -v unsquashfs >/dev/null 2>&1 || fail "integration test needs unsquashfs"
command -v curl >/dev/null 2>&1 || fail "integration test needs curl"

ARCH="$(uname -m)"
work="$tmp/integration"
mkdir -p "$work/bad-tools" "$work/good-tools"

fetch() {
  curl -fsSL --retry 3 --retry-delay 2 -o "$2" "$1"
  chmod 755 "$2"
}

fetch \
  "https://github.com/tauri-apps/binary-releases/releases/download/linuxdeploy/linuxdeploy-${ARCH}.AppImage" \
  "$work/linuxdeploy.AppImage"
fetch \
  "https://github.com/tauri-apps/binary-releases/releases/download/apprun-old/AppRun-${ARCH}" \
  "$work/AppRun"
fetch \
  "https://github.com/linuxdeploy/linuxdeploy-plugin-appimage/releases/download/continuous/linuxdeploy-plugin-appimage-${ARCH}.AppImage" \
  "$work/bad-tools/linuxdeploy-plugin-appimage.AppImage"
cp "$work/linuxdeploy.AppImage" "$work/bad-tools/linuxdeploy-${ARCH}.AppImage"
cp "$work/linuxdeploy.AppImage" "$work/good-tools/linuxdeploy-${ARCH}.AppImage"

# Match Tauri: the launcher that gets renamed to AppRun.wrapped is mode 0770.
cp "$work/AppRun" "$work/bad-tools/AppRun-${ARCH}"
chmod 770 "$work/bad-tools/AppRun-${ARCH}"

icon="$ROOT/src-tauri/icons/32x32.png"
[ -f "$icon" ] || fail "missing $icon"

make_appdir() {
  local dest="$1"
  local apprun_src="$2"
  rm -rf "$dest"
  mkdir -p "$dest/usr/bin" "$dest/usr/share/applications" "$dest/apprun-hooks"
  cat > "$dest/usr/bin/tinyapp" << 'EOF'
#!/bin/sh
echo tinyapp-ok
EOF
  chmod 755 "$dest/usr/bin/tinyapp"
  cat > "$dest/usr/share/applications/tinyapp.desktop" << 'EOF'
[Desktop Entry]
Name=tinyapp
Exec=tinyapp
Icon=tinyapp
Type=Application
Categories=Utility;
EOF
  mkdir -p "$dest/usr/share/icons/hicolor/32x32/apps" "$dest/usr/share/pixmaps"
  cp "$icon" "$dest/usr/share/icons/hicolor/32x32/apps/tinyapp.png"
  cp "$icon" "$dest/usr/share/pixmaps/tinyapp.png"
  cp "$icon" "$dest/tinyapp.png"
  ln -s tinyapp.png "$dest/.DirIcon"
  ln -s usr/share/applications/tinyapp.desktop "$dest/tinyapp.desktop"
  printf '#!/bin/sh\n' > "$dest/apprun-hooks/hook.sh"
  chmod 755 "$dest/apprun-hooks/hook.sh"
  cp "$apprun_src" "$dest/AppRun"
  chmod 770 "$dest/AppRun"
}

pack() {
  local tools="$1"
  local appdir="$2"
  local out="$3"
  rm -rf "$appdir" "$out"
  make_appdir "$appdir" "$work/AppRun"
  local log="$out.log"
  set +e
  (
    cd "$tools"
    OUTPUT="$out" \
      ARCH="$ARCH" \
      APPIMAGE_EXTRACT_AND_RUN=1 \
      "./linuxdeploy-${ARCH}.AppImage" \
        --appimage-extract-and-run \
        --verbosity 2 \
        --appdir "$appdir" \
        --output appimage
  ) >"$log" 2>&1
  local status=$?
  set -e
  if [ "$status" -ne 0 ]; then
    tail -n 40 "$log" >&2
    fail "linuxdeploy exited $status (log $log)"
  fi
}

echo "packing AppImage without the permission wrapper"
pack "$work/bad-tools" "$work/bad.AppDir" "$work/bad.AppImage"
if bash "$VERIFY" "$work/bad.AppImage"; then
  fail "bad AppImage unexpectedly passed the permission check"
fi

echo "packing AppImage with the permission wrapper"
# Seed into the good tools dir. linuxdeploy must live beside the wrapper.
cp "$work/linuxdeploy.AppImage" "$work/good-tools/linuxdeploy-${ARCH}.AppImage"
TAURI_TOOLS_DIR="$work/good-tools" bash "$SEED"
pack "$work/good-tools" "$work/good.AppDir" "$work/good.AppImage"
bash "$VERIFY" "$work/good.AppImage"

chmod 755 "$work"
offset="$("$work/good.AppImage" --appimage-offset)"
sudo unsquashfs -d "$work/good-root" -o "$offset" "$work/good.AppImage" >/dev/null
sudo chmod a+rx "$work/good-root"
if ! sudo -u nobody "$work/good-root/AppRun" | grep -q tinyapp-ok; then
  sudo ls -l "$work/good-root/AppRun" "$work/good-root/AppRun.wrapped" >&2 || true
  fail "world user could not run the fixed AppRun"
fi

offset="$("$work/bad.AppImage" --appimage-offset)"
sudo unsquashfs -d "$work/bad-root" -o "$offset" "$work/bad.AppImage" >/dev/null
sudo chmod a+rx "$work/bad-root"
set +e
bad_out="$(sudo -u nobody "$work/bad-root/AppRun" 2>&1)"
bad_status=$?
set -e
printf '%s\n' "$bad_out" | grep -q 'Permission denied' \
  || fail "unfixed AppRun did not fail with Permission denied (status $bad_status): $bad_out"

echo "integration permission checks passed"
