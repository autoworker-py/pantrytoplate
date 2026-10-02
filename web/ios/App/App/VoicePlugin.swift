import AVFoundation
import Capacitor
import Foundation
import Speech

/**
 Hands-free cooking: while switched on in cook mode, listens for "next",
 "back", "repeat" and "timer" and tells the web layer each time it hears one.
 Recognition runs on the phone where iOS can (it can for English on recent
 iPhones), and nothing heard is kept or sent anywhere.

 A recognition task stops by itself after about a minute, so a fresh one is
 started before then, and again whenever one ends, for as long as it's on.
 */
@objc(VoicePlugin)
public class VoicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VoicePlugin"
    public let jsName = "Voice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private let engine = AVAudioEngine()
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var renew: Timer?
    private var listening = false
    /// words in the current task already acted on, so a word is only heard once
    private var heard = 0

    @objc func start(_ call: CAPPluginCall) {
        guard let recognizer = recognizer, recognizer.isAvailable else {
            call.resolve(["listening": false, "reason": "unavailable"])
            return
        }
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                call.resolve(["listening": false, "reason": "speech_denied"])
                return
            }
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                guard granted else {
                    call.resolve(["listening": false, "reason": "microphone_denied"])
                    return
                }
                DispatchQueue.main.async {
                    do {
                        self.listening = true
                        try self.begin()
                        call.resolve(["listening": true, "onDevice": recognizer.supportsOnDeviceRecognition])
                    } catch {
                        self.listening = false
                        NSLog("[Voice] could not listen: %@", String(describing: error))
                        call.resolve(["listening": false, "reason": String(describing: error)])
                    }
                }
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.listening = false
            self.end()
            call.resolve()
        }
    }

    private func begin() throws {
        end()
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker, .allowBluetooth])
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.contextualStrings = ["next", "back", "repeat", "timer"]
        if recognizer?.supportsOnDeviceRecognition == true { request.requiresOnDeviceRecognition = true }
        self.request = request

        let input = engine.inputNode
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
            request.append(buffer)
        }
        engine.prepare()
        try engine.start()

        heard = 0
        task = recognizer?.recognitionTask(with: request) { [weak self] result, error in
            guard let self = self else { return }
            if let result = result {
                let words = result.bestTranscription.segments.map { $0.substring.lowercased() }
                if words.count > self.heard {
                    for word in words[self.heard...] {
                        if let command = Self.command(word) { self.notifyListeners("command", data: ["command": command]) }
                    }
                    self.heard = words.count
                }
                if result.isFinal { self.again() }
            } else if error != nil {
                self.again()
            }
        }
        renew = Timer.scheduledTimer(withTimeInterval: 50, repeats: false) { [weak self] _ in self?.again() }
    }

    private static func command(_ word: String) -> String? {
        switch word.trimmingCharacters(in: .punctuationCharacters) {
        case "next", "forward": return "next"
        case "back", "previous": return "back"
        case "repeat", "again": return "repeat"
        case "timer": return "timer"
        default: return nil
        }
    }

    private func again() {
        DispatchQueue.main.async {
            guard self.listening else { return }
            do { try self.begin() } catch { self.listening = false; self.end() }
        }
    }

    private func end() {
        renew?.invalidate()
        renew = nil
        task?.cancel()
        task = nil
        request?.endAudio()
        request = nil
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
