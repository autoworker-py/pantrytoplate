import Foundation

/**
 The shopping list as the widget shows it: what is left to get, each line's
 name and amount already in words. The app leaves one in the App Group each
 time the list changes, and the widget refreshes it from the server now and
 then. Built into both the app and the widget extension.
 */
struct ShoppingLine: Codable, Hashable {
    let name: String
    let amount: String
}

struct ShoppingSnapshot: Codable {
    static let group = "group.com.connordavidson.pantrytoplate"
    static let key = "shopping"
    static let widgetKind = "ShoppingListWidget"

    let items: [ShoppingLine]
    let updatedAt: Date

    static func load() -> ShoppingSnapshot? {
        guard let data = UserDefaults(suiteName: group)?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(ShoppingSnapshot.self, from: data)
    }

    func save() {
        guard let data = try? JSONEncoder().encode(self) else { return }
        UserDefaults(suiteName: Self.group)?.set(data, forKey: Self.key)
    }

    static func clear() {
        UserDefaults(suiteName: group)?.removeObject(forKey: key)
    }
}
