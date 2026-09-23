#!/usr/bin/env bash
# Start the merged Career OS dashboard, API, and portal subprocess worker.
set -euo pipefail
cd "$(dirname "$0")"
if [[ -x .venv/bin/python ]]; then
  PYTHON_BIN="$PWD/.venv/bin/python"
elif [[ -x venv/bin/python ]]; then
  PYTHON_BIN="$PWD/venv/bin/python"
else
  echo 'Create .venv and install requirements.txt first. See docs/MERGED_SETUP.md.'
  exit 1
fi
if [[ ! -d dashboard/node_modules ]]; then
  echo 'Run npm ci --prefix dashboard first.'
  exit 1
fi
BACKEND_PID=''
FRONTEND_PID=''
cleanup() {
  [[ -z "$BACKEND_PID" ]] || kill "$BACKEND_PID" 2>/dev/null || true
  [[ -z "$FRONTEND_PID" ]] || kill "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM
# One API worker serializes portal jobs that share output files.
"$PYTHON_BIN" -m uvicorn api.server:app --host 127.0.0.1 --port 5001 &
BACKEND_PID=$!
(cd dashboard && exec node node_modules/vite/bin/vite.js) &
FRONTEND_PID=$!
echo 'Career OS: http://127.0.0.1:5174 — Settings → Job portals'
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 1
done
exit 1
