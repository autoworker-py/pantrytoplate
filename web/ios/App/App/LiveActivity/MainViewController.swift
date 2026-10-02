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
    }
}

/**
 The iPhone's back gesture: swipe in from the left edge to go back a screen.

 The web view has it built in but off. The app turns it on for screens that
 were opened from somewhere (a recipe, Settings, adding food) and off on the
 four tabs, where an iPhone app has nothing to go back to.
 */
@objc(SwipeBackPlugin)
public class SwipeBackPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SwipeBackPlugin"
    public let jsName = "SwipeBack"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setEnabled", returnType: CAPPluginReturnPromise)
    ]

    @objc func setEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async {
            self.bridge?.webView?.allowsBackForwardNavigationGestures = enabled
            call.resolve()
        }
    }
}
