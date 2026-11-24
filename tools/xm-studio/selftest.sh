#!/usr/bin/env bash
# 全机位体检：每个机位录 2 秒，测平均亮度，确认没有黑屏 / 没有报错
set -u
IDS=$(curl -s http://127.0.0.1:8789/shots | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log((j.shots||j).map(s=>s.id).join(" "))})')
for id in $IDS; do
  R=$(curl -s -m 90 -XPOST http://127.0.0.1:8789/record -H 'Content-Type: application/json' \
      -d "{\"shot\":\"$id\",\"duration\":2,\"fps\":24,\"saturation\":1.2}")
  F=$(echo "$R" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).file||"")}catch(e){console.log("")}})')
  if [ -z "$F" ]; then printf "%-16s FAIL(no file)\n" "$id"; continue; fi
  Y=$(ffmpeg -v error -i "$F" -vf "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=/tmp/_y.txt" -f null - 2>/dev/null; awk -F= '/YAVG/{s+=$2;n++} END{if(n)printf "%.1f", s/n; else print "0"}' /tmp/_y.txt)
  S=$(ffmpeg -v error -i "$F" -vf "signalstats,metadata=print:key=lavfi.signalstats.SATAVG:file=/tmp/_s.txt" -f null - 2>/dev/null; awk -F= '/SATAVG/{s+=$2;n++} END{if(n)printf "%.1f", s/n; else print "0"}' /tmp/_s.txt)
  printf "%-16s 亮度 %-6s 饱和 %-6s %s\n" "$id" "$Y" "$S" "$(basename "$F")"
done
