import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { artFor, drawArt, type ArtSpec } from './art';
import { needsLink } from '../components/CountsAs';
import { formatAmount } from '../lib/format';
import type { InventoryItem, StorageLocation } from '../lib/types';
import './fridge.css';

/*
 * The pantry, as the place it is.
 *
 * A fixed frame (the cabinet opening) with its walls drawn in one-point
 * perspective, and the shelves scrolling inside it, so a full fridge scrolls
 * like looking up and down a real one while the room stays still. Produce goes
 * in the crisper; the freezer is all drawers; the cupboard is wooden shelves.
 */

export type Zone = StorageLocation;
type Mode = 'pantry' | 'cook';

const DRAWER_KINDS = new Set(['leafy', 'produce', 'long', 'berries', 'bunch', 'punnet']);
const CATEGORY_ORDER = ['Dairy & Eggs', 'Cheese', 'Meat & Seafood', 'Bakery', 'Sauces', 'Condiments', 'Beverages', 'Frozen', 'Canned Goods', 'Pasta', 'Grains', 'Legumes', 'Baking', 'Oils & Vinegars', 'Spices', 'Nuts & Seeds', 'Snacks', 'Produce', 'Fruit', 'Herbs'];

interface Placed { item: InventoryItem; spec: ArtSpec; w: number; h: number; vw: number; vh: number; svg: string }

/** A linked product is drawn as the food it counts as: a jug of milk, whatever the label calls it. */
export function drawnAs(food: Pick<InventoryItem['food'], 'name' | 'category' | 'countsAs'>): { name: string; category: string | null } {
  return { name: food.countsAs?.name ?? food.name, category: food.countsAs?.category ?? food.category };
}

/** The red ! on the picture of a scanned product that is not linked to a food yet. */
export function LinkBadge({ style }: { style?: React.CSSProperties }) {
  return <span className="link-badge" style={style} aria-hidden="true">!</span>;
}

function place(item: InventoryItem, s: number): Placed {
  const spec = artFor({
    ...drawnAs(item.food),
    quantity: item.quantity,
    unit: item.unit,
    isLowStock: item.isLowStock,
    isLeftover: item.isLeftover,
  });
  const art = drawArt(spec);
  return { item, spec, w: art.w * s, h: art.h * s, vw: art.w, vh: art.h, svg: art.svg };
}

function sortForShelves(a: Placed, b: Placed) {
  const ca = CATEGORY_ORDER.indexOf(a.item.food.category ?? ''), cb = CATEGORY_ORDER.indexOf(b.item.food.category ?? '');
  if (a.item.isLeftover !== b.item.isLeftover) return a.item.isLeftover ? -1 : 1;
  if (ca !== cb) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
  return (a.item.daysUntilExpiration ?? 9999) - (b.item.daysUntilExpiration ?? 9999);
}

/** Fill shelves left to right by how much room each thing takes. */
function pack(placed: Placed[], room: number, minCol: number, gap: number): Placed[][] {
  const rows: Placed[][] = [];
  let row: Placed[] = [], used = 0;
  for (const p of placed) {
    const need = Math.max(minCol, p.w + gap);
    if (row.length && used + need > room) { rows.push(row); row = []; used = 0; }
    row.push(p);
    used += need;
  }
  if (row.length) rows.push(row);
  return rows;
}

export function expiryTag(item: Pick<InventoryItem, 'daysUntilExpiration' | 'expiryStatus'>): { text: string; tone: 'red' | 'soon' } | null {
  const d = item.daysUntilExpiration;
  if (item.expiryStatus === 'expired' || (d !== null && d < 0)) return { text: 'Expired', tone: 'red' };
  if (d === 0) return { text: 'Today', tone: 'red' };
  if (d === 1) return { text: 'Tomorrow', tone: 'red' };
  if (item.expiryStatus === 'expiring_soon' && d !== null) return { text: `${d} days`, tone: 'soon' };
  return null;
}

/** "100 g yogurt": the noun can go when a shelf is too crowded to say it */
function AmountTag({ label }: { label: string }) {
  const cut = label.lastIndexOf(' ');
  if (cut < 0) return <span className="amount">{label}</span>;
  return <span className="amount">{label.slice(0, cut)}<span className="nn">{'\u00a0'}{label.slice(cut + 1)}</span></span>;
}

const Art = memo(function Art({ svg, w, h, vw, vh }: { svg: string; w: number; h: number; vw: number; vh: number }) {
  return <svg width={w} height={h} viewBox={`0 0 ${vw} ${vh}`} dangerouslySetInnerHTML={{ __html: svg }} />;
});

function Walls({ width, height }: { width: number; height: number }) {
  if (!width || !height) return null;
  const W = width, H = height, vpY = 14, k = 0.9;
  const bx0 = (W / 2) * (1 - k), bx1 = W - bx0, by0 = vpY * (1 - k), by1 = vpY + (H - vpY) * k;
  return (
    <svg className="walls" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path className="w-ceil" d={`M0 0H${W}L${bx1} ${by0}H${bx0}Z`} />
      <path className="w-side" d={`M0 0L${bx0} ${by0}V${by1}L0 ${H}Z`} />
      <path className="w-side" d={`M${W} 0V${H}L${bx1} ${by1}V${by0}Z`} />
      <path className="w-floor" d={`M0 ${H}L${bx0} ${by1}H${bx1}L${W} ${H}Z`} />
      <rect className="w-back" x={bx0} y={by0} width={bx1 - bx0} height={by1 - by0} />
      <path className="w-seam" d={`M0 0L${bx0} ${by0}M${W} 0L${bx1} ${by0}M0 ${H}L${bx0} ${by1}M${W} ${H}L${bx1} ${by1}`} />
    </svg>
  );
}

function Column({
  p,
  mode,
  width,
  objH,
  lit,
  onItem,
}: {
  p: Placed;
  mode: Mode;
  width: number;
  objH: number;
  lit?: string;
  onItem?: (item: InventoryItem) => void;
}) {
  const tag = expiryTag(p.item);
  const expired = tag?.text === 'Expired';
  const unlinked = mode === 'pantry' && needsLink(p.item.food);
  const content = (
    <>
      <div className="obj" style={{ height: objH }}>
        <span className="glow" aria-hidden="true" />
        <Art svg={p.svg} w={p.w} h={p.h} vw={p.vw} vh={p.vh} />
        {expired ? <span className="hatch" style={{ width: p.w, height: p.h }} aria-hidden="true" /> : null}
        {unlinked ? <LinkBadge style={{ top: 'auto', right: 'auto', bottom: p.h - 10, left: `calc(50% + ${Math.round(p.w / 2) - 10}px)` }} /> : null}
        {lit ? <AmountTag label={lit} /> : null}
      </div>
      {mode === 'pantry' ? (
        <div className="lab">
          <span className="nm">{p.item.isLeftover ? `${p.item.food.name} (leftovers)` : p.item.food.name}</span>
          <span className="meta">
            <span>{formatAmount(p.item.quantity, p.item.unit)}</span>
            {tag ? <span className={`tag ${tag.tone}`}>{tag.text}</span> : p.item.isLowStock ? <span className="low">Low</span> : null}
          </span>
        </div>
      ) : null}
    </>
  );
  const cls = `col${lit ? ' lit' : ''}`;
  if (mode === 'pantry' && onItem) {
    return (
      <button type="button" className={cls} style={{ width }} onClick={() => onItem(p.item)} data-id={p.item.id} aria-label={`${p.item.food.name}, ${formatAmount(p.item.quantity, p.item.unit)}${tag ? `, ${tag.text}` : ''}${unlinked ? ', not linked to a food' : ''}`}>
        {content}
      </button>
    );
  }
  return <div className={cls} style={{ width }} data-id={p.item.id}>{content}</div>;
}

const PANTRY_SCALE = 0.84;
const COOK_SCALE = 0.76;

export function Fridge({
  zone,
  items,
  mode = 'pantry',
  highlight,
  onItem,
  animateDoor = false,
  empty,
  scrollToLit = false,
}: {
  zone: Zone;
  items: InventoryItem[];
  mode?: Mode;
  /** inventory item id → the amount the recipe takes, for lift and glow */
  highlight?: Map<string, string>;
  onItem?: (item: InventoryItem) => void;
  animateDoor?: boolean;
  empty?: ReactNode;
  scrollToLit?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [door, setDoor] = useState<'closed' | 'open'>(animateDoor ? 'closed' : 'open');

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!animateDoor) return;
    const t = window.setTimeout(() => setDoor('open'), 380);
    return () => window.clearTimeout(t);
  }, [animateDoor]);

  const s = mode === 'cook' ? COOK_SCALE : PANTRY_SCALE;
  const layout = useMemo(() => {
    const placed = items.map((item) => place(item, s)).sort(sortForShelves);
    const inDrawer = zone === 'freezer' ? placed : zone === 'fridge' ? placed.filter((p) => DRAWER_KINDS.has(p.spec.kind) && !p.item.isLeftover) : [];
    const onShelves = placed.filter((p) => !inDrawer.includes(p));
    const room = Math.max(200, size.w - 40);
    const minCol = mode === 'pantry' ? 100 : 60;
    const gap = mode === 'pantry' ? 18 : 14;
    return { shelves: pack(onShelves, room, minCol, gap), drawers: pack(inDrawer, room - 16, minCol, gap) };
  }, [items, s, zone, size.w, mode]);

  // Tonight: bring the first thing the recipe uses into view
  useEffect(() => {
    if (!scrollToLit || !highlight?.size || !scroller.current) return;
    const box = scroller.current;
    const first = box.querySelector<HTMLElement>('.col.lit');
    if (!first) return;
    const top = first.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 40;
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [highlight, scrollToLit, layout]);

  // Tags on one shelf never touch: neighbours are nudged apart, and a shelf
  // with more lit than room to say it drops the nouns ("100 g", not "100 g yogurt").
  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box || !highlight?.size) return;
    const settle = () => {
      for (const shelf of box.querySelectorAll<HTMLElement>('.items')) {
        const tags = Array.from(shelf.querySelectorAll<HTMLElement>('.amount'));
        if (!tags.length) continue;
        const room = shelf.clientWidth, gap = 6, edge = 10;
        for (const t of tags) { t.classList.remove('short'); t.style.marginLeft = ''; }
        const total = () => tags.reduce((sum, t) => sum + t.offsetWidth + gap, -gap);
        if (total() > room + edge * 2) for (const t of tags) t.classList.add('short');
        const want = tags.map((t) => {
          const col = t.closest<HTMLElement>('.col');
          return col ? col.offsetLeft + col.offsetWidth / 2 : 0;
        });
        const half = tags.map((t) => t.offsetWidth / 2);
        const x = [...want];
        for (let pass = 0; pass < 24; pass++) {
          let moved = false;
          for (let i = 1; i < x.length; i++) {
            const overlap = x[i - 1] + half[i - 1] + gap - (x[i] - half[i]);
            if (overlap > 0.5) { x[i - 1] -= overlap / 2; x[i] += overlap / 2; moved = true; }
          }
          for (let i = 0; i < x.length; i++) x[i] = Math.min(Math.max(x[i], half[i] - edge), room + edge - half[i]);
          if (!moved) break;
        }
        tags.forEach((t, i) => { const dx = Math.round(x[i] - want[i]); if (dx) t.style.marginLeft = `${dx}px`; });
      }
    };
    settle();
    let live = true;
    void document.fonts.ready.then(() => { if (live) settle(); });
    return () => { live = false; };
  }, [highlight, layout]);

  const renderRow = (row: Placed[], key: string) => {
    const objH = Math.min(Math.max(...row.map((p) => p.h)) + 6, 104 * s);
    const cols = row.map((p) => Math.max(mode === 'pantry' ? 100 : 60, p.w + (mode === 'pantry' ? 18 : 14)));
    return (
      <div className="shelf-row" key={key}>
        <div className="items">
          {row.map((p, i) => (
            <Column key={p.item.id} p={p} mode={mode} width={cols[i]} objH={objH} lit={highlight?.get(p.item.id)} onItem={onItem} />
          ))}
        </div>
        <div className="slab" style={{ top: (mode === 'cook' ? 16 : 12) + objH - 2 }} aria-hidden="true" />
      </div>
    );
  };

  const nothing = items.length === 0;
  const dim = mode === 'cook' && highlight && highlight.size > 0;

  return (
    <div className={`frame zone-${zone} mode-${mode} door-${door}${dim ? ' dim' : ''}`} ref={frame}>
      <div className="interior">
        <Walls width={size.w} height={size.h} />
        <div className="light" aria-hidden="true" />
        <div className="source" aria-hidden="true" />
        <div className="shelves" ref={scroller}>
          {nothing ? (
            <div className="fridge-empty">{empty}</div>
          ) : (
            <>
              {layout.shelves.length ? <div className="racks">{layout.shelves.map((row, i) => renderRow(row, `s${i}`))}</div> : null}
              {layout.drawers.length ? (
                <div className="drawers">
                  {layout.drawers.map((row, i) => (
                    <div className="drawer" key={`d${i}`}>
                      {renderRow(row, `d${i}`)}
                      <div className="drawer-front" aria-hidden="true" />
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
      <div className="door" aria-hidden="true"><i /></div>
    </div>
  );
}

/** A single item's drawing, for lists, sheets and search results. */
export const FoodThumb = memo(function FoodThumb({
  name,
  category,
  quantity = 1,
  unit = 'count',
  isLeftover,
  size = 40,
}: {
  name: string;
  category: string | null;
  quantity?: number;
  unit?: string;
  isLeftover?: boolean;
  size?: number;
}) {
  const art = useMemo(() => drawArt(artFor({ name, category, quantity, unit, isLeftover })), [name, category, quantity, unit, isLeftover]);
  const scale = Math.min(size / art.w, size / art.h);
  return (
    <svg className="food-thumb" width={art.w * scale} height={art.h * scale} viewBox={`0 0 ${art.w} ${art.h}`} dangerouslySetInnerHTML={{ __html: art.svg }} aria-hidden="true" />
  );
});
