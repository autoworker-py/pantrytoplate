import SwiftUI
import WidgetKit

/*
 * The shopping list on the Home Screen and Lock Screen, for the shop: what is
 * left to get, at a glance, and a tap opens the list. The app leaves a copy in
 * the App Group whenever the list changes; the widget also asks the server
 * itself every half hour or so, so what a housemate adds turns up without
 * anyone opening the app.
 */

// the app's Night palette
private let night = Color(red: 0.071, green: 0.078, blue: 0.086)   // --bg-1
private let ink = Color(red: 0.937, green: 0.914, blue: 0.875)     // --ink
private let ink3 = ink.opacity(0.46)
private let warm = Color(red: 0.953, green: 0.788, blue: 0.545)    // --warm
private let openList = URL(string: "pantrytoplate://shopping")

struct ShoppingEntry: TimelineEntry {
    let date: Date
    /// nil until the app has signed in and left a list
    let items: [ShoppingLine]?

    static let sample = ShoppingEntry(date: Date(), items: [
        ShoppingLine(name: "Eggs", amount: "12"),
        ShoppingLine(name: "Whole Milk", amount: "1 l"),
        ShoppingLine(name: "Spinach", amount: "200 g"),
        ShoppingLine(name: "Feta", amount: "150 g"),
        ShoppingLine(name: "Lemons", amount: "2"),
        ShoppingLine(name: "Greek Yogurt", amount: "500 g"),
    ])
}

/// The list from the server, with the session the app shares through the App Group.
private struct ServerList: Decodable {
    struct Item: Decodable {
        let name: String
        let quantityNeeded: Double
        let unit: String
        let isChecked: Bool
    }
    let items: [Item]
}

/// Amounts as the app writes them: "12", "200 g", "2 cups", "1 fl oz".
private func amountText(_ quantity: Double, _ unit: String) -> String {
    let size = abs(quantity)
    let decimals = size >= 100 ? 0 : size >= 10 ? 1 : size >= 1 ? 2 : 3
    var figure = String(format: "%.\(decimals)f", quantity)
    if figure.contains(".") {
        while figure.hasSuffix("0") { figure.removeLast() }
        if figure.hasSuffix(".") { figure.removeLast() }
    }
    if unit == "count" { return figure }
    let fixed: Set<String> = ["g", "kg", "mg", "ml", "l", "oz", "lb", "tsp", "tbsp", "floz", "dozen"]
    let said = figure == "1" || fixed.contains(unit) ? unit : unit + "s"
    return "\(figure) \(said == "floz" ? "fl oz" : said)"
}

private func fetchList() async -> [ShoppingLine]? {
    let shared = UserDefaults(suiteName: ShoppingSnapshot.group)
    guard let token = shared?.string(forKey: "token"), let api = shared?.string(forKey: "apiUrl"), !api.isEmpty,
          let endpoint = URL(string: "\(api)/api/shopping-list") else { return nil }
    var request = URLRequest(url: endpoint, timeoutInterval: 8)
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    guard let (data, response) = try? await URLSession.shared.data(for: request),
          (response as? HTTPURLResponse)?.statusCode == 200,
          let list = try? JSONDecoder().decode(ServerList.self, from: data) else { return nil }
    return list.items.filter { !$0.isChecked }.map { ShoppingLine(name: $0.name, amount: amountText($0.quantityNeeded, $0.unit)) }
}

struct ShoppingProvider: TimelineProvider {
    func placeholder(in context: Context) -> ShoppingEntry { .sample }

    func getSnapshot(in context: Context, completion: @escaping (ShoppingEntry) -> Void) {
        let saved = ShoppingSnapshot.load()
        completion(context.isPreview && saved == nil ? .sample : ShoppingEntry(date: Date(), items: saved?.items))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ShoppingEntry>) -> Void) {
        Task {
            var saved = ShoppingSnapshot.load()
            // the app has only just written it: no need to ask again
            let fresh = saved.map { Date().timeIntervalSince($0.updatedAt) < 120 } ?? false
            // signed out leaves no session and no list, and the widget says so
            let signedIn = UserDefaults(suiteName: ShoppingSnapshot.group)?.string(forKey: "token") != nil
            if signedIn, !fresh, let items = await fetchList() {
                saved = ShoppingSnapshot(items: items, updatedAt: Date())
                saved?.save()
            }
            let entry = ShoppingEntry(date: Date(), items: signedIn ? saved?.items : nil)
            completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(30 * 60))))
        }
    }
}

private struct Bullet: View {
    var body: some View {
        Circle().strokeBorder(ink3, lineWidth: 1.2).frame(width: 9, height: 9)
    }
}

private struct Line: View {
    let line: ShoppingLine
    let showAmount: Bool
    var body: some View {
        HStack(spacing: 8) {
            Bullet()
            Text(line.name).font(.system(size: 14, weight: .medium)).foregroundColor(ink).lineLimit(1)
            if showAmount, !line.amount.isEmpty {
                Spacer(minLength: 4)
                Text(line.amount).font(.system(size: 13, weight: .regular).monospacedDigit()).foregroundColor(ink3).lineLimit(1)
            }
        }
    }
}

private struct Header: View {
    let count: Int
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("SHOPPING").font(.system(size: 11, weight: .bold)).tracking(1).foregroundColor(warm)
            Spacer(minLength: 4)
            Text(count == 0 ? "" : "\(count) to get").font(.system(size: 12, weight: .semibold).monospacedDigit()).foregroundColor(ink3)
        }
    }
}

struct ShoppingWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ShoppingEntry

    var body: some View {
        switch family {
        case .accessoryInline: inline
        case .accessoryCircular: circular.clearBackground()
        case .accessoryRectangular: rectangular.clearBackground()
        default: system.nightBackground()
        }
    }

    private var items: [ShoppingLine] { entry.items ?? [] }

    private var rows: Int {
        switch family {
        case .systemLarge: return 11
        case .systemMedium: return 6
        default: return 4
        }
    }

    @ViewBuilder private var system: some View {
        VStack(alignment: .leading, spacing: family == .systemSmall ? 7 : 8) {
            Header(count: items.count)
            if entry.items == nil {
                Spacer(minLength: 0)
                Text("Open Pantry2Plate to see your list here.").font(.system(size: 14, weight: .medium)).foregroundColor(ink)
                Spacer(minLength: 0)
            } else if items.isEmpty {
                Spacer(minLength: 0)
                Text("Nothing to get.").font(.system(size: 17, weight: .semibold)).foregroundColor(ink)
                Text("Add to the list in the app.").font(.system(size: 12)).foregroundColor(ink3)
                Spacer(minLength: 0)
            } else if family == .systemMedium {
                // two short columns read faster than one long one
                let shown = Array(items.prefix(rows))
                let half = (shown.count + 1) / 2
                HStack(alignment: .top, spacing: 14) {
                    VStack(alignment: .leading, spacing: 8) { ForEach(shown.prefix(half), id: \.self) { Line(line: $0, showAmount: false) } }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    VStack(alignment: .leading, spacing: 8) { ForEach(shown.dropFirst(half), id: \.self) { Line(line: $0, showAmount: false) } }
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                more(shown.count)
            } else {
                let shown = Array(items.prefix(rows))
                ForEach(shown, id: \.self) { Line(line: $0, showAmount: family == .systemLarge) }
                more(shown.count)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(openList)
    }

    @ViewBuilder private func more(_ shown: Int) -> some View {
        Spacer(minLength: 0)
        if items.count > shown {
            Text("+ \(items.count - shown) more").font(.system(size: 12, weight: .medium)).foregroundColor(ink3)
        }
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(items.isEmpty ? "Shopping" : "Shopping · \(items.count)").font(.headline).widgetAccentable()
            Text(entry.items == nil ? "Open the app to see it" : items.isEmpty ? "Nothing to get" : items.prefix(3).map(\.name).joined(separator: ", "))
                .font(.caption)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(openList)
    }

    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Image(systemName: "bag").font(.system(size: 13, weight: .semibold))
                Text("\(items.count)").font(.system(size: 17, weight: .bold).monospacedDigit())
            }
        }
        .widgetURL(openList)
    }

    private var inline: some View {
        Text(items.isEmpty ? "Nothing to get" : "\(items.count) to get · \(items.prefix(2).map(\.name).joined(separator: ", "))")
            .widgetURL(openList)
    }
}

private extension View {
    @ViewBuilder func nightBackground() -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(night, for: .widget)
        } else {
            padding(16).background(night)
        }
    }

    @ViewBuilder func clearBackground() -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(for: .widget) { Color.clear }
        } else {
            self
        }
    }
}

struct ShoppingListWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: ShoppingSnapshot.widgetKind, provider: ShoppingProvider()) { entry in
            ShoppingWidgetView(entry: entry)
        }
        .configurationDisplayName("Shopping list")
        .description("What’s left to get, for when you’re at the shop.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}
