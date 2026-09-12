import Foundation

@main
enum SupportCoreTests {
    static func main() throws {
        let now = Date(timeIntervalSince1970: 10_000)
        let first = SupportRequest(id: 1, page: "Survival Node", customerName: "  ", escalatedAt: "")
        let second = SupportRequest(id: 2, page: "Survival Node", customerName: "Sam", escalatedAt: "")
        var memory = AlertMemory()
        assert(memory.pending([first, second], now: now).map(\.id) == [2, 1], "New requests must appear first")
        memory.snooze(2, now: now)
        assert(memory.pending([first, second], now: now).map(\.id) == [1], "Snooze must not hide other customers")
        assert(memory.pending([first, second], now: now.addingTimeInterval(60)).count == 2, "Snooze must expire")
        memory.acknowledge(1)
        let restored = try JSONDecoder().decode(AlertMemory.self, from: JSONEncoder().encode(memory))
        assert(restored.pending([first, second], now: now.addingTimeInterval(61)).map(\.id) == [2], "Acknowledgement must survive restart")
        memory.pausedUntil = now.addingTimeInterval(900)
        assert(memory.pending([first, second], now: now).isEmpty)
        assert(memory.pending([first, second], now: now.addingTimeInterval(901)).map(\.id) == [2])
        assert(memory.pending([], now: now.addingTimeInterval(901)).isEmpty, "Closed/answered sessions must clear")
        assert(first.displayName == "A customer")
        assert(second.chatURL.absoluteString == "https://www.easternshore.ai/support-chat.html#session=2")
        let response = Data("{\"ok\":true,\"sessions\":[{\"id\":42,\"page\":null,\"customer_name\":null,\"escalated_at\":\"2026-09-12T12:00:00Z\"}]}".utf8)
        let decoded = try JSONDecoder().decode(SupportResponse.self, from: response)
        assert(decoded.sessions.first?.id == 42)
        print("PASS: ordering, independent snooze, expiry, persistence, pause/resume, resolved requests, safe links and API decoding")
    }
}
