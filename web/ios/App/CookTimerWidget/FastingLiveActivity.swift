import ActivityKit
import SwiftUI
import WidgetKit

/*
 * The fast on the Lock Screen and in the Dynamic Island: which phase, until
 * when, the time left counting down, and a bar filling as it goes. All of it
 * is drawn by the system from the phase's two instants, so it needs no updates.
 */

// the app's Night palette, as in the Shopping widget
private let night = Color(red: 0.071, green: 0.078, blue: 0.086)   // --bg-1
private let ink = Color(red: 0.937, green: 0.914, blue: 0.875)     // --ink
private let warm = Color(red: 0.953, green: 0.788, blue: 0.545)    // --warm

@available(iOS 16.2, *)
struct FastingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FastingAttributes.self) { context in
            // ---- Lock Screen / banner ----
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center, spacing: 14) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(context.state.fasting ? "Fasting" : "Eating window")
                            .font(.headline)
                            .foregroundColor(ink)
                        HStack(spacing: 4) {
                            Text(context.state.fasting ? "\(context.attributes.plan) · eat at" : "\(context.attributes.plan) · until")
                            Text(context.state.until, style: .time)
                        }
                        .font(.caption)
                        .foregroundColor(ink.opacity(0.6))
                    }
                    Spacer(minLength: 8)
                    Text(timerInterval: context.state.since...context.state.until, countsDown: true)
                        .font(.system(.title, design: .rounded).weight(.bold))
                        .monospacedDigit()
                        .foregroundColor(warm)
                        .frame(maxWidth: 120, alignment: .trailing)
                }
                ProgressView(timerInterval: context.state.since...context.state.until, countsDown: false) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
                .tint(warm)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .activityBackgroundTint(night)
            .activitySystemActionForegroundColor(ink)

        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.state.fasting ? "Fasting" : "Eating")
                        .font(.caption).bold()
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: context.state.since...context.state.until, countsDown: true)
                        .font(.system(.title2, design: .rounded).weight(.bold))
                        .monospacedDigit()
                        .frame(maxWidth: 100, alignment: .trailing)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 4) {
                        Text(context.state.fasting ? "Eat at" : "Window closes at")
                        Text(context.state.until, style: .time)
                    }
                    .font(.caption)
                    .foregroundColor(.secondary)
                }
            } compactLeading: {
                Image(systemName: context.state.fasting ? "hourglass" : "fork.knife")
                    .foregroundColor(warm)
            } compactTrailing: {
                Text(timerInterval: context.state.since...context.state.until, countsDown: true)
                    .monospacedDigit()
                    .frame(maxWidth: 52)
            } minimal: {
                Image(systemName: context.state.fasting ? "hourglass" : "fork.knife")
                    .foregroundColor(warm)
            }
        }
    }
}
