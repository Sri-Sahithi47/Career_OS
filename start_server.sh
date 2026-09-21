#!/bin/bash
# CareerOS Backend Startup Script
# Run this script to start the backend for the Chrome extension

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Starting CareerOS backend at http://localhost:5001"
echo "   Press Ctrl+C to stop."
echo ""

# Start uvicorn (no-reload avoids venv file noise; re-run script to reload changes)
"$SCRIPT_DIR/venv/bin/uvicorn" api.server:app \
    --port 5001 \
    --host 0.0.0.0
