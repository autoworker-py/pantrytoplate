import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { adsOnThisDevice, hideBanner, showBanner, useBannerCovered } from '../lib/ads';

/** Lists you browse, not places you are in the middle of something: the only screens with a banner. */
const BANNER_SCREENS = new Set(['/recipes', '/eaten']);

/**
 * The one banner, for accounts without Pro: up on Recipes and Eaten, gone
 * everywhere else and whenever a sheet is open. An account whose Pro status is
 * not known yet gets none, so Pro never sees one flash by.
 */
export function AdBanner({ plus }: { plus: boolean | undefined }) {
  const { pathname } = useLocation();
  const covered = useBannerCovered();
  const wanted = plus === false && adsOnThisDevice() && BANNER_SCREENS.has(pathname) && !covered;

  useEffect(() => {
    void (wanted ? showBanner() : hideBanner());
  }, [wanted]);
  useEffect(() => () => void hideBanner(), []);

  // the plain band the banner sits in, a gap clear of the tab bar below and the page above;
  // it has no height until a banner has a size
  return <div className="ad-band" aria-hidden="true" />;
}
