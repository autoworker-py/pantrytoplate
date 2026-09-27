import Capacitor
import Foundation
import UIKit
import Vision

/**
 Reads a receipt photo with Apple's text recognition, on the device.

 Returns every piece of text Vision finds with its box (normalised, origin top
 left), and the web layer rebuilds the printed rows from them: a receipt's item
 name and its price usually come back as separate pieces. Language correction
 is off, because receipts are store shorthand and "correcting" WHL MLK only
 makes it worse.

 The photo is the camera plugin's temporary copy. Once read it is deleted, so
 the promise on the Receipt tab holds: the photo is not kept.
 */
@objc(ReceiptTextPlugin)
public class ReceiptTextPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ReceiptTextPlugin"
    public let jsName = "ReceiptText"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
    ]

    @objc func read(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), !path.isEmpty else {
            call.reject("A photo is needed to read.")
            return
        }
        let url = path.hasPrefix("file://") ? URL(string: path) : URL(fileURLWithPath: path)
        guard let url, let image = UIImage(contentsOfFile: url.path), let cgImage = image.cgImage else {
            call.reject("That photo could not be opened.")
            return
        }

        let request = VNRecognizeTextRequest { request, error in
            Self.discard(url)
            if let error {
                call.reject("The receipt could not be read.", nil, error)
                return
            }
            let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
            let pieces: [[String: Any]] = observations.compactMap { observation in
                guard let best = observation.topCandidates(1).first else { return nil }
                let box = observation.boundingBox
                return [
                    "text": best.string,
                    "confidence": best.confidence,
                    "x": box.minX,
                    "y": 1 - box.maxY,
                    "w": box.width,
                    "h": box.height,
                ]
            }
            call.resolve(["pieces": pieces])
        }
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false

        let handler = VNImageRequestHandler(cgImage: cgImage, orientation: Self.orientation(of: image), options: [:])
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try handler.perform([request])
            } catch {
                Self.discard(url)
                call.reject("The receipt could not be read.", nil, error)
            }
        }
    }

    /// Only the app's own temporary copy: never a file somewhere else.
    private static func discard(_ url: URL) {
        let temporary = URL(fileURLWithPath: NSTemporaryDirectory()).standardizedFileURL.path
        guard url.standardizedFileURL.path.hasPrefix(temporary) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    private static func orientation(of image: UIImage) -> CGImagePropertyOrientation {
        switch image.imageOrientation {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        @unknown default: return .up
        }
    }
}
