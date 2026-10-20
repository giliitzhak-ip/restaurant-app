#!/usr/bin/env bash
# Real 1-second face swap with FaceFusion on CPU, using two standard OpenCV sample images.
# Proves the install works and downloads the models a swap needs. Prints timing.
set -euo pipefail
cd "$(dirname "$0")/.."
DIR="${FACEFUSION_DIR:-.facefusion}"
MODEL="${FACEFUSION_MODEL:-ghost_1_256}"
T="$(pwd)/.cache/selftest"
mkdir -p "$T"
for f in lena.jpg messi5.jpg; do
  [ -s "$T/$f" ] || curl -fsSL -o "$T/$f" "https://raw.githubusercontent.com/opencv/opencv/4.x/samples/data/$f"
done
ffmpeg -v error -y -loop 1 -i "$T/lena.jpg" -vf "scale=480:480,format=yuv420p" -t 1 -r 5 -c:v libx264 "$T/clip.mp4"
rm -f "$T/out.mp4"
echo "▶ FaceFusion self-test ($MODEL, CPU, 5 frames; the first run downloads models)"
START=$(date +%s)
( cd "$DIR" && .venv/bin/python facefusion.py headless-run \
    -s "$T/messi5.jpg" -t "$T/clip.mp4" -o "$T/out.mp4" \
    --processors face_swapper --face-swapper-model "$MODEL" --face-selector-mode one \
    --execution-providers cpu --download-providers github --log-level warn )
if [ -s "$T/out.mp4" ]; then
  echo "✓ FaceFusion works: test swap done in $(( $(date +%s) - START ))s"
else
  echo "✗ FaceFusion self-test produced no output" >&2
  exit 1
fi
