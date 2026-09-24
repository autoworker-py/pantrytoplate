import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

const HINTS = new Map();
HINTS.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128,
]);

/**
 * Is live camera scanning even possible here?
 *
 * Browsers only expose `navigator.mediaDevices` in a secure context — https or
 * localhost. Opening the app over a plain http LAN address (a phone on the same
 * Wi-Fi) means the API is absent entirely, which is not a permissions problem
 * and cannot be granted away in settings. On iOS every browser uses WebKit, so
 * Chrome and Brave behave exactly like Safari.
 */
function liveScanSupport(): 'ok' | 'insecure' | 'unsupported' {
  // The DOM types declare navigator.mediaDevices as always present. It is not:
  // on an insecure origin the property is genuinely absent, which is the whole
  // situation this function exists to detect.
  const mediaDevices = (navigator as Navigator & { mediaDevices?: MediaDevices }).mediaDevices;
  if (typeof mediaDevices?.getUserMedia === 'function') return 'ok';
  if (typeof window !== 'undefined' && !window.isSecureContext) return 'insecure';
  return 'unsupported';
}

/**
 * Camera barcode scanning through the browser — no native app required.
 *
 * Three ways in, in descending order of convenience:
 *   1. live video scanning, where the browser allows it
 *   2. photographing the barcode, which works on plain http because a file
 *      input is not subject to the secure-context rule
 *   3. typing the number underneath it, which always works
 */
export function BarcodeScanner({
  onDetected,
  /** barcodes already handled this session; they will not fire again */
  seen,
}: {
  onDetected: (barcode: string) => void;
  seen?: string[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [support] = useState(liveScanSupport);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [reading, setReading] = useState(false);
  const [manual, setManual] = useState('');

  // A camera reads the same barcode many times a second. Without this the app
  // would add a dozen copies of one jar while you are still lining up the shot.
  const handled = useRef(new Set<string>(seen ?? []));
  const lastFired = useRef(0);

  useEffect(() => {
    handled.current = new Set(seen ?? []);
  }, [seen]);

  useEffect(() => {
    if (support !== 'ok') return;

    let stopped = false;
    let controls: { stop: () => void } | undefined;

    async function start() {
      try {
        const reader = new BrowserMultiFormatReader(HINTS);
        setScanning(true);
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
          if (!result || stopped) return;

          const code = result.getText();
          // same product still in frame, or a second read of one we just took
          if (handled.current.has(code)) return;
          // and a short cool-off, so two products cannot both fire mid-blink
          if (Date.now() - lastFired.current < 1200) return;

          handled.current.add(code);
          lastFired.current = Date.now();
          onDetected(code);
        });
      } catch (cause) {
        setScanning(false);
        setError(
          cause instanceof Error && cause.name === 'NotAllowedError'
            ? 'Camera access was denied. Allow it in your browser settings, photograph the barcode, or type the number.'
            : 'Could not start the camera. Photograph the barcode instead, or type the number.',
        );
      }
    }

    void start();
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [support, onDetected]);

  /** Let the caller re-scan something deliberately. */
  function forget(code: string) {
    handled.current.delete(code);
  }
  void forget;

  /** Decode a still photo. Works anywhere — no secure context needed. */
  async function readPhoto(file: File) {
    setReading(true);
    setError(null);
    const url = URL.createObjectURL(file);
    try {
      const reader = new BrowserMultiFormatReader(HINTS);
      const result = await reader.decodeFromImageUrl(url);
      const code = result.getText();
      handled.current.add(code);
      onDetected(code);
    } catch {
      setError('Could not read a barcode in that photo. Fill the frame with the barcode and try again, or type the number.');
    } finally {
      URL.revokeObjectURL(url);
      setReading(false);
    }
  }

  return (
    <div>
      {support === 'insecure' ? (
        <div className="banner info">
          <strong>Live scanning needs a secure connection.</strong> You are on a plain <code>http://</code> address,
          and browsers only allow camera access over <code>https://</code>. Photograph the barcode instead — that
          works fine here.
        </div>
      ) : null}

      {error ? <div className="banner error">{error}</div> : null}

      {support === 'ok' ? (
        <>
          <video ref={videoRef} className="scanner-video" muted playsInline />
          <p className="muted" style={{ marginTop: 8 }}>
            {scanning ? 'Point the camera at the barcode…' : 'Starting camera…'}
            {handled.current.size > 0 ? ` · ${handled.current.size} scanned` : ''}
          </p>
        </>
      ) : null}

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="barcode-photo">
          {support === 'ok' ? 'Or photograph the barcode' : 'Photograph the barcode'}
        </label>
        <input
          id="barcode-photo"
          type="file"
          accept="image/*"
          capture="environment"
          disabled={reading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readPhoto(file);
            event.target.value = '';
          }}
        />
        {reading ? <p className="muted">Reading the photo…</p> : null}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const cleaned = manual.replace(/\D/g, '');
          if (cleaned.length >= 6) onDetected(cleaned);
        }}
      >
        <label htmlFor="manual-barcode">Or type the number under the barcode</label>
        <div className="row" style={{ gap: 8 }}>
          <input
            id="manual-barcode"
            inputMode="numeric"
            placeholder="0000000000017"
            value={manual}
            onChange={(event) => setManual(event.target.value)}
          />
          <button type="submit" disabled={manual.replace(/\D/g, '').length < 6}>
            Look up
          </button>
        </div>
      </form>
    </div>
  );
}
