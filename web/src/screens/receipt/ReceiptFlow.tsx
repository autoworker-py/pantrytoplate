import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Food, InventoryItem, StorageLocation } from '../../lib/types';
import { joinPhotos, matchLine, parseReceipt, toRows, type ParsedLine, type TextPiece } from '../../lib/receipt';
import { loadMemory, saveMemory, type ReceiptMemory, type RememberedFood } from '../../lib/receiptMemory';
import { canReadReceipts, photographReceipt, readReceiptPhoto } from '../../lib/receiptText';
import { UnitSelect } from '../../components/UnitSelect';
import { Icon } from '../../ui/Icon';
import { Page, Sheet, errorText, useToast } from '../../ui/kit';
import { LinkSheet, ReceiptIntro, ReceiptReading, ReceiptReview, type ReceiptFood, type ReceiptLine } from './ReceiptViews';

/*
 * Put a whole shop away from its receipt. The photo is read on the phone;
 * each line is matched first against wording linked on earlier receipts, then
 * against everything bought before. Sure matches come ticked, near ones are
 * offered, the rest wait to be linked once. Nothing goes in until "Add".
 */

type Line = ReceiptLine & { parsed: ParsedLine };
type Stage = 'intro' | 'reading' | 'review';

const ROOMS: Array<{ key: StorageLocation; label: string }> = [
  { key: 'fridge', label: 'Fridge' },
  { key: 'pantry', label: 'Cupboard' },
  { key: 'freezer', label: 'Freezer' },
];

const round = (n: number) => Math.round(n * 100) / 100;
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const asFood = (f: { id: string; name: string; category: string | null }): ReceiptFood => ({ id: f.id, name: f.name, category: f.category });

/** How much went in: what was weighed, else the last amount for one of these times how many, else the pack size. */
function amountFor(p: ParsedLine, before: { quantity?: number; unit?: string } | null): { quantity: number; unit: string } {
  if (p.measure?.byWeight) return { quantity: p.measure.quantity, unit: p.measure.unit };
  if (before?.quantity && before.unit) return { quantity: round(before.quantity * p.count), unit: before.unit };
  if (p.measure) return { quantity: round(p.measure.quantity * p.count), unit: p.measure.unit };
  return { quantity: p.count, unit: 'count' };
}

export function ReceiptFlow({
  tabs,
  back,
  homeFor,
  finder,
  newFood,
}: {
  /** the Type it · Scan it · Receipt switch, shown before a receipt is read */
  tabs: ReactNode;
  back: ReactNode;
  homeFor: (category: string | null) => StorageLocation;
  /** the barcode scanner or the food search: what it finds, or a food the app does not know yet */
  finder: (how: 'scan' | 'search', found: (food: Food) => void, unknown: (name: string, barcode?: string) => void) => ReactNode;
  newFood: (name: string, barcode: string | undefined, created: (food: Food) => void, close: () => void) => ReactNode;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [stage, setStage] = useState<Stage>('intro');
  const [lines, setLines] = useState<Line[]>([]);
  const [read, setRead] = useState(0);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [finding, setFinding] = useState<{ id: string; how: 'scan' | 'search' } | null>(null);
  const [creating, setCreating] = useState<{ id: string; name: string; barcode?: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const memory = useRef<ReceiptMemory | null>(null);
  const bought = useRef<RememberedFood[]>([]);
  const userId = user?.id ?? 'signed-out';

  /** What counts as bought before: this phone's memory, and everything in the pantry now. */
  async function recall() {
    if (!memory.current) memory.current = await loadMemory(userId);
    const known = new Map<string, RememberedFood>();
    try {
      const { items } = await api.getFresh<{ items: InventoryItem[] }>('/api/inventory');
      for (const item of items) known.set(item.food.id, { id: item.food.id, name: item.food.name, category: item.food.category, where: item.storageLocation });
    } catch {
      // offline: match from memory alone
    }
    for (const food of Object.values(memory.current.foods)) known.set(food.id, { ...known.get(food.id), ...food });
    bought.current = [...known.values()];
  }

  function recognise(p: ParsedLine, id: string): Line {
    const line: Line = { id, text: p.text, price: p.price, quantity: p.count, unit: 'count', parsed: p };
    const learned = memory.current?.lines[p.key];
    if (learned && 'skip' in learned) return { ...line, skipped: true };
    if (learned) return { ...line, ...amountFor(p, learned), food: asFood(learned.food), where: learned.where };
    if (p.fee) return { ...line, skipped: true };
    const match = matchLine(p.text, bought.current);
    if (match?.sure) return { ...line, ...amountFor(p, match.food), food: asFood(match.food), where: match.food.where ?? homeFor(match.food.category) };
    return { ...line, ...amountFor(p, null), suggestion: match ? asFood(match.food) : undefined };
  }

  async function scan(from: 'camera' | 'photos', more = false) {
    setError(null);
    let path: string | null = 'sample';
    if (canReadReceipts) {
      try {
        path = await photographReceipt(from);
      } catch (cause) {
        setError(errorText(cause, 'Could not open the camera. Check that Pantry to Plate is allowed to use it in Settings.'));
        return;
      }
    }
    if (!path) return;

    const before = more ? lines : [];
    setStage('reading');
    setRead(before.length);
    if (!more) setLines([]);
    try {
      const pieces = canReadReceipts ? await readReceiptPhoto(path) : SAMPLE_PIECES;
      const found = parseReceipt(toRows(pieces));
      if (!found.length) throw new Error('No item lines found.');
      await recall();
      const all = more ? joinPhotos(before.map((l) => l.parsed), found) : found;
      const next = all.map((p, i) => (before[i]?.parsed === p ? before[i] : recognise(p, `l${i}`)));
      setLines(next);
      setTicked((t) => {
        const keep = new Set(more ? t : []);
        for (const l of next.slice(before.length)) if (l.food && !l.skipped) keep.add(l.id);
        return keep;
      });
      // the sweep is the matching made visible: quick, and gone for anyone who asks for less motion
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const step = Math.max(26, Math.min(70, 1100 / Math.max(1, next.length - before.length)));
        for (let i = before.length + 1; i <= next.length; i++) {
          setRead(i);
          await wait(step);
        }
        await wait(380);
      }
      setRead(next.length);
      setStage('review');
    } catch (cause) {
      setStage(more ? 'review' : 'intro');
      setError(
        cause instanceof Error && cause.message === 'No item lines found.'
          ? 'No items found on that photo. Try again with the receipt flat, in good light, and the whole width in frame.'
          : errorText(cause, 'Could not read that receipt. Try another photo.'),
      );
    }
  }

  function toggle(id: string) {
    setTicked((t) => {
      const next = new Set(t);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function link(id: string, food: { id: string; name: string; category: string | null }) {
    const before = memory.current?.foods[food.id] ?? null;
    setLines((all) =>
      all.map((l) =>
        l.id !== id ? l : { ...l, ...amountFor(l.parsed, before), food: asFood(food), suggestion: undefined, skipped: false, where: before?.where ?? homeFor(food.category) },
      ),
    );
    setTicked((t) => new Set(t).add(id));
    setLinking(null);
    setFinding(null);
    setCreating(null);
  }

  async function skip(id: string) {
    const line = lines.find((l) => l.id === id);
    if (!line) return;
    setLines((all) => all.map((l) => (l.id === id ? { ...l, skipped: true, food: undefined, suggestion: undefined } : l)));
    setTicked((t) => {
      const next = new Set(t);
      next.delete(id);
      return next;
    });
    setLinking(null);
    if (!memory.current) memory.current = await loadMemory(userId);
    memory.current.lines[line.parsed.key] = { skip: true };
    await saveMemory(userId, memory.current);
  }

  async function add() {
    const chosen = lines.filter((l) => ticked.has(l.id) && l.food && !l.skipped);
    if (!chosen.length) return;
    setBusy(true);
    setError(null);
    const results = await Promise.allSettled(
      chosen.map((l) =>
        api.post<{ item: InventoryItem }>('/api/inventory', {
          foodReferenceId: l.food!.id,
          quantity: l.quantity,
          unit: l.unit,
          storageLocation: l.where ?? homeFor(l.food!.category),
        }),
      ),
    );
    const went = chosen.flatMap((line, i) => {
      const r = results[i];
      return r.status === 'fulfilled' ? [{ line, itemId: r.value.item.id }] : [];
    });

    // what went in is what is remembered: the wording, the food, and how it was put away
    const learned = memory.current ?? (await loadMemory(userId));
    for (const { line } of went) {
      const each = line.parsed.measure?.byWeight ? line.quantity : round(line.quantity / Math.max(1, line.parsed.count));
      const where = line.where ?? homeFor(line.food!.category);
      const food: RememberedFood = { ...line.food!, quantity: each, unit: line.unit, where };
      learned.lines[line.parsed.key] = { food, quantity: each, unit: line.unit, where };
      learned.foods[food.id] = food;
    }
    memory.current = learned;
    await saveMemory(userId, learned);
    setBusy(false);

    if (!went.length) {
      setError(errorText((results[0] as PromiseRejectedResult).reason, 'Nothing could be added just now. Check your connection and try again.'));
      return;
    }
    const failed = chosen.length - went.length;
    const ids = went.map((w) => w.itemId);
    toast(`Put ${went.length} ${went.length === 1 ? 'thing' : 'things'} away.${failed ? ` ${failed} did not go in and ${failed === 1 ? 'is' : 'are'} still ticked.` : ''}`, {
      label: 'Undo',
      run: () => {
        void Promise.allSettled(ids.map((id) => api.delete(`/api/inventory/${id}`))).then(() => toast('Undone. Those are out of your pantry again.'));
      },
    });
    if (failed) {
      const done = new Set(went.map((w) => w.line.id));
      setLines((all) => all.filter((l) => !done.has(l.id)));
    } else {
      navigate('/pantry');
    }
  }

  function startOver() {
    setStage('intro');
    setLines([]);
    setTicked(new Set());
    setError(null);
  }

  const line = (id: string | null) => (id ? lines.find((l) => l.id === id) ?? null : null);
  const linkingLine = line(linking);
  const editingLine = line(editing);
  const close = (
    <button type="button" className="icon-btn" aria-label="Start again" onClick={startOver} disabled={busy}>
      <Icon name="close" size={20} />
    </button>
  );

  if (stage === 'intro') {
    return (
      <Page left={back} title="Put food away">
        {tabs}
        <ReceiptIntro error={error} onPhoto={() => void scan('camera')} onLibrary={() => void scan('photos')} />
      </Page>
    );
  }

  return (
    <Page left={close} title={stage === 'reading' ? 'Reading receipt' : 'Receipt'}>
      {stage === 'reading' ? (
        <ReceiptReading lines={lines} read={read} />
      ) : (
        <ReceiptReview
          lines={lines}
          ticked={ticked}
          busy={busy}
          error={error}
          onToggle={toggle}
          onLink={setLinking}
          onEdit={setEditing}
          onMore={() => void scan('camera', true)}
          onAdd={() => void add()}
        />
      )}

      {linkingLine ? (
        <LinkSheet
          line={linkingLine}
          onUse={() => linkingLine.suggestion && link(linkingLine.id, linkingLine.suggestion)}
          onScan={() => { setFinding({ id: linkingLine.id, how: 'scan' }); setLinking(null); }}
          onSearch={() => { setFinding({ id: linkingLine.id, how: 'search' }); setLinking(null); }}
          onSkip={() => void skip(linkingLine.id)}
          onClose={() => setLinking(null)}
        />
      ) : null}

      {finding ? (
        <Sheet title={finding.how === 'scan' ? 'Scan its barcode' : 'Find it'} sub={line(finding.id)?.text} onClose={() => setFinding(null)}>
          <div style={{ marginTop: 10 }}>
            {finder(
              finding.how,
              (food) => link(finding.id, food),
              (name, barcode) => { setCreating({ id: finding.id, name, barcode }); setFinding(null); },
            )}
          </div>
        </Sheet>
      ) : null}

      {creating ? newFood(creating.name, creating.barcode, (food) => link(creating.id, food), () => setCreating(null)) : null}

      {editingLine ? (
        <AmountSheet
          line={editingLine}
          onClose={() => setEditing(null)}
          onSave={(quantity, unit, where) => {
            setLines((all) => all.map((l) => (l.id === editingLine.id ? { ...l, quantity, unit, where } : l)));
            setEditing(null);
          }}
        />
      ) : null}
    </Page>
  );
}

/** How much went in, and where it lives. */
function AmountSheet({ line, onClose, onSave }: { line: Line; onClose: () => void; onSave: (quantity: number, unit: string, where: StorageLocation) => void }) {
  const [quantity, setQuantity] = useState(line.quantity);
  const [unit, setUnit] = useState(line.unit);
  const [where, setWhere] = useState<StorageLocation>(line.where ?? 'pantry');
  return (
    <Sheet title={line.food?.name ?? line.text} sub={line.text} onClose={onClose}>
      <div className="field-row" style={{ marginTop: 12 }}>
        <div className="field">
          <label htmlFor="r-amt">Amount</label>
          <input id="r-amt" type="number" inputMode="decimal" min={0} step="any" value={Number.isFinite(quantity) ? quantity : ''} onChange={(e) => setQuantity(Number(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="r-unit">Unit</label>
          <UnitSelect id="r-unit" value={unit} onChange={setUnit} suggested={line.unit} />
        </div>
      </div>
      <div className="label" style={{ marginTop: 18 }}>Where it lives</div>
      <div className="chips" style={{ marginTop: 8 }}>
        {ROOMS.map((r) => (
          <button key={r.key} type="button" className={`chip${where === r.key ? ' on' : ''}`} onClick={() => setWhere(r.key)}>{r.label}</button>
        ))}
      </div>
      <button type="button" className="btn block" style={{ marginTop: 22 }} onClick={() => onSave(quantity, unit, where)} disabled={!(quantity > 0)}>Done</button>
    </Sheet>
  );
}

/** In a browser there is no Apple text recognition, so development reads this shop instead. */
const SAMPLE_PIECES: TextPiece[] = [
  'CORNER GROCER', '1400 MAIN ST', 'WHL MLK 1GAL  3.48 N', 'GRK YGRT PLN 32OZ  5.29 N', 'BNLS SKNLS CHKN BRST  9.87 F',
  'KS ORG EGGS 24CT  7.49 N', 'SHRP CHDR 8OZ  2.98 N', 'BANANAS  1.36 F', '2.31 LB @ 0.59 /LB', 'SPAGHETTI 16OZ  1.28 N',
  'MARINARA 24OZ  3.12 N', 'SRIRACHA 17OZ  3.99 N', 'UNSLTD BUTTER 4PK  4.64 N', 'AVOCADO 3 @ .89  2.67 F', 'OAT MLK BARISTA  4.49 N',
  'BAG FEE  0.10', 'FRZ PEAS 12OZ  1.49 N', 'SUBTOTAL  62.37', 'TAX  1.12', 'VISA  63.49',
].map((text, i) => ({ text, x: 0.08, y: 0.1 + i * 0.035, w: 0.8, h: 0.024 }));
