#!/bin/bash
# XM Studio 一键启动
cd "$(dirname "$0")"
pkill -f "xm-studio/server.js" 2>/dev/null
sleep 1
nohup node server.js > /tmp/xm-studio.log 2>&1 &
sleep 2
echo "XM Studio 已启动：http://127.0.0.1:8789"
echo "机位列表： curl -s http://127.0.0.1:8789/shots"
echo "录一段：   curl -s -XPOST http://127.0.0.1:8789/record -d '{\"shot\":\"coaster-chase\",\"duration\":8}' -H 'Content-Type: application/json'"
