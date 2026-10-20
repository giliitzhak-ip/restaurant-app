#!/usr/bin/env bash
# Installs FaceFusion (open source, OpenRAIL-AS) into ./.facefusion for the local, free
# face swap engine, and pre-downloads the swapper model. CPU-only by default.
#   FACEFUSION_REF   git tag/branch (default 3.9.1, falls back to master)
#   FACEFUSION_MODEL swapper model (default ghost_1_256, Apache-2.0)
set -euo pipefail
cd "$(dirname "$0")/.."
DIR="${FACEFUSION_DIR:-.facefusion}"
REF="${FACEFUSION_REF:-3.9.1}"
MODEL="${FACEFUSION_MODEL:-ghost_1_256}"

if [ ! -f "$DIR/facefusion.py" ]; then
  echo "▶ cloning FaceFusion ($REF)"
  git clone --depth 1 --branch "$REF" https://github.com/facefusion/facefusion.git "$DIR" \
    || git clone --depth 1 https://github.com/facefusion/facefusion.git "$DIR"
fi
cd "$DIR"
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
echo "▶ installing Python dependencies (CPU onnxruntime)"
.venv/bin/pip install --upgrade pip >/dev/null
.venv/bin/python install.py default --skip-conda
echo "▶ downloading models (swapper: $MODEL)"
.venv/bin/python facefusion.py force-download --download-providers github --download-scope lite || true
echo "✓ FaceFusion ready in $DIR (model $MODEL). Set FACE_SWAP_PROVIDER=facefusion-local to make it the default."
