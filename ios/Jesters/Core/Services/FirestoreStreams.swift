import FirebaseFirestore

/// A document or query result with its Firestore document id.
struct Identified<Value: Sendable>: Identifiable, Sendable {
    let id: String
    let value: Value
}

/// Removes the snapshot listener when the stream ends (e.g. when the observing view's task is cancelled).
private final class ListenerBox: @unchecked Sendable {
    private let registration: ListenerRegistration

    init(_ registration: ListenerRegistration) {
        self.registration = registration
    }

    func remove() {
        registration.remove()
    }
}

extension DocumentReference {
    /// The decoded document after every change; `nil` while it does not exist.
    func values<T: Decodable & Sendable>(_ type: T.Type) -> AsyncThrowingStream<T?, Error> {
        AsyncThrowingStream { continuation in
            let registration = addSnapshotListener { snapshot, error in
                if let error {
                    continuation.finish(throwing: error)
                    return
                }
                guard let snapshot, snapshot.exists else {
                    continuation.yield(nil)
                    return
                }
                do {
                    continuation.yield(try snapshot.data(as: T.self))
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            let box = ListenerBox(registration)
            continuation.onTermination = { _ in box.remove() }
        }
    }
}

extension Query {
    /// The decoded documents after every change. Documents that fail to decode are skipped.
    func values<T: Decodable & Sendable>(_ type: T.Type) -> AsyncThrowingStream<[Identified<T>], Error> {
        AsyncThrowingStream { continuation in
            let registration = addSnapshotListener { snapshot, error in
                if let error {
                    continuation.finish(throwing: error)
                    return
                }
                let values = snapshot?.documents.compactMap { document in
                    (try? document.data(as: T.self)).map { Identified(id: document.documentID, value: $0) }
                } ?? []
                continuation.yield(values)
            }
            let box = ListenerBox(registration)
            continuation.onTermination = { _ in box.remove() }
        }
    }
}
