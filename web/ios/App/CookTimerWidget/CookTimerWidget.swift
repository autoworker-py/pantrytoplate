import ActivityKit
import SwiftUI
import WidgetKit

/*
 * The cook timer on the Lock Screen and in the Dynamic Island.
 *
 * Everything here counts down from a date range rather than from a number the
 * app pushes in. Text(timerInterval:) is rendered by the system, so it stays
 * correct while the app is suspended or terminated and costs no updates.
 */

private let brand = Color(red: 0.42, green: 0.10, blue: 0.07)   // the app's red
private let ground = Color(red: 0.94, green: 0.93, blue: 0.91)  // the app's ground
private let ink = Color(red: 0.16, green: 0.09, blue: 0.05)

@available(iOS 16.2, *)
struct CookTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CookTimerAttributes.self) { context in
            // ---- Lock Screen / banner ----
            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(context.attributes.recipeName)
                        .font(.headline)
                        .foregroundColor(ink)
                        .lineLimit(1)
                    Text(context.attributes.stepLabel)
                        .font(.caption)
                        .foregroundColor(ink.opacity(0.65))
                        .lineLimit(2)
                }
                Spacer(minLength: 8)
                Text(timerInterval: context.state.startedAt...context.state.endsAt, countsDown: true)
                    .font(.system(.title, design: .rounded).weight(.bold))
                    .monospacedDigit()
                    .foregroundColor(brand)
                    .frame(maxWidth: 96, alignment: .trailing)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .activityBackgroundTint(ground)
            .activitySystemActionForegroundColor(brand)

        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.attributes.recipeName)
                        .font(.caption).bold()
                        .lineLimit(1)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: context.state.startedAt...context.state.endsAt, countsDown: true)
                        .font(.system(.title2, design: .rounded).weight(.bold))
                        .monospacedDigit()
                        .frame(maxWidth: 88, alignment: .trailing)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.attributes.stepLabel)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }
            } compactLeading: {
                Image(systemName: "timer")
            } compactTrailing: {
                Text(timerInterval: context.state.startedAt...context.state.endsAt, countsDown: true)
                    .monospacedDigit()
                    .frame(maxWidth: 44)
            } minimal: {
                Image(systemName: "timer")
            }
        }
    }
}

@main
struct CookTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        CookTimerLiveActivity()
    }
}
