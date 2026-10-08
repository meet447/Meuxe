#!/usr/bin/env bash
# Place a linuxdeploy "appimage" plugin in Tauri's tools cache before bundling.
#
# Tauri 2.11 writes its AppImageKit AppRun with mode 0770 (see
# write_and_make_executable in tauri-bundler). linuxdeploy then renames that
# file to AppRun.wrapped and appimagetool stores it as root:root inside the
# squashfs. Firejail, which AppImageHub uses, drops privileges and cannot
# execute a root-owned 0770 file:
#   AppRun: line 12: .../AppRun.wrapped: Permission denied
#
# Tauri skips downloading linuxdeploy-plugin-appimage.AppImage when that path
# already exists, and linuxdeploy loads plugins from the same directory as its
# own binary. A wrapper at that path runs after the AppDir is wrapped and
# before mksquashfs, which is the only moment the modes can still be fixed.
#
# Also pre-seed AppRun-<arch> as 0755. Tauri will not replace an existing
# file, so the copy into the AppDir keeps the world-executable bit.

set -euo pipefail

if [ "$(uname -s)" != "Linux" ]; then
  echo "seed-linuxdeploy-plugin: skipping (not Linux)"
  exit 0
fi

ARCH="$(uname -m)"
TOOLS_DIR="${TAURI_TOOLS_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/tauri}"
REAL="$TOOLS_DIR/appimage-plugin-real.AppImage"
WRAPPER="$TOOLS_DIR/linuxdeploy-plugin-appimage.AppImage"
APPRUN="$TOOLS_DIR/AppRun-$ARCH"
MARKER="meuxe-linuxdeploy-appimage-plugin"
PLUGIN_URL="https://github.com/linuxdeploy/linuxdeploy-plugin-appimage/releases/download/continuous/linuxdeploy-plugin-appimage-${ARCH}.AppImage"
APPRUN_URL="https://github.com/tauri-apps/binary-releases/releases/download/apprun-old/AppRun-${ARCH}"

mkdir -p "$TOOLS_DIR"

download() {
  local url="$1"
  local dest="$2"
  local tmp="$dest.partial"
  echo "seed-linuxdeploy-plugin: downloading $url"
  curl -fsSL --retry 3 --retry-delay 2 -o "$tmp" "$url"
  mv "$tmp" "$dest"
  chmod 755 "$dest"
}

# A previous Tauri run may have saved the real plugin under the wrapper name.
if [ -f "$WRAPPER" ] && ! grep -a -q "$MARKER" "$WRAPPER"; then
  if [ ! -f "$REAL" ]; then
    mv "$WRAPPER" "$REAL"
    chmod 755 "$REAL"
  else
    rm -f "$WRAPPER"
  fi
fi

if [ ! -f "$REAL" ]; then
  download "$PLUGIN_URL" "$REAL"
fi
chmod 755 "$REAL"

if [ ! -f "$APPRUN" ]; then
  download "$APPRUN_URL" "$APPRUN"
fi
chmod 755 "$APPRUN"

cat > "$WRAPPER" << EOF
#!/usr/bin/env bash
# ${MARKER}
# Normalize AppDir modes, then forward to the real linuxdeploy appimage plugin.
set -euo pipefail
here="\$(cd "\$(dirname "\$(readlink -f "\$0")")" && pwd)"
appdir=""
prev=""
for a in "\$@"; do
  if [ "\$prev" = "--appdir" ]; then
    appdir="\$a"
  fi
  case "\$a" in
    --appdir=*) appdir="\${a#--appdir=}" ;;
  esac
  prev="\$a"
done
if [ -n "\$appdir" ] && [ -d "\$appdir" ]; then
  echo "meuxe: normalizing AppImage permissions in \$appdir" >&2
  chmod -R a+rX "\$appdir"
  find "\$appdir" -type f -perm /u+x ! -perm -o+x -exec chmod a+x {} +
  for f in "\$appdir/AppRun" "\$appdir/AppRun.wrapped"; do
    if [ -e "\$f" ] && [ ! -L "\$f" ]; then
      chmod a+x "\$f"
    fi
  done
fi
export APPIMAGE_EXTRACT_AND_RUN=1
exec "\$here/appimage-plugin-real.AppImage" "\$@"
EOF
chmod 755 "$WRAPPER"

echo "seed-linuxdeploy-plugin: ready in $TOOLS_DIR"
