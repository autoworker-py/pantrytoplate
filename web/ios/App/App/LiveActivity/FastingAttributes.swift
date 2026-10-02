import Foundation

#if canImport(ActivityKit)
import ActivityKit

/**
 Shape of the fasting Live Activity: the fast, or the eating window, on the
 Lock Screen and in the Dynamic Island.

 Compiled into both the app (which starts it) and the widget extension (which
 draws it), like the cook timer's. The state is the phase and its two instants;
 the system counts down between them by itself, so it stays right with the app
 closed. iOS ends an activity after eight hours, so the app starts it again
 whenever it is opened, and the notifications cover the change of phase.
 */
@available(iOS 16.1, *)
struct FastingAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// fasting, or the eating window
        var fasting: Bool
        /// when this phase began, and when it ends
        var since: Date
        var until: Date
    }

    /// the plan, e.g. "16:8"
    var plan: String
}
#endif
