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
    }
}
