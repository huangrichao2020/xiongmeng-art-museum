#!/usr/bin/env bash
# 批量出一批样片素材（供人工验收）
set -u
SHOTS=${1:-"coaster-chase fpv-chase balloon-chase museum-gate balloon-ground plaza-night"}
DUR=${2:-8}
for s in $SHOTS; do
  echo "--- $s"
  curl -s -m 200 -XPOST http://127.0.0.1:8789/record \
    -H 'Content-Type: application/json' \
    -d "{\"shot\":\"$s\",\"duration\":$DUR,\"fps\":30,\"saturation\":1.3}"
  echo
done
