import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell configuration.
 *
 * The app runs as its own bundle rather than pointing a web view at a URL:
 * `webDir` is the built frontend, shipped inside the binary. Only API calls go
 * to the server, so the interface itself opens instantly and does not depend on
 * the backend being awake — which matters when the backend sleeps.
 *
 * The API base is baked in at build time via VITE_API_URL; see ios/README.md.
 */
const config: CapacitorConfig = {
  appId: 'com.connordavidson.pantrytoplate',
  appName: 'Pantry to Plate',
  webDir: 'dist',

  ios: {
    // The Night room colour, so there is no flash between the splash screen and
    // the first paint. It is a native colour set once at launch, which is also
    // why the page itself must not scroll: a bounce would show it.
    backgroundColor: '#0c0d0f',
    contentInset: 'never',
    /*
     * The shell is a fixed column with its own scrolling region, so the web
     * view has nothing to scroll. Leaving this on gives the document a second
     * scroller that only ever rubber-bands.
     */
    scrollEnabled: false,
  },

  plugins: {
    /*
     * Route fetch through native networking rather than the web view's.
     *
     * A Capacitor web view is its own origin (capacitor://localhost), so every
     * request from the app is cross-origin and subject to CORS — which means a
     * server-side header controls whether the app works at all. That is a
     * fragile place for the app's fate to live: a stale deployment silently
     * breaks sign-in and surfaces as "something went wrong", indistinguishable
     * from the server being down.
     *
     * Native requests are not browser requests, so CORS does not apply. The app
     * then works against any deployment of its backend, current or not.
     */
    CapacitorHttp: { enabled: true },
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#0c0d0f',
      showSpinner: false,
      launchAutoHide: true,
    },
    StatusBar: {
      style: 'DARK', // light glyphs, for a dark ground
      backgroundColor: '#0c0d0f',
    },
  },
};

export default config;
