import Foundation
import Testing
@testable import Jesters

struct APIErrorTests {
    /// Same domain and details key as FirebaseFunctions' `FunctionsErrorDomain` / `FunctionsErrorDetailsKey`.
    private func functionsError(reason: String) -> NSError {
        NSError(domain: "com.firebase.functions", code: 9, userInfo: ["details": ["reason": reason]])
    }

    @Test func readsTheReasonFromTheErrorDetails() {
        #expect(APIError.reason(of: functionsError(reason: "ROOM_FULL")) == "ROOM_FULL")
        #expect(APIError.reason(of: NSError(domain: "other", code: 1)) == nil)
    }

    @Test func mapsReasonsToMessages() {
        #expect(
            APIError.message(for: functionsError(reason: "MUST_FOLLOW_SUIT"))
                == APIError.message(forReason: "MUST_FOLLOW_SUIT")
        )
        #expect(APIError.message(forReason: "ROOM_FULL") != APIError.message(forReason: "UNKNOWN"))
    }
}
