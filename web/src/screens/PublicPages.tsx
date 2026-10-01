import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { render } from '../components/PrivacyNotice';
import { Logo } from '../ui/kit';

/*
 * The two pages anyone can read without an account, at /privacy and /support:
 * the App Store listing links to both, and so can anyone else.
 */

interface Options {
  emailCodes: boolean;
  support: string | null;
}

function useOptions(): Options | null {
  const [options, setOptions] = useState<Options | null>(null);
  useEffect(() => {
    let live = true;
    api
      .get<Options>('/api/auth/options')
      .then((data) => live && setOptions(data))
      .catch(() => live && setOptions({ emailCodes: false, support: null }));
    return () => { live = false; };
  }, []);
  return options;
}

function PublicFrame({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Pantry2Plate`;
  }, [title]);
  return (
    <div className="app">
      <div className="public-page">
        <a href="/" className="public-mark" aria-label="Pantry2Plate"><Logo size={48} /></a>
        {children}
      </div>
    </div>
  );
}

export function PrivacyPage() {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api
      .get<{ markdown: string }>('/api/auth/privacy')
      .then((data) => setMarkdown(data.markdown))
      .catch(() => setFailed(true));
  }, []);
  return (
    <PublicFrame title="Privacy notice">
      {failed ? <div className="banner error">The notice could not be loaded. Try again in a moment.</div> : markdown ? <div className="policy">{render(markdown)}</div> : <p className="muted">Loading…</p>}
    </PublicFrame>
  );
}

export function SupportPage() {
  const options = useOptions();
  const contact = options?.support ? (
    <>email <a href={`mailto:${options.support}`}>{options.support}</a></>
  ) : (
    'use the contact details on the Pantry2Plate App Store page'
  );
  return (
    <PublicFrame title="Support">
      <h1 className="title-xl">Pantry2Plate support</h1>
      <p className="muted" style={{ marginTop: 10 }}>A question, a problem, or a number that looks wrong: {contact}.</p>

      <div className="public-faq">
        {options?.emailCodes ? (
          <section>
            <h2>I forgot my password</h2>
            <p>On the sign-in screen, tap <strong>Forgot password?</strong> We will email you a code, and the code lets you set a new password.</p>
          </section>
        ) : null}
        <section>
          <h2>How do I delete my account?</h2>
          <p>In the app, open <strong>Settings</strong> and tap <strong>Delete my account</strong>. Everything goes, straight away and for good.</p>
        </section>
        <section>
          <h2>Can I get a copy of my data?</h2>
          <p>Yes: <strong>Settings → Export everything</strong> gives you your pantry, diary and recipes as one file.</p>
        </section>
        <section>
          <h2>How accurate are the calories from a meal photo?</h2>
          <p>They are an AI&rsquo;s estimate from the picture: usually close, sometimes off. Every food it finds is listed, so you can correct anything before you log it. Nothing in the app is medical advice.</p>
        </section>
        <section>
          <h2>Where does the food data come from?</h2>
          <p>Packaged products come from Open Food Facts, under the Open Database License, and nutrition for everyday foods from USDA FoodData Central.</p>
        </section>
      </div>

      <p className="fine" style={{ marginTop: 28 }}><a href="/privacy">Privacy notice</a></p>
    </PublicFrame>
  );
}
