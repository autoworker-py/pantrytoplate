#!/bin/zsh
# usage: shoot.sh <name> [query] [outfile] [width] [height]
cd "$(dirname "$0")"
name=$1; q=${2:-}; out=${3:-shots/$name.png}; w=${4:-930}; h=${5:-1090}
mkdir -p shots
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=$w,$h --virtual-time-budget=6000 \
  --screenshot="$PWD/$out" "file://$PWD/$name.html$q" 2>/dev/null
echo "$out"
