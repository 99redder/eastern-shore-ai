import Foundation

struct SupportRequest: Codable, Equatable, Identifiable {
    let id: Int
    let page: String?
    let customerName: String?
    let escalatedAt: String

    enum CodingKeys: String, CodingKey {
        case id, page
        case customerName = "customer_name"
        case escalatedAt = "escalated_at"
    }

    var displayName: String {
        let name = (customerName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return name.isEmpty ? "A customer" : String(name.prefix(100))
    }

    var chatURL: URL {
        // Build locally: never open an arbitrary URL supplied in customer data.
        URL(string: "https://www.easternshore.ai/support-chat.html#session=\(id)")!
    }
}

struct SupportResponse: Decodable {
    let ok: Bool
    let sessions: [SupportRequest]
}

struct AlertMemory: Codable {
    var acknowledged: Set<Int> = []
    var snoozedUntil: [Int: Date] = [:]
    var pausedUntil: Date?

    func pending(_ requests: [SupportRequest], now: Date) -> [SupportRequest] {
        if let until = pausedUntil, until > now { return [] }
        return requests.filter {
            !acknowledged.contains($0.id) && (snoozedUntil[$0.id] ?? .distantPast) <= now
        }.sorted { $0.id > $1.id }
    }

    mutating func acknowledge(_ id: Int) {
        acknowledged.insert(id)
        snoozedUntil.removeValue(forKey: id)
    }

    mutating func snooze(_ id: Int, now: Date) {
        snoozedUntil[id] = now.addingTimeInterval(60)
    }
}

enum SupportAPIError: Error {
    case unauthorized, unavailable, invalidResponse
}

final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

enum SupportAPI {
    static let endpoint = URL(string: "https://eastern-shore-ai-contact.99redder.workers.dev/api/chat/alerts")!
    private static let session = URLSession(configuration: .ephemeral, delegate: NoRedirects(), delegateQueue: nil)

    static func requests(token: String) async throws -> [SupportRequest] {
        var request = URLRequest(url: endpoint, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.setValue(token, forHTTPHeaderField: "X-Support-Notify-Token")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw SupportAPIError.invalidResponse }
        if [401, 403].contains(response.statusCode) { throw SupportAPIError.unauthorized }
        guard response.statusCode == 200 else { throw SupportAPIError.unavailable }
        guard data.count <= 256_000 else { throw SupportAPIError.invalidResponse }
        let payload = try JSONDecoder().decode(SupportResponse.self, from: data)
        guard payload.ok, payload.sessions.allSatisfy({ $0.id > 0 }) else { throw SupportAPIError.invalidResponse }
        return payload.sessions
    }
}
