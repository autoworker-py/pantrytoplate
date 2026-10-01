import { useSyncExternalStore } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

/*
 * Ads, for accounts without Pro and only in the iPhone app: a slim banner just
 * above the tab bar on Recipes and Eaten, and a short ad someone can choose to
 * watch for one more meal photo. Nothing else, and nowhere else.
 *
 * Before the first ad: Google's consent form where the law asks for one (UK,
 * EEA, Switzerland), then Apple's tracking question, once. Until the app is on
 * the App Store and approved in AdMob these are Google's test ads; the real
 * unit IDs come in at build time as VITE_ADMOB_BANNER_ID and
 * VITE_ADMOB_REWARDED_ID. Clicking real ads while testing is how AdMob
 * accounts get closed, so test builds never carry them.
 */
const BANNER_ID: string = import.meta.env.VITE_ADMOB_BANNER_ID || 'ca-app-pub-3940256099942544/2435281174';
const REWARDED_ID: string = import.meta.env.VITE_ADMOB_REWARDED_ID || 'ca-app-pub-3940256099942544/1712485313';
const TESTING = !import.meta.env.VITE_ADMOB_BANNER_ID;

export const adsOnThisDevice = () => Capacitor.isNativePlatform();

const admob = () => import('@capacitor-community/admob');

/** false when Google's consent service could not answer: ads still show, but not personalised ones */
let personalised = true;
const within = <T,>(ms: number, work: Promise<T>) =>
  Promise.race([work, new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('timed out')), ms))]);

let ready: Promise<boolean> | null = null;
/** Consent, then the tracking question, then the SDK, once. False when no ad may be asked for. */
function prepare(): Promise<boolean> {
  ready ??= (async () => {
    const { AdMob, AdmobConsentStatus, BannerAdPluginEvents } = await admob();
    try {
      let consent = await within(8000, AdMob.requestConsentInfo());
      if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) consent = await AdMob.showConsentForm();
      if (!consent.canRequestAds) return false;
    } catch (cause) {
      // unreachable, or no consent message set up for this app yet (Google's sample app has none)
      console.warn('Ad consent could not be checked; showing non-personalised ads.', cause);
      personalised = false;
    }
    if ((await AdMob.trackingAuthorizationStatus()).status === 'notDetermined') await AdMob.requestTrackingAuthorization();
    await AdMob.initialize({ initializeForTesting: TESTING });
    // pages leave room for the banner and its clear band while it shows, and none while it is hidden
    void AdMob.addListener(BannerAdPluginEvents.SizeChanged, ({ height }) => {
      document.documentElement.style.setProperty('--ad-h', height > 0 ? `${Math.round(height) + 2 * AD_GAP}px` : '0px');
    });
    // a banner that finishes loading after its screen was left must not appear on the next one
    void AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
      if (!wanted) void AdMob.hideBanner();
    });
    return true;
  })().catch(() => {
    ready = null; // offline or refused: ask again next time rather than never
    return false;
  });
  return ready;
}

/* ---------- the banner ---------- */

let banner: 'none' | 'up' | 'hidden' = 'none';
let wanted = false;
/** One step at a time, in order: a quick hop between tabs must not leave a banner on the wrong screen. */
let queue: Promise<unknown> = Promise.resolve();
const inTurn = (step: () => Promise<unknown>) => (queue = queue.then(step).catch(() => undefined));

/**
 * Clear space between the banner and what can be tapped on either side of it:
 * Google counts a banner pressed up against a tab bar as one built for
 * accidental clicks, and can stop serving ads to the app for it. The band it
 * sits in (AdBanner) catches a tap that falls just short.
 */
export const AD_GAP = 10;

/** How far the tab bar reaches above the phone's safe area: the banner sits a clear gap above it. */
function tabBarLift(): number {
  const tabs = document.querySelector('.tabs');
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;bottom:0;height:0;padding-bottom:env(safe-area-inset-bottom);visibility:hidden';
  document.body.append(probe);
  const safe = probe.getBoundingClientRect().height;
  probe.remove();
  return tabs ? Math.max(0, Math.round(tabs.getBoundingClientRect().height - safe)) : 0;
}

export function showBanner() {
  wanted = true;
  return inTurn(async () => {
    // asked again after the consent and tracking questions: the screen may have changed while they were up
    if (!wanted || !(await prepare()) || !wanted) return;
    const { AdMob, BannerAdPosition, BannerAdSize } = await admob();
    if (banner === 'hidden') {
      try {
        await AdMob.resumeBanner();
        banner = 'up';
        return;
      } catch {
        banner = 'none'; // it never loaded: ask for a new one
      }
    }
    if (banner === 'none') {
      await AdMob.showBanner({ adId: BANNER_ID, adSize: BannerAdSize.ADAPTIVE_BANNER, position: BannerAdPosition.BOTTOM_CENTER, margin: tabBarLift() + AD_GAP, isTesting: TESTING, npa: !personalised });
      banner = 'up';
    }
  });
}

export function hideBanner() {
  wanted = false;
  return inTurn(async () => {
    if (wanted || banner !== 'up') return;
    const { AdMob } = await admob();
    await AdMob.hideBanner();
    banner = 'hidden';
  });
}

/* ---------- sheets cover the banner ---------- */

// The banner floats above the page, so a sheet rising from the bottom would slide
// under it. While any sheet is open, the banner steps aside.
let covered = 0;
const watchers = new Set<() => void>();
const tell = () => watchers.forEach((watcher) => watcher());

/** Called by a sheet as it opens; the returned function, as it closes. */
export function coverBanner(): () => void {
  covered++;
  tell();
  return () => {
    covered--;
    tell();
  };
}

export function useBannerCovered(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      watchers.add(onChange);
      return () => watchers.delete(onChange);
    },
    () => covered > 0,
  );
}

/* ---------- the ad someone chooses to watch ---------- */

/** One short ad, chosen by the person. True only if they watched it through to the reward. */
export async function watchAd(): Promise<boolean> {
  if (!(await prepare())) return false;
  const { AdMob, RewardAdPluginEvents } = await admob();
  try {
    await AdMob.prepareRewardVideoAd({ adId: REWARDED_ID, isTesting: TESTING, npa: !personalised });
  } catch {
    return false; // no ad to show just now
  }
  // the plugin answers the show call only when the reward is earned; closing early is just an event
  return new Promise<boolean>((resolve) => {
    let earned = false;
    const listening: Array<Promise<PluginListenerHandle>> = [];
    const finish = (watched: boolean) => {
      for (const handle of listening) void handle.then((h) => h.remove());
      resolve(watched);
    };
    listening.push(AdMob.addListener(RewardAdPluginEvents.Rewarded, () => { earned = true; }));
    listening.push(AdMob.addListener(RewardAdPluginEvents.Dismissed, () => window.setTimeout(() => finish(earned), 300)));
    listening.push(AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => finish(false)));
    AdMob.showRewardVideoAd().then(() => { earned = true; }, () => finish(false));
  });
}
