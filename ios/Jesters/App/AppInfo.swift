import Foundation

enum AppInfo {
    /// Set as `PrivacyPolicyURL` in project.yml; `nil` while empty.
    static var privacyPolicyURL: URL? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "PrivacyPolicyURL") as? String,
              !value.isEmpty else { return nil }
        return URL(string: value)
    }
}
