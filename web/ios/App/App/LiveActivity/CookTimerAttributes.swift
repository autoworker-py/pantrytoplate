import Foundation

#if canImport(ActivityKit)
import ActivityKit

/**
 Shape of the cook timer Live Activity.

 Compiled into both the app (which starts and ends the activity) and the widget
 extension (which draws it). Both sides must agree on this exactly, so it lives
 in one file that belongs to both targets rather than being written twice.

 The state carries the two instants of the timer rather than a remaining count.
 SwiftUI can render a countdown between two dates entirely on its own, so the
 Lock Screen keeps ticking with the app closed and no updates sent to it. A
 stored "seconds left" would be frozen the moment the app suspended — the same
 mistake the in-app timer used to make.
 */
@available(iOS 16.1, *)
struct CookTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// when the timer was started
        var startedAt: Date
        /// when it finishes; the Lock Screen counts down to this by itself
        var endsAt: Date
    }

    /// the recipe being cooked, shown as the activity's title
    var recipeName: String
    /// the step being timed
    var stepLabel: String
}
#endif
