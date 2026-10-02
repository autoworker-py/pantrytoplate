import Capacitor
import Foundation
import UIKit
import WidgetKit

/**
 What the app's extensions share with it through the App Group: the session
 the share extension and the shopping widget sign in with, and the list the
 widget shows; both cleared on sign-out. Also passes the widget's tap on to
 the web app as a route to open.
 */
@objc(ShareBridgePlugin)
public class ShareBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShareBridgePlugin"
    public let jsName = "ShareBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setShopping", returnType: CAPPluginReturnPromise),
    ]

    private let shared = UserDefaults(suiteName: "group.com.connordavidson.pantrytoplate")

    @objc func setSession(_ call: CAPPluginCall) {
        shared?.set(call.getString("token"), forKey: "token")
        shared?.set(call.getString("apiUrl"), forKey: "apiUrl")
        call.resolve()
    }

    @objc func clearSession(_ call: CAPPluginCall) {
        shared?.removeObject(forKey: "token")
        // a signed-out phone doesn't show anyone's list
        ShoppingSnapshot.clear()
        WidgetCenter.shared.reloadTimelines(ofKind: ShoppingSnapshot.widgetKind)
        call.resolve()
    }

    /// What is left to get, as the app shows it, for the widget.
    @objc func setShopping(_ call: CAPPluginCall) {
        let lines = (call.getArray("items", JSObject.self) ?? []).compactMap { item -> ShoppingLine? in
            guard let name = item["name"] as? String else { return nil }
            return ShoppingLine(name: name, amount: item["amount"] as? String ?? "")
        }
        ShoppingSnapshot(items: lines, updatedAt: Date()).save()
        WidgetCenter.shared.reloadTimelines(ofKind: ShoppingSnapshot.widgetKind)
        call.resolve()
    }

    override public func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(opened(_:)), name: .capacitorOpenURL, object: nil)
        // leaving the app is when the list on the Home Screen next matters: have it check for changes
        NotificationCenter.default.addObserver(self, selector: #selector(leaving), name: UIApplication.didEnterBackgroundNotification, object: nil)
    }

    @objc private func leaving() {
        WidgetCenter.shared.reloadTimelines(ofKind: ShoppingSnapshot.widgetKind)
    }

    /// pantrytoplate://shopping, from the widget: kept until the web app is listening, on a cold start too.
    @objc private func opened(_ notification: Notification) {
        guard let object = notification.object as? [String: Any], let url = object["url"] as? URL, url.scheme == "pantrytoplate" else { return }
        let routes = ["shopping": "/shopping"]
        guard let host = url.host, let path = routes[host] else { return }
        notifyListeners("route", data: ["path": path], retainUntilConsumed: true)
    }
}
