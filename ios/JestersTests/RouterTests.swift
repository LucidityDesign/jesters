import Foundation
import Testing
@testable import Jesters

struct RouterTests {
    @Test(arguments: [
        ("jesters://join/K7Q2XM", "K7Q2XM"),
        ("jesters://join/k7q2xm", "K7Q2XM"),
        ("https://example.com/join/K7Q2XM", "K7Q2XM"),
    ])
    func readsRoomKeys(url: String, key: String) throws {
        #expect(Router.roomKey(from: try #require(URL(string: url))) == key)
    }

    @Test(arguments: [
        "jesters://join/K7Q2X",
        "jesters://join/K7Q2X0",
        "jesters://open/K7Q2XM",
        "jesters://join/K7Q2XM/extra",
        "https://example.com/K7Q2XM",
    ])
    func rejectsOtherLinks(url: String) throws {
        #expect(Router.roomKey(from: try #require(URL(string: url))) == nil)
    }
}
