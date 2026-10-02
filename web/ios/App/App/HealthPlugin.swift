import Capacitor
import Foundation
import HealthKit

/**
 Apple Health, read on the phone and nothing more: the steps and active
 calories of a day, and, only once the person switches on the sleep insight,
 when they fell asleep and woke. Nothing is written to Health, and what is read
 goes to the web layer on this phone, never to the app's server.

 Health never says whether reading was allowed (that is private to the person),
 so a day with nothing allowed simply reads as nothing.
 */
@objc(HealthPlugin)
public class HealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthPlugin"
    public let jsName = "Health"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestSleep", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "activity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sleep", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()
    private let energy = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!
    private let steps = HKQuantityType.quantityType(forIdentifier: .stepCount)!
    private let sleepType = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis)!

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    /// Steps and active energy: the main "Connect to Apple Health".
    @objc func requestActivity(_ call: CAPPluginCall) {
        ask(for: [energy, steps], call)
    }

    /// Sleep, asked for separately, from the sleep insight.
    @objc func requestSleep(_ call: CAPPluginCall) {
        ask(for: [sleepType], call)
    }

    private func ask(for types: Set<HKObjectType>, _ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["asked": false])
            return
        }
        store.requestAuthorization(toShare: nil, read: types) { done, error in
            if let error = error { NSLog("[Health] could not ask: %@", String(describing: error)) }
            call.resolve(["asked": done])
        }
    }

    /// A day's steps and active calories, the day given as "YYYY-MM-DD" on the phone's clock.
    @objc func activity(_ call: CAPPluginCall) {
        guard let day = call.getString("day"), let start = Self.dayStart(day) else {
            call.reject("day is required")
            return
        }
        let end = Calendar.current.date(byAdding: .day, value: 1, to: start)!
        let group = DispatchGroup()
        var kcal = 0.0
        var count = 0.0
        group.enter()
        sum(energy, unit: .kilocalorie(), from: start, to: end) { kcal = $0; group.leave() }
        group.enter()
        sum(steps, unit: .count(), from: start, to: end) { count = $0; group.leave() }
        group.notify(queue: .main) {
            call.resolve(["activeKcal": Int(kcal.rounded()), "steps": Int(count.rounded())])
        }
    }

    private func sum(_ type: HKQuantityType, unit: HKUnit, from: Date, to: Date, done: @escaping (Double) -> Void) {
        let range = HKQuery.predicateForSamples(withStart: from, end: to, options: .strictStartDate)
        let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: range, options: .cumulativeSum) { _, stats, _ in
            done(stats?.sumQuantity()?.doubleValue(for: unit) ?? 0)
        }
        store.execute(query)
    }

    /**
     The last nights' sleep: when sleep began and ended, and the minutes asleep.
     A night belongs to the evening it started on (falling asleep at 1 am is
     still the night of the day before), which is the day its dinner was eaten.
     */
    @objc func sleep(_ call: CAPPluginCall) {
        let days = call.getInt("days") ?? 30
        let start = Calendar.current.date(byAdding: .day, value: -days, to: Date())!
        let range = HKQuery.predicateForSamples(withStart: start, end: Date(), options: [])
        let order = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
        let query = HKSampleQuery(sampleType: sleepType, predicate: range, limit: HKObjectQueryNoLimit, sortDescriptors: order) { _, samples, _ in
            let asleep = (samples as? [HKCategorySample] ?? []).filter { sample in
                sample.value != HKCategoryValueSleepAnalysis.inBed.rawValue && sample.value != HKCategoryValueSleepAnalysis.awake.rawValue
            }
            // samples closer than three hours apart are the same night
            var nights: [(start: Date, end: Date, seconds: Double)] = []
            for sample in asleep {
                if let last = nights.last, sample.startDate.timeIntervalSince(last.end) < 3 * 3600 {
                    nights[nights.count - 1] = (last.start, max(last.end, sample.endDate), last.seconds + sample.endDate.timeIntervalSince(sample.startDate))
                } else {
                    nights.append((sample.startDate, sample.endDate, sample.endDate.timeIntervalSince(sample.startDate)))
                }
            }
            let iso = ISO8601DateFormatter()
            let out = nights.filter { $0.seconds >= 2 * 3600 }.map { night -> [String: Any] in
                let evening = Calendar.current.date(byAdding: .hour, value: -12, to: night.start)!
                return ["day": Self.dayString(evening), "asleepAt": iso.string(from: night.start), "wokeAt": iso.string(from: night.end), "minutes": Int(night.seconds / 60)]
            }
            call.resolve(["nights": out])
        }
        store.execute(query)
    }

    private static func dayStart(_ day: String) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    private static func dayString(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }
}
