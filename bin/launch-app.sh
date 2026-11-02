#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/adampiotrowski/Desktop/Projekty programistyczne/Amazon Price Finder"
PORT="${PORT:-3456}"
APP_URL="http://localhost:${PORT}"
HEALTH_URL="${APP_URL}/api/health"
LOG_FILE="/tmp/euroamazon-dispatch.log"

export PATH="/usr/local/bin:/usr/bin:/bin:${HOME}/.nvm/versions/node/$(ls "${HOME}/.nvm/versions/node" 2>/dev/null | tail -n 1 || true)/bin:${PATH}"

cd "${APP_DIR}"

if ! curl -fsS --max-time 1 "${HEALTH_URL}" >/dev/null 2>&1; then
  if [ ! -f "${APP_DIR}/dist/src/server.js" ]; then
    npm run build >>"${LOG_FILE}" 2>&1
  fi

  nohup node "${APP_DIR}/dist/src/server.js" >>"${LOG_FILE}" 2>&1 &

  for _ in $(seq 1 30); do
    if curl -fsS --max-time 1 "${HEALTH_URL}" >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done
fi

# 1. Preferred: Native GNOME GTK4 + WebKit6 standalone desktop window
if python3 -c "import gi; gi.require_version('Gtk', '4.0'); gi.require_version('WebKit', '6.0')" >/dev/null 2>&1; then
  exec python3 "${APP_DIR}/bin/desktop-window.py" "${APP_URL}"
fi

# 2. Fallback: Standalone Chrome App window (--app mode with isolated profile & WMClass)
if command -v google-chrome >/dev/null 2>&1; then
  exec google-chrome \
    --app="${APP_URL}" \
    --class="pl.euroamazon.Dispatch" \
    --user-data-dir="${HOME}/.config/euroamazon-dispatch-window" \
    --window-size=1420,920
fi

exec xdg-open "${APP_URL}"
