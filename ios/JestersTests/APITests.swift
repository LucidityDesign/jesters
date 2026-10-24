import Foundation
import Testing
@testable import Jesters

struct APITests {
    @Test func decodesPingResponse() throws {
        let json = Data(#"{"ok":true,"uid":"u1","echo":null}"#.utf8)
        let response = try JSONDecoder().decode(PingResponse.self, from: json)
        #expect(response == PingResponse(ok: true, uid: "u1", echo: nil))
    }

    @Test func omitsMissingPingMessage() throws {
        let json = try JSONEncoder().encode(PingRequest(message: nil))
        #expect(String(decoding: json, as: UTF8.self) == "{}")
    }
}
