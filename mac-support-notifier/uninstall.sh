#!/bin/bash
set -euo pipefail
TASK_LABEL="ai.easternshore.support-notifier"
TASK_APP="$HOME/Applications/Ask K Alerts.app"
launchctl bootout "gui/$(id -u)/$TASK_LABEL" 2>/dev/null || true
if [[ -x "$TASK_APP/Contents/MacOS/AskKAlerts" ]]; then
  "$TASK_APP/Contents/MacOS/AskKAlerts" --remove-key
fi
rm -f "$HOME/Library/LaunchAgents/$TASK_LABEL.plist"
rm -rf "$TASK_APP"
printf 'Ask K Alerts removed. Website support and Discord alerts remain active.\n'
