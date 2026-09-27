import type { StorageLocation } from '../../lib/types';
import { formatAmount } from '../../lib/format';
import { FoodThumb } from '../../fridge/Fridge';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/kit';
import './receipt.css';

/*
 * A receipt, read on the phone. Receipts print store shorthand, not product
 * names ("WHL MLK 1GAL"), so what the app remembers is the line as printed and
 * the product it turned out to be. Linked once, a line goes straight in on
 * every receipt after.
 */

export interface ReceiptFood {
  id: string;
  name: string;
  category: string | null;
}

export interface ReceiptLine {
  id: string;
  /** exactly as printed */
  text: string;
  price?: string | null;
  quantity: number;
  unit: string;
  /** linked on an earlier receipt, or bought before under a name the line matches */
  food?: ReceiptFood;
  /** new wording, but something bought before looks like it */
  suggestion?: ReceiptFood;
  where?: StorageLocation;
  /** not food: a fee, or marked so on an earlier receipt */
  skipped?: boolean;
}

const ROOM: Record<StorageLocation, string> = { fridge: 'Fridge', pantry: 'Cupboard', freezer: 'Freezer' };

export const RECEIPT_DISCLAIMER =
  'Automatic matching covers products you’ve added before. Anything new can be linked once and will be recognised on every receipt after that.';

/** For the Receipt tab's picture: a shop, some of it recognised. */
const ILLUSTRATION: ReceiptLine[] = [
  { id: 'i1', text: 'WHL MLK 1GAL', price: '3.48', quantity: 1, unit: 'count', food: { id: '', name: '', category: null } },
  { id: 'i2', text: 'GRK YGRT PLN 32OZ', price: '5.29', quantity: 1, unit: 'count', food: { id: '', name: '', category: null } },
  { id: 'i3', text: 'BNLS SKNLS CHKN BRST', price: '9.87', quantity: 1, unit: 'count', food: { id: '', name: '', category: null } },
  { id: 'i4', text: 'SRIRACHA 17OZ', price: '3.99', quantity: 1, unit: 'count' },
  { id: 'i5', text: 'SHRP CHDR 8OZ', price: '2.98', quantity: 1, unit: 'count', food: { id: '', name: '', category: null } },
  { id: 'i6', text: 'BANANAS 2.31 LB', price: '1.36', quantity: 1, unit: 'count', food: { id: '', name: '', category: null } },
  { id: 'i7', text: 'SPAGHETTI 16OZ', price: '1.28', quantity: 1, unit: 'count', food: { id: '', name: '', category: null } },
];

/** Thermal paper under the kitchen light: the receipt, while it is read. With no lines yet, the reading is still underway. */
export function PaperReceipt({
  lines,
  read = lines.length,
  scanning = false,
  compact = false,
  store = 'CORNER GROCER',
}: {
  lines: ReceiptLine[];
  read?: number;
  scanning?: boolean;
  compact?: boolean;
  store?: string;
}) {
  const waiting = scanning && lines.length === 0;
  return (
    <div className={`paper${compact ? ' compact' : ''}${waiting ? ' waiting' : ''}`} aria-hidden="true">
      <div className="paper-head">
        <b>{waiting ? '' : store}</b>
        <span>{waiting ? '' : new Date().toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: '2-digit' })}</span>
      </div>
      {waiting
        ? Array.from({ length: 11 }, (_, i) => <div key={i} className="paper-line placeholder"><span style={{ width: `${48 + ((i * 37) % 40)}%` }} /><span /></div>)
        : lines.map((l, i) => (
            <div key={l.id} className={`paper-line${i < read ? ' read' : ''}${i < read && l.food ? ' known' : ''}${scanning && i === read - 1 ? ' edge' : ''}`}>
              <span>{l.text}</span>
              <span>{l.price}</span>
            </div>
          ))}
      {waiting ? null : (
        <div className="paper-total">
          <span>TOTAL</span>
          <span>{lines.reduce((sum, l) => sum + (Number(l.price) || 0), 0).toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

/** The Receipt tab of Put food away: what it does, and what it cannot yet. */
export function ReceiptIntro({ error, onPhoto, onLibrary }: { error?: string | null; onPhoto: () => void; onLibrary: () => void }) {
  return (
    <div className="receipt-intro">
      <div className="receipt-stage">
        <PaperReceipt lines={ILLUSTRATION} compact />
      </div>
      <h2 className="title-m" style={{ marginTop: 22 }}>Put a whole shop away at once</h2>
      <p className="muted" style={{ marginTop: 6 }}>
        Photograph the receipt. What you’ve bought before is ready to go in, with the amount and where you keep it. Anything new, you link once.
      </p>
      {error ? <div className="banner error" style={{ marginTop: 16 }}>{error}</div> : null}
      <button type="button" className="btn block" style={{ marginTop: 20 }} onClick={onPhoto}>
        <Icon name="camera" size={19} /> Take a photo
      </button>
      <button type="button" className="btn secondary block" style={{ marginTop: 10 }} onClick={onLibrary}>
        Choose from Photos
      </button>
      <p className="fine" style={{ marginTop: 14, textAlign: 'center' }}>Lay it flat in good light. A long receipt can take two photos.</p>
      <p className="disclaimer">
        <Icon name="info" size={15} />
        <span>{RECEIPT_DISCLAIMER} The photo is read on your phone and is not kept.</span>
      </p>
    </div>
  );
}

/** Reading: a warm line runs down the paper and each line it passes is matched. */
export function ReceiptReading({ lines, read }: { lines: ReceiptLine[]; read: number }) {
  const known = lines.slice(0, read).filter((l) => l.food).length;
  return (
    <div className="receipt-reading" aria-live="polite">
      <div className="receipt-stage tall">
        <PaperReceipt lines={lines} read={read} scanning />
      </div>
      {lines.length ? (
        <>
          <p className="reading-count">
            <b className="num">{read}</b> of {lines.length} lines read
          </p>
          <p className="fine" style={{ textAlign: 'center', marginTop: 4 }}>
            {known ? `${known} you’ve bought before so far` : 'Matching them with what you’ve bought before'}
          </p>
        </>
      ) : (
        <p className="reading-count">Reading the receipt…</p>
      )}
    </div>
  );
}

function Tick({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} className={`r-tick${on ? ' on' : ''}`} onClick={onClick}>
      {on ? <Icon name="check" size={16} stroke={2.4} /> : null}
    </button>
  );
}

/**
 * The review. Bought-before lines come ticked; one tap puts every ticked line
 * away. New wording waits unticked: ticking one links it.
 */
export function ReceiptReview({
  lines,
  ticked,
  busy = false,
  error,
  onToggle,
  onLink,
  onEdit,
  onMore,
  onAdd,
}: {
  lines: ReceiptLine[];
  ticked: Set<string>;
  busy?: boolean;
  error?: string | null;
  onToggle: (id: string) => void;
  /** a new line to link, or a recognised one that was matched wrongly */
  onLink: (id: string) => void;
  onEdit: (id: string) => void;
  /** photograph the rest of a long receipt */
  onMore?: () => void;
  onAdd: () => void;
}) {
  const known = lines.filter((l) => l.food && !l.skipped);
  const fresh = lines.filter((l) => !l.food && !l.skipped);
  const skipped = lines.filter((l) => l.skipped);
  const count = lines.filter((l) => ticked.has(l.id) && l.food && !l.skipped).length;

  return (
    <div className="receipt-review">
      <p className="receipt-summary">
        <span><b className="num">{known.length}</b> bought before</span>
        <span><b className="num">{fresh.length}</b> new</span>
        {skipped.length ? <span><b className="num">{skipped.length}</b> skipped</span> : null}
      </p>
      {error ? <div className="banner error" style={{ marginTop: 14 }}>{error}</div> : null}

      {known.length ? (
        <>
          <div className="section">
            <h2>Bought before</h2>
            <span className="aside">Ready to go in</span>
          </div>
          <div className="list receipt-list">
            {known.map((l) => (
              <div className={`list-row r-row${ticked.has(l.id) ? '' : ' off'}`} key={l.id}>
                <Tick on={ticked.has(l.id)} label={`Add ${l.food?.name}`} onClick={() => onToggle(l.id)} />
                <button type="button" className="r-what" onClick={() => onLink(l.id)} aria-label={`${l.food?.name}, from ${l.text}. Change what this is`}>
                  <span className="thumb">
                    <FoodThumb name={l.food?.name ?? ''} category={l.food?.category ?? null} quantity={l.unit === 'count' ? Math.min(l.quantity, 6) : 1} unit={l.unit === 'count' ? 'count' : 'pack'} size={34} />
                  </span>
                  <span className="grow">
                    <span className="t">{l.food?.name}</span>
                    <span className="r-text">{l.text}</span>
                  </span>
                </button>
                <button type="button" className="r-amount" onClick={() => onEdit(l.id)} aria-label={`Change amount or place for ${l.food?.name}`}>
                  <span className="num">{formatAmount(l.quantity, l.unit)}</span>
                  <span>{ROOM[l.where ?? 'pantry']}</span>
                </button>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {fresh.length ? (
        <>
          <div className="section">
            <h2>New to the app</h2>
            <span className="aside">Tick to link</span>
          </div>
          <div className="list receipt-list">
            {fresh.map((l) => (
              <div className="list-row r-row new" key={l.id}>
                <Tick on={false} label={`Link ${l.text}`} onClick={() => onLink(l.id)} />
                <span className="grow">
                  <span className="r-text big">{l.text}</span>
                  {l.suggestion ? (
                    <span className="s">Looks like your <b>{l.suggestion.name.toLowerCase()}</b></span>
                  ) : (
                    <span className="s">Scan its barcode or search for it</span>
                  )}
                </span>
                <button type="button" className="link-btn" onClick={() => onLink(l.id)}>Link</button>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {skipped.length ? (
        <div className="r-skipped">
          <Icon name="close" size={16} />
          <span className="grow">
            Skipped as not food: <span className="r-text">{skipped.map((l) => l.text).join(' · ')}</span>
          </span>
        </div>
      ) : null}

      {onMore ? (
        <button type="button" className="btn outline block" style={{ marginTop: 18 }} onClick={onMore} disabled={busy}>
          <Icon name="camera" size={18} /> Photograph the rest of it
        </button>
      ) : null}

      <p className="disclaimer" style={{ marginTop: 18 }}>
        <Icon name="info" size={15} />
        <span>{RECEIPT_DISCLAIMER}</span>
      </p>

      <div className="cook-bar">
        <button type="button" className="btn" onClick={onAdd} disabled={!count || busy}>
          {busy ? 'Putting it away…' : count ? `Add ${count} to pantry` : 'Nothing ticked'}
        </button>
      </div>
    </div>
  );
}

/** One line: link it once, by suggestion, barcode or search, or skip it for good. */
export function LinkSheet({
  line,
  onUse,
  onScan,
  onSearch,
  onSkip,
  onClose,
}: {
  line: ReceiptLine;
  onUse: () => void;
  onScan: () => void;
  onSearch: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const offer = line.suggestion ?? null;
  return (
    <Sheet title={line.food ? 'Not the right thing?' : 'What is this?'} sub="Link it once and it goes straight in next time." onClose={onClose}>
      <div className="r-ticket">
        <span className="r-text big">{line.text}</span>
        <span className="fine">{formatAmount(line.quantity, line.unit)} on this receipt{line.price ? ` · ${line.price}` : ''}</span>
      </div>

      {offer ? (
        <div className="r-suggest">
          <span className="thumb">
            <FoodThumb name={offer.name} category={offer.category} quantity={line.unit === 'count' ? Math.min(line.quantity, 6) : 1} unit={line.unit === 'count' ? 'count' : 'pack'} size={38} />
          </span>
          <span className="grow">
            <span className="t">{offer.name}</span>
            <span className="s">In your pantry before</span>
          </span>
          <button type="button" className="btn small" onClick={onUse}>It’s this</button>
        </div>
      ) : null}

      <div className="list" style={{ marginTop: 16 }}>
        <button type="button" className="list-row" onClick={onScan}>
          <span className="thumb"><Icon name="scan" size={21} /></span>
          <span className="grow">
            <span className="t">Scan its barcode</span>
            <span className="s">Quickest, and exact</span>
          </span>
          <Icon name="chevron" size={16} />
        </button>
        <button type="button" className="list-row" onClick={onSearch}>
          <span className="thumb"><Icon name="search" size={21} /></span>
          <span className="grow">
            <span className="t">Search for it</span>
            <span className="s">For loose produce and the deli counter</span>
          </span>
          <Icon name="chevron" size={16} />
        </button>
        <button type="button" className="list-row" onClick={onSkip}>
          <span className="thumb"><Icon name="close" size={20} /></span>
          <span className="grow">
            <span className="t">It’s not food</span>
            <span className="s">Skip it on every receipt from now on</span>
          </span>
        </button>
      </div>
    </Sheet>
  );
}
