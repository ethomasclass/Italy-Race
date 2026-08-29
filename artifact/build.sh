#!/usr/bin/env bash
# Assemble the single-file, self-contained build published as an Artifact.
# The whole Three.js bundle is inlined so the page has no external dependencies
# beyond the two Google Fonts the shell links.
set -euo pipefail
cd "$(dirname "$0")/.."

npx vite build
BUNDLE=$(ls dist/assets/*.js)
OUT=dist/his-fathers-car.html

cat artifact/shell-head.html "$BUNDLE" artifact/shell-tail.html > "$OUT"
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
