import ActivityKit
import SwiftUI
import WidgetKit

/*
 * The fast on the Lock Screen and in the Dynamic Island: which phase, until
 * when, the time left counting down, and a bar filling as it goes. All of it
 * is drawn by the system from the phase's two instants, so it needs no updates.
 */

private let brand = Color(red: 0.42, green: 0.10, blue: 0.07)   // the app's red
private let ground = Color(red: 0.94, green: 0.93, blue: 0.91)  // the app's ground
private let ink = Color(red: 0.16, green: 0.09, blue: 0.05)

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
                        .foregroundColor(ink.opacity(0.65))
                    }
                    Spacer(minLength: 8)
                    Text(timerInterval: context.state.since...context.state.until, countsDown: true)
                        .font(.system(.title, design: .rounded).weight(.bold))
                        .monospacedDigit()
                        .foregroundColor(brand)
                        .frame(maxWidth: 120, alignment: .trailing)
                }
                ProgressView(timerInterval: context.state.since...context.state.until, countsDown: false) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
                .tint(brand)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .activityBackgroundTint(ground)
            .activitySystemActionForegroundColor(brand)

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
            } compactTrailing: {
                Text(timerInterval: context.state.since...context.state.until, countsDown: true)
                    .monospacedDigit()
                    .frame(maxWidth: 52)
            } minimal: {
                Image(systemName: context.state.fasting ? "hourglass" : "fork.knife")
            }
        }
    }
}
