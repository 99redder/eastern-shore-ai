#!/bin/bash
set -euo pipefail
TASK_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
TASK_APP="$HOME/Applications/Ask K Alerts.app"
TASK_LABEL="ai.easternshore.support-notifier"
TASK_AGENT="$HOME/Library/LaunchAgents/$TASK_LABEL.plist"
TASK_DOMAIN="gui/$(id -u)"
"$TASK_DIR/build.sh"
launchctl bootout "$TASK_DOMAIN/$TASK_LABEL" 2>/dev/null || true
mkdir -p "$HOME/Applications" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/Ask K Alerts"
ditto "$TASK_DIR/build/Ask K Alerts.app" "$TASK_APP"
python3 - "$TASK_APP" "$TASK_AGENT" "$HOME/Library/Logs/Ask K Alerts" <<'PY'
import plistlib
import sys
from pathlib import Path
app, agent, logs = sys.argv[1:]
config = {
    "Label": "ai.easternshore.support-notifier",
    "ProgramArguments": [app + "/Contents/MacOS/AskKAlerts"],
    "RunAtLoad": True,
    "KeepAlive": {"SuccessfulExit": False},
    "ThrottleInterval": 10,
    "ProcessType": "Interactive",
    "StandardOutPath": logs + "/app.log",
    "StandardErrorPath": logs + "/error.log",
}
Path(agent).write_bytes(plistlib.dumps(config))
Path(agent).chmod(0o600)
PY
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$TASK_APP"
if [[ "${1:-}" != "--no-start" ]]; then
  launchctl bootstrap "$TASK_DOMAIN" "$TASK_AGENT"
fi
printf 'Installed: %s\nStarts at login via: %s\n' "$TASK_APP" "$TASK_AGENT"
