# Ask K Alerts for macOS

This small menu-bar app watches the Eastern Shore AI human-support queue independently of the browser. It polls the read-only Worker endpoint every 10 seconds, brings a floating window above normal windows, plays an original clipped two-tone bunker alarm continuously while a request is waiting, and links directly to the selected support chat.

The app keeps the notifier credential in macOS Keychain. It never stores the admin password, customer email, conversation text, or chat session token. The Worker endpoint returns only active sessions that have not received a staff reply.

## Installed on this Mac

`install.sh` builds the unsigned local app, installs it at `~/Applications/Ask K Alerts.app`, and registers a per-user LaunchAgent at login. The app runs as a menu-bar-only process. Close the alert window to keep monitoring; use the menu-bar bell to open settings, test the alert, pause for 15 minutes, or open the dashboard.

The first run needs the dedicated support key. It is provisioned with the Worker secret flow and saved through the app's Keychain importer. A user can reconnect later from the settings window with the same key.

## Commands

```bash
# Build and install; also starts it now unless --no-start is passed.
./install.sh

# Remove the login item, app, and notifier key from this Mac.
./uninstall.sh

# Preview the alert window as a PNG.
./build/Ask\ K\ Alerts.app/Contents/MacOS/AskKAlerts --preview /tmp/ask-k-alerts.png
```

The app must have internet access and the Mac must be awake and audible for the warning alarm to be heard. If the Worker connection is unavailable for 60 seconds, the app shows a visible connection-warning alert instead of silently treating the queue as empty.
