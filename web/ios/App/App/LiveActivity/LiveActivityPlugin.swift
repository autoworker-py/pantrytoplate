import Capacitor
import Foundation

#if canImport(ActivityKit)
import ActivityKit
#endif

/**
 Bridges the cook timer Live Activity to the web layer.

 The web view cannot talk to ActivityKit, so starting and ending the Lock Screen
 timer has to cross into native code. Deliberately small: start one activity,
 end whatever is running. There is no update call, because the countdown needs
 none — the system draws it from the end date.

 Every entry point degrades quietly on a device or setting that cannot show
 activities, since the in-app timer and the notification still work without it.
 */
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    /// Live Activities need iOS 16.2 and the per-app switch in Settings.
    @objc func isSupported(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
            return
        }
        #endif
        call.resolve(["supported": false])
    }

    @objc func start(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                // the person turned them off for this app; not an error
                call.resolve(["started": false, "reason": "disabled"])
                return
            }

            // milliseconds since the epoch, matching the deadline the web layer
            // already keeps, so both countdowns come from one instant
            let endsAtMs = call.getDouble("endsAt") ?? 0
            guard endsAtMs > 0 else {
                call.reject("endsAt is required")
                return
            }
            let endsAt = Date(timeIntervalSince1970: endsAtMs / 1000)
            guard endsAt > Date() else {
                call.resolve(["started": false, "reason": "already_past"])
                return
            }

            let attributes = CookTimerAttributes(
                recipeName: call.getString("recipeName") ?? "Cook timer",
                stepLabel: call.getString("stepLabel") ?? ""
            )
            let state = CookTimerAttributes.ContentState(startedAt: Date(), endsAt: endsAt)

            do {
                // end any previous one first: a second timer replacing the first
                // should replace it on the Lock Screen too
                endAllActivities()
                let activity = try Activity.request(
                    attributes: attributes,
                    content: .init(state: state, staleDate: endsAt.addingTimeInterval(60)),
                    pushType: nil
                )
                call.resolve(["started": true, "id": activity.id])
            } catch {
                // a silent failure here is what made the first attempt look like it worked
                NSLog("[LiveActivity] could not start: %@", String(describing: error))
                call.resolve(["started": false, "reason": String(describing: error)])
            }
            return
        }
        #endif
        call.resolve(["started": false, "reason": "unsupported"])
    }

    @objc func end(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            endAllActivities()
        }
        #endif
        call.resolve()
    }

    #if canImport(ActivityKit)
    @available(iOS 16.2, *)
    private func endAllActivities() {
        for activity in Activity<CookTimerAttributes>.activities {
            Task { await activity.end(nil, dismissalPolicy: .immediate) }
        }
    }
    #endif
}
