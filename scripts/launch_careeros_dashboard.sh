#!/bin/zsh
set -u

PROJECT_DIR="/Users/srisahithiperiketi/Desktop/dice_automation"
SCRIPT_PATH="$0"
BACKEND_URL="http://localhost:5001/api/health"
DASHBOARD_URL="http://localhost:5174"
DEFAULT_LOG_DIR="$PROJECT_DIR/logs"
FALLBACK_LOG_DIR="${TMPDIR:-/tmp}/careeros_logs"
PID_DIR="$PROJECT_DIR"
DEFAULT_PYTHON="$PROJECT_DIR/venv/bin/python3"
RUNTIME_PYTHON="$HOME/.careeros_runtime/venv/bin/python3"
BACKEND_PYTHON="$DEFAULT_PYTHON"

mkdir -p "$DEFAULT_LOG_DIR" >/dev/null 2>&1 || true
mkdir -p "$FALLBACK_LOG_DIR" >/dev/null 2>&1 || true

# When launched from the macOS app bundle, sandbox/privacy can block Desktop writes.
# Use a guaranteed writable temp directory in that mode.
if [[ "$SCRIPT_PATH" == *".app/Contents/Resources/"* ]]; then
  LOG_DIR="$FALLBACK_LOG_DIR"
  PID_DIR="$FALLBACK_LOG_DIR"
  if [ -x "$RUNTIME_PYTHON" ]; then
    BACKEND_PYTHON="$RUNTIME_PYTHON"
  fi
elif [ -w "$DEFAULT_LOG_DIR" ]; then
  LOG_DIR="$DEFAULT_LOG_DIR"
else
  LOG_DIR="$FALLBACK_LOG_DIR"
fi

BACKEND_LOG="$LOG_DIR/backend_local.log"
DASHBOARD_LOG="$LOG_DIR/dashboard_local.log"

if [ ! -w "$PROJECT_DIR" ]; then
  PID_DIR="$LOG_DIR"
fi
cd "$PROJECT_DIR" || exit 1

notify() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"CareerOS\"" >/dev/null 2>&1 || true
}

alert_and_exit() {
  local message="$1"
  /usr/bin/osascript -e "display alert \"CareerOS could not start\" message \"$message\" as critical" >/dev/null 2>&1 || true
  echo "$message"
  exit 1
}

is_backend_ready() {
  /usr/bin/curl -fsS "$BACKEND_URL" >/dev/null 2>&1
}

is_dashboard_ready() {
  /usr/bin/curl -fsSI "$DASHBOARD_URL" >/dev/null 2>&1
}

port_owner() {
  /usr/sbin/lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | /usr/bin/tail -n +2 || true
}

wait_for() {
  local name="$1"
  local check_cmd="$2"
  local seconds="$3"
  local i=0
  while [ "$i" -lt "$seconds" ]; do
    if eval "$check_cmd"; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

write_pid_file() {
  local pid="$1"
  local file_name="$2"
  local target="$PID_DIR/$file_name"
  if ! echo "$pid" > "$target" 2>/dev/null; then
    echo "Warning: could not write PID file at $target"
  fi
}

echo "Starting CareerOS from $PROJECT_DIR"

if ! is_backend_ready; then
  if [ -n "$(port_owner 5001)" ]; then
    echo "Port 5001 is occupied:"
    port_owner 5001
    alert_and_exit "Port 5001 is already in use, but the CareerOS backend is not healthy. Close the blocking process shown in Terminal, then try again."
  fi
  echo "Starting backend on port 5001..."
  nohup "$BACKEND_PYTHON" -m uvicorn api.server:app --port 5001 --host 0.0.0.0 > "$BACKEND_LOG" 2>&1 </dev/null &
  backend_pid=$!
  disown "$backend_pid" 2>/dev/null || true
  write_pid_file "$backend_pid" ".backend_local.pid"
fi

if ! wait_for backend is_backend_ready 45; then
  /usr/bin/tail -80 "$BACKEND_LOG" || true
  alert_and_exit "Backend did not become healthy. Check $BACKEND_LOG"
fi

if ! is_dashboard_ready; then
  if [ -n "$(port_owner 5174)" ]; then
    echo "Port 5174 is occupied:"
    port_owner 5174
    alert_and_exit "Port 5174 is already in use, but the CareerOS dashboard is not responding. Close the blocking process shown in Terminal, then try again."
  fi
  echo "Starting dashboard on port 5174..."
  (
    cd "$PROJECT_DIR/dashboard" || exit 1
    nohup npm run dev -- --host 127.0.0.1 --port 5174 > "$DASHBOARD_LOG" 2>&1 </dev/null &
    dashboard_pid=$!
    disown "$dashboard_pid" 2>/dev/null || true
    write_pid_file "$dashboard_pid" ".dashboard_local.pid"
  )
fi

if ! wait_for dashboard is_dashboard_ready 45; then
  /usr/bin/tail -80 "$DASHBOARD_LOG" || true
  alert_and_exit "Dashboard did not start. Check $DASHBOARD_LOG"
fi

echo "CareerOS is ready. Opening dashboard..."
if [ -d "/Applications/Google Chrome.app" ]; then
  /usr/bin/open -a "Google Chrome" "$DASHBOARD_URL"
else
  /usr/bin/open "$DASHBOARD_URL"
fi

notify "Dashboard and backend are running. Extension can now connect to localhost:5001."
echo "Dashboard: $DASHBOARD_URL"
echo "Backend:   $BACKEND_URL"
echo "If the extension was recently changed, reload it once from chrome://extensions."
