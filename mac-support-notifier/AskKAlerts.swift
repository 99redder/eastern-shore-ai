import AppKit
import SwiftUI

private let cyan = Color(red: 0.0, green: 0.90, blue: 1.0)
private let pink = Color(red: 1.0, green: 0.31, blue: 0.85)
private let panelBackground = Color(red: 0.04, green: 0.045, blue: 0.075)
private let bundleID = "ai.easternshore.support-notifier"

@MainActor
final class Notifier: NSObject, ObservableObject, NSApplicationDelegate {
    @Published var status = "Connecting to support…"
    @Published var lastChecked: Date?
    @Published var current: SupportRequest?
    @Published var waitingCount = 0
    @Published var isDemo = false
    @Published var needsKey = false
    @Published var connectionWarning = false
    @Published var pausedUntil: Date?
    @Published var soundEnabled = true
    @Published var setupError = ""

    private var token: String?
    private var requests: [SupportRequest] = []
    private var memory = AlertMemory()
    private var timer: Timer?
    private var pollTask: Task<Void, Never>?
    private var lastPoll = Date.distantPast
    private var lastRing = Date.distantPast
    private var firstFailure: Date?
    private var dismissedConnectionWarning = false
    private var demoUntil: Date?
    private var statusItem: NSStatusItem!
    private var alertPanel: NSPanel!
    private var settingsWindow: NSWindow!
    private var sound: NSSound?
    private var activity: NSObjectProtocol?
    private let defaults = UserDefaults.standard
    private let stateDirectory = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/Ask K Alerts", isDirectory: true)

    func applicationDidFinishLaunching(_ notification: Notification) {
        let args = CommandLine.arguments
        if args.contains("--preview") {
            configureWindows()
            current = SupportRequest(id: 123, page: "Survival Node", customerName: "A customer", escalatedAt: "")
            waitingCount = 1
            isDemo = true
            alertPanel.orderFrontRegardless()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [self] in
                let view = alertPanel.contentView!
                view.layoutSubtreeIfNeeded()
                if let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) {
                    view.cacheDisplay(in: view.bounds, to: bitmap)
                    try? bitmap.representation(using: .png, properties: [:])?.write(to:
                        URL(fileURLWithPath: args.last!))
                }
                NSApp.terminate(nil)
            }
            return
        }
        // LaunchServices normally enforces this; also protect direct/manual runs.
        if NSRunningApplication.runningApplications(withBundleIdentifier: bundleID)
            .contains(where: { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }) {
            NSApp.terminate(nil)
            return
        }
        if let data = defaults.data(forKey: "alertMemory"),
           let saved = try? JSONDecoder().decode(AlertMemory.self, from: data) { memory = saved }
        pausedUntil = memory.pausedUntil
        soundEnabled = defaults.object(forKey: "soundEnabled") as? Bool ?? true
        do { token = try NotifierKeychain.read() } catch { setupError = "macOS Keychain is unavailable. Unlock your login keychain and try again." }
        needsKey = token == nil
        if needsKey { status = "Setup needed — connect your support key" }
        configureWindows()
        configureMenu()
        if let path = Bundle.main.path(forResource: "support-chime", ofType: "wav") {
            sound = NSSound(contentsOfFile: path, byReference: false)
            sound?.volume = 0.9
        }
        // Keep checks timely while awake without preventing display/system sleep.
        activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiatedAllowingIdleSystemSleep], reason: "Monitor incoming human support requests")
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(didWake), name: NSWorkspace.didWakeNotification, object: nil)
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(willSleep), name: NSWorkspace.willSleepNotification, object: nil)
        timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        RunLoop.main.add(timer!, forMode: .common)
        if needsKey || !defaults.bool(forKey: "hasLaunched") { showSettings() }
        defaults.set(true, forKey: "hasLaunched")
        tick()
    }

    func applicationWillTerminate(_ notification: Notification) {
        timer?.invalidate()
        pollTask?.cancel()
        if let activity { ProcessInfo.processInfo.endActivity(activity) }
        writeHealth(running: false)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showSettings()
        return true
    }

    private func configureWindows() {
        alertPanel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 570, height: 355),
                             styleMask: [.titled, .fullSizeContentView, .nonactivatingPanel], backing: .buffered, defer: false)
        alertPanel.title = "Ask K — Customer waiting"
        alertPanel.titleVisibility = .hidden
        alertPanel.titlebarAppearsTransparent = true
        alertPanel.isMovableByWindowBackground = true
        alertPanel.isReleasedWhenClosed = false
        alertPanel.hidesOnDeactivate = false
        alertPanel.level = .floating
        alertPanel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        alertPanel.backgroundColor = NSColor(red: 0.04, green: 0.045, blue: 0.075, alpha: 1)
        alertPanel.contentView = NSHostingView(rootView: AlertView(model: self))
        alertPanel.center()

        settingsWindow = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 520, height: 490),
                                  styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        settingsWindow.title = "Ask K Alerts"
        settingsWindow.isReleasedWhenClosed = false
        settingsWindow.contentView = NSHostingView(rootView: SettingsView(model: self))
        settingsWindow.center()
    }

    private func configureMenu() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = NSImage(systemSymbolName: "bell.badge.fill", accessibilityDescription: "Ask K support alerts")
        statusItem.button?.imagePosition = .imageLeading
        let menu = NSMenu()
        addItem("Ask K Alerts — Status…", #selector(showSettings), to: menu)
        addItem("Show Waiting Customer", #selector(showWaiting), to: menu)
        addItem("Open Support Dashboard", #selector(openDashboard), to: menu)
        menu.addItem(.separator())
        addItem("Test Alert and Alarm", #selector(testAlert), to: menu)
        addItem("Pause for 15 Minutes / Resume", #selector(togglePause), to: menu)
        menu.addItem(.separator())
        addItem("Quit Ask K Alerts", #selector(quitApp), to: menu)
        statusItem.menu = menu
        updateMenu()
    }

    private func addItem(_ title: String, _ action: Selector, to menu: NSMenu) {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self
        menu.addItem(item)
    }

    private func tick() {
        let now = Date()
        if let until = demoUntil, now >= until { endDemo() }
        if let until = memory.pausedUntil, now >= until {
            memory.pausedUntil = nil
            pausedUntil = nil
            persist()
        }
        if token != nil && pollTask == nil && now.timeIntervalSince(lastPoll) >= 10 {
            checkSupport()
        }
        refreshAlert(now: now)
    }

    private func checkSupport() {
        guard let token, pollTask == nil else { return }
        lastPoll = Date()
        pollTask = Task { [weak self] in
            do {
                let incoming = try await SupportAPI.requests(token: token)
                guard !Task.isCancelled, let self else { return }
                self.requests = incoming
                self.lastChecked = Date()
                self.firstFailure = nil
                self.dismissedConnectionWarning = false
                self.connectionWarning = false
                self.status = "Watching for customers"
                self.needsKey = false
            } catch {
                guard !Task.isCancelled, let self else { return }
                self.firstFailure = self.firstFailure ?? Date()
                if case SupportAPIError.unauthorized = error {
                    self.status = "Support key rejected — reconnect in Settings"
                    self.needsKey = true
                } else {
                    self.status = "Connection interrupted — retrying automatically"
                }
            }
            guard let self else { return }
            self.pollTask = nil
            self.refreshAlert(now: Date())
            self.writeHealth()
        }
    }

    private func refreshAlert(now: Date) {
        guard !isDemo else { return }
        let pending = memory.pending(requests, now: now)
        waitingCount = pending.count
        let changed = current?.id != pending.first?.id
        current = pending.first
        let isPaused = (memory.pausedUntil ?? .distantPast) > now
        connectionWarning = !isPaused && !dismissedConnectionWarning
            && (firstFailure.map { now.timeIntervalSince($0) >= 60 } ?? false)
        if current != nil || connectionWarning {
            if changed || !alertPanel.isVisible { alertPanel.orderFrontRegardless() }
            if current != nil && (changed || now.timeIntervalSince(lastRing) >= 20) { ring() }
        } else {
            alertPanel.orderOut(nil)
            sound?.stop()
        }
        updateMenu()
    }

    private func ring() {
        lastRing = Date()
        guard soundEnabled else { return }
        sound?.stop()
        if sound?.play() != true { NSSound.beep() }
    }

    private func updateMenu() {
        guard statusItem != nil else { return }
        let paused = (memory.pausedUntil ?? .distantPast) > Date()
        statusItem.button?.title = paused ? " Zz" : (firstFailure != nil || needsKey ? " !" : (waitingCount > 0 ? " \(waitingCount)" : ""))
        statusItem.button?.toolTip = paused ? "Ask K alerts paused for 15 minutes" : "Ask K Alerts: \(status)"
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(memory) { defaults.set(data, forKey: "alertMemory") }
        writeHealth()
    }

    private func writeHealth(running: Bool = true) {
        // Local diagnostics intentionally contain no names, transcripts or keys.
        let health: [String: Any] = ["running": running, "status": status,
            "configured": token != nil, "lastChecked": lastChecked?.timeIntervalSince1970 ?? 0,
            "pendingCount": waitingCount, "pausedUntil": memory.pausedUntil?.timeIntervalSince1970 ?? 0,
            "panelVisible": alertPanel?.isVisible ?? false]
        do {
            try FileManager.default.createDirectory(at: stateDirectory, withIntermediateDirectories: true,
                                                    attributes: [.posixPermissions: 0o700])
            let data = try JSONSerialization.data(withJSONObject: health, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: stateDirectory.appendingPathComponent("status.json"), options: .atomic)
        } catch { /* Diagnostic failure must not stop monitoring. */ }
    }

    func acknowledge() {
        if isDemo { endDemo(); return }
        if let current { memory.acknowledge(current.id) }
        else { dismissedConnectionWarning = true }
        sound?.stop()
        persist()
        refreshAlert(now: Date())
    }

    func snooze() {
        if isDemo { endDemo(); return }
        if let current { memory.snooze(current.id, now: Date()) }
        sound?.stop()
        persist()
        refreshAlert(now: Date())
    }

    func openChat() {
        if isDemo { endDemo(); openDashboard(); return }
        guard let current else { showSettings(); return }
        if NSWorkspace.shared.open(current.chatURL) { acknowledge() }
    }

    func setSound(_ enabled: Bool) {
        soundEnabled = enabled
        defaults.set(enabled, forKey: "soundEnabled")
        if !enabled { sound?.stop() }
    }

    func saveKey(_ value: String) {
        let value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard value.count >= 32, value.count <= 256 else {
            setupError = "Enter the dedicated support key, not your admin password."
            return
        }
        setupError = "Checking connection…"
        Task {
            do {
                _ = try await SupportAPI.requests(token: value)
                try NotifierKeychain.write(value)
                pollTask?.cancel()
                pollTask = nil
                token = value
                needsKey = false
                setupError = "Connected. Your key is saved in macOS Keychain."
                firstFailure = nil
                dismissedConnectionWarning = false
                lastPoll = .distantPast
                tick()
            } catch {
                setupError = "Could not connect. Check the support key and your internet connection."
            }
        }
    }

    @objc func showSettings() {
        NSApp.activate(ignoringOtherApps: true)
        settingsWindow.makeKeyAndOrderFront(nil)
    }

    @objc func showWaiting() {
        if current != nil { alertPanel.orderFrontRegardless() } else { showSettings() }
    }

    @objc func openDashboard() {
        NSWorkspace.shared.open(URL(string: "https://www.easternshore.ai/support-chat.html")!)
    }

    @objc func testAlert() {
        isDemo = true
        demoUntil = Date().addingTimeInterval(12)
        current = SupportRequest(id: 0, page: "Survival Node", customerName: "A customer", escalatedAt: "")
        waitingCount = 1
        connectionWarning = false
        alertPanel.orderFrontRegardless()
        ring()
    }

    private func endDemo() {
        isDemo = false
        demoUntil = nil
        current = nil
        sound?.stop()
        refreshAlert(now: Date())
    }

    @objc func togglePause() {
        memory.pausedUntil = (memory.pausedUntil ?? .distantPast) > Date() ? nil : Date().addingTimeInterval(15 * 60)
        pausedUntil = memory.pausedUntil
        if isDemo { endDemo() }
        persist()
        refreshAlert(now: Date())
    }

    @objc private func willSleep() {
        pollTask?.cancel()
        pollTask = nil
        sound?.stop()
    }

    @objc private func didWake() {
        lastPoll = .distantPast
        lastRing = .distantPast
        tick()
    }

    @objc private func quitApp() { NSApp.terminate(nil) }
}

private struct AlertView: View {
    @ObservedObject var model: Notifier
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 12) {
                Image(systemName: "bell.badge.fill").font(.system(size: 27)).foregroundStyle(cyan)
                Text("ASK K  /  HUMAN SUPPORT").font(.system(size: 12, weight: .bold, design: .monospaced)).tracking(1.4).foregroundStyle(cyan)
                Spacer()
                if model.isDemo { Text("TEST ALERT").font(.system(size: 10, weight: .bold)).foregroundStyle(pink) }
            }
            Text(model.current == nil ? "Support is disconnected" : "Someone needs your help")
                .font(.system(size: 29, weight: .bold)).foregroundStyle(.white)
            if let request = model.current {
                Text("\(request.displayName) is waiting in Ask K.")
                    .font(.system(size: 18)).foregroundStyle(.white.opacity(0.88)).lineLimit(2)
                HStack {
                    Text(String((request.page ?? "Survival Node").prefix(60)))
                    Spacer()
                    Text(model.waitingCount > 1 ? "\(model.waitingCount) requests waiting" : "Live support request")
                }.font(.system(size: 12)).foregroundStyle(.white.opacity(0.6))
            } else {
                Text("New requests cannot be checked right now. \(model.status).")
                    .font(.system(size: 16)).foregroundStyle(.white.opacity(0.85)).fixedSize(horizontal: false, vertical: true)
            }
            Rectangle().fill(cyan.opacity(0.25)).frame(height: 1)
            HStack(spacing: 10) {
                Button(model.current == nil ? "Check Connection" : "Open Chat", action: model.openChat)
                    .buttonStyle(AlertButtonStyle(primary: true))
                if model.current != nil {
                    Button("Snooze 1 min", action: model.snooze).buttonStyle(AlertButtonStyle(primary: false))
                }
                Button("Acknowledge", action: model.acknowledge).buttonStyle(AlertButtonStyle(primary: false))
            }
            Text(model.isDemo ? "Preview only • closes automatically after 12 seconds" :
                 (model.connectionWarning ? "Connection interrupted • the customer status may be out of date" : "Alarm repeats every 20 seconds until you take action"))
                .font(.system(size: 11)).foregroundStyle(.white.opacity(0.5))
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(panelBackground)
        .overlay(alignment: .top) { Rectangle().fill(LinearGradient(colors: [cyan, pink], startPoint: .leading, endPoint: .trailing)).frame(height: 3) }
        .environment(\.colorScheme, .dark)
    }
}

private struct AlertButtonStyle: ButtonStyle {
    let primary: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.system(size: 13, weight: .semibold))
            .padding(.horizontal, 16).padding(.vertical, 12)
            .foregroundStyle(primary ? Color.black : Color.white)
            .background(primary ? cyan.opacity(configuration.isPressed ? 0.65 : 1) : Color.white.opacity(configuration.isPressed ? 0.20 : 0.08))
            .clipShape(RoundedRectangle(cornerRadius: 7))
    }
}

private struct SettingsView: View {
    @ObservedObject var model: Notifier
    @State private var key = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 12) {
                Image(systemName: "bell.badge.fill").font(.system(size: 34)).foregroundStyle(cyan)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Ask K Alerts").font(.system(size: 27, weight: .bold))
                    Text("EASTERN SHORE AI").font(.system(size: 10, weight: .bold, design: .monospaced)).tracking(2).foregroundStyle(cyan)
                }
            }
            Text((model.pausedUntil ?? .distantPast) > Date() ? "Alerts paused for 15 minutes" : model.status)
                .font(.system(size: 15, weight: .semibold)).foregroundStyle(model.needsKey ? pink : cyan)
            if let checked = model.lastChecked {
                Text("Last connected: \(checked.formatted(date: .omitted, time: .standard))")
                    .font(.system(size: 12)).foregroundStyle(.white.opacity(0.6))
            }
            if model.needsKey {
                SecureField("Dedicated support key", text: $key).textFieldStyle(.roundedBorder)
                Button("Connect") { model.saveKey(key); key = "" }.buttonStyle(AlertButtonStyle(primary: true))
            }
            if !model.setupError.isEmpty { Text(model.setupError).font(.system(size: 12)).foregroundStyle(.white.opacity(0.7)) }
            Toggle("Play a repeating warning alarm", isOn: Binding(get: { model.soundEnabled }, set: model.setSound))
            Text("Checks every 10 seconds. The warning alarm repeats every 20 seconds.\nStarts when you log into this Mac. Your browser can be closed.")
                .font(.system(size: 13)).foregroundStyle(.white.opacity(0.72)).lineSpacing(4)
            HStack(spacing: 10) {
                Button("Test Alert & Alarm", action: model.testAlert).buttonStyle(AlertButtonStyle(primary: true))
                Button("Open Dashboard", action: model.openDashboard).buttonStyle(AlertButtonStyle(primary: false))
            }
            Button((model.pausedUntil ?? .distantPast) > Date() ? "Resume alerts" : "Pause alerts for 15 minutes", action: model.togglePause)
                .buttonStyle(.link).tint(cyan)
            Text("Close this window to keep watching from the menu bar.\nYour Mac must be awake, online, and audible to hear alerts.")
                .font(.system(size: 11)).foregroundStyle(.white.opacity(0.48)).lineSpacing(3)
            Spacer(minLength: 0)
        }
        .padding(28).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(panelBackground).foregroundStyle(.white).environment(\.colorScheme, .dark)
    }
}

@main
enum AskKAlerts {
    static func main() {
        // Provision via stdin, never command-line arguments or plaintext config.
        if CommandLine.arguments.contains("--import-key") {
            do {
                let data = FileHandle.standardInput.readDataToEndOfFile()
                let value = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                guard (32...256).contains(value.count) else { throw SupportAPIError.unauthorized }
                try NotifierKeychain.write(value)
                print("Support credential saved to macOS Keychain.")
                exit(0)
            } catch {
                fputs("Unable to save the support credential to Keychain.\n", stderr)
                exit(1)
            }
        }
        if CommandLine.arguments.contains("--remove-key") {
            do { try NotifierKeychain.remove(); exit(0) } catch { exit(1) }
        }
        if CommandLine.arguments.contains("--check-connection") {
            Task {
                do {
                    guard let token = try NotifierKeychain.read() else { throw SupportAPIError.unauthorized }
                    let requests = try await SupportAPI.requests(token: token)
                    print("Support connection OK: \(requests.count) unanswered request(s).")
                    exit(0)
                } catch {
                    fputs("Support connection check failed.\n", stderr)
                    exit(1)
                }
            }
            dispatchMain()
        }
        let app = NSApplication.shared
        let delegate = Notifier()
        app.setActivationPolicy(.accessory)
        app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
    }
}
