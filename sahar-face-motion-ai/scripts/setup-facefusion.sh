#!/usr/bin/env bash
# Installs FaceFusion (open source, OpenRAIL-AS) into ./.facefusion for the free local
# face swap engine, then runs a 1-second self-test swap (which also downloads exactly
# the models it needs, ~1.5 GB). CPU-only.
#   FACEFUSION_REF   git tag (default 3.9.1)
#   FACEFUSION_MODEL swapper model (default ghost_1_256, Apache-2.0)
set -euo pipefail
cd "$(dirname "$0")/.."
DIR="${FACEFUSION_DIR:-.facefusion}"
REF="${FACEFUSION_REF:-3.9.1}"

if [ ! -f "$DIR/facefusion.py" ]; then
  echo "▶ cloning FaceFusion $REF"
  git clone --depth 1 --branch "$REF" https://github.com/facefusion/facefusion.git "$DIR"
fi

# FaceFusion 3.9 pins scipy 1.18, which needs Python >= 3.12. Debian bookworm ships 3.11,
# so fetch a standalone 3.12 with uv when the system Python is too old.
PY=python3
if ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)'; then
  echo "▶ system Python $(python3 -V | cut -d' ' -f2) is too old for FaceFusion; installing Python 3.12 with uv"
  python3 -m venv /tmp/uv-bootstrap && /tmp/uv-bootstrap/bin/pip install -q uv
  /tmp/uv-bootstrap/bin/uv python install 3.12
  PY="$(/tmp/uv-bootstrap/bin/uv python find 3.12)"
fi

if [ ! -x "$DIR/.venv/bin/python" ]; then
  "$PY" -m venv "$DIR/.venv"
fi
echo "▶ installing FaceFusion dependencies (CPU onnxruntime) into $DIR/.venv"
# Same packages install.py would install (requirements.txt pins onnxruntime), but into the venv:
# install.py calls the pip found on PATH, which may be the system one.
"$DIR/.venv/bin/pip" install -q --upgrade pip
"$DIR/.venv/bin/pip" install -q -r "$DIR/requirements.txt"

bash scripts/facefusion-selftest.sh
