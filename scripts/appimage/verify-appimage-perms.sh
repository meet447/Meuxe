#!/usr/bin/env bash
# Fail when an AppImage stores a file that is not executable by users other
# than its owner. AppImageHub mounts the image as root and then drops
# privileges, so mode 0770 (the Tauri AppRun default) becomes "Permission denied".

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <AppImage> [AppImage...]" >&2
  exit 2
fi

if ! command -v unsquashfs >/dev/null 2>&1; then
  echo "unsquashfs is required (package squashfs-tools)" >&2
  exit 2
fi

fail=0

for img in "$@"; do
  if [ ! -f "$img" ]; then
    echo "not a file: $img" >&2
    fail=1
    continue
  fi

  chmod a+x "$img"
  offset="$("$img" --appimage-offset)"
  listing="$(unsquashfs -lls -o "$offset" "$img")"

  problems="$(
    printf '%s\n' "$listing" | awk '
      $1 ~ /^[-dcbp][-rwxsStT]{9}$/ {
        mode = $1
        path = $6
        for (i = 7; i <= NF; i++) path = path " " $i
        other_r = substr(mode, 8, 1)
        user_x = substr(mode, 4, 1)
        other_x = substr(mode, 10, 1)
        if (other_r != "r") {
          print "not world-readable: " mode " " path
        }
        if ((user_x == "x" || user_x == "s") && other_x != "x" && other_x != "t") {
          print "not world-executable: " mode " " path
        }
      }
    '
  )"

  for name in AppRun AppRun.wrapped; do
    if ! printf '%s\n' "$listing" | grep -qE "[[:space:]][^[:space:]]*/${name}$"; then
      problems="${problems}"$'\n'"missing ${name}"
    fi
  done

  if [ -n "$problems" ]; then
    echo "AppImage permission check failed: $img" >&2
    printf '%s\n' "$problems" >&2
    fail=1
  else
    echo "AppImage permission check passed: $img"
  fi
done

exit "$fail"
