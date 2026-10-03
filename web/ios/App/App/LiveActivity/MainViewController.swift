import Capacitor
import UIKit

/**
 The app's bridge view controller.

 Exists for one reason: to register the app's own plugins, the Live Activity
 and receipt reading.

 Capacitor discovers plugins that ship as Swift packages from a generated list,
 but a plugin written directly in the app target is in no such list, so nothing
 registers it and every call from JavaScript fails as "not implemented". That
 failure was invisible - the web layer caught it, fell back to the notification,
 and reported success - so the Lock Screen timer silently never appeared.

 Registering the instance here is the supported way to add an app-local plugin.
 The storyboard points at this class instead of CAPBridgeViewController.
 */
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LiveActivityPlugin())
        bridge?.registerPluginInstance(ReceiptTextPlugin())
        bridge?.registerPluginInstance(SwipeBackPlugin())
        bridge?.registerPluginInstance(HealthPlugin())
        bridge?.registerPluginInstance(VoicePlugin())
        bridge?.registerPluginInstance(ShareBridgePlugin())
    }
}

/**
 The iPhone's back gesture: swipe in from the left edge to go back a screen,
 with the screen you're going back to showing underneath.

 The web view has it built in, and keeps a picture of each screen to show
 under the swipe, but only while the gesture is switched on. Switching it off
 on the four tabs meant the tab you came from had no picture, so the swipe
 back from a recipe or Settings showed white. So the gesture stays on, and
 what the app turns off on the tabs, where an iPhone app has nothing to go
 back to, is the edge swipe itself. There is no swipe forward.
 */
@objc(SwipeBackPlugin)
public class SwipeBackPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SwipeBackPlugin"
    public let jsName = "SwipeBack"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setEnabled", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        DispatchQueue.main.async {
            self.bridge?.webView?.allowsBackForwardNavigationGestures = true
            self.allowSwipe(back: false)
        }
    }

    @objc func setEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async {
            self.bridge?.webView?.allowsBackForwardNavigationGestures = true
            self.allowSwipe(back: enabled)
            call.resolve()
        }
    }

    /// The swipes are the web view's edge pans: the left one goes back, the right one forward.
    private func allowSwipe(back: Bool) {
        for case let edge as UIScreenEdgePanGestureRecognizer in bridge?.webView?.gestureRecognizers ?? [] {
            edge.isEnabled = edge.edges.contains(.left) ? back : false
        }
    }
}
