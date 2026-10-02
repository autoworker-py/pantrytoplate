import Capacitor
import Foundation

/**
 Hands the share extension the session it signs in with: the app's token and
 server, kept in the App Group both can read, and cleared on sign-out.
 */
@objc(ShareBridgePlugin)
public class ShareBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShareBridgePlugin"
    public let jsName = "ShareBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSession", returnType: CAPPluginReturnPromise),
    ]

    private let shared = UserDefaults(suiteName: "group.com.connordavidson.pantrytoplate")

    @objc func setSession(_ call: CAPPluginCall) {
        shared?.set(call.getString("token"), forKey: "token")
        shared?.set(call.getString("apiUrl"), forKey: "apiUrl")
        call.resolve()
    }

    @objc func clearSession(_ call: CAPPluginCall) {
        shared?.removeObject(forKey: "token")
        call.resolve()
    }
}
