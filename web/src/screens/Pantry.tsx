import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { InventoryItem, StorageLocation } from '../lib/types';
import { formatAmount } from '../lib/format';
import { Fridge, FoodThumb, LinkBadge, drawnAs, expiryTag } from '../fridge/Fridge';
import { needsLink } from '../components/CountsAs';
import { ZONES, ZonePager } from '../fridge/ZonePager';
import { Icon } from '../ui/Icon';
import { Empty, Logo, Page, Sheet } from '../ui/kit';
import { ItemSheet } from './ItemSheet';
import { firstDoorThisSession } from './door';

const ZONE_KEY = 'pantry.zone';

export default function Pantry() {
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zone, setZone] = useState<StorageLocation>(() => (sessionStorage.getItem(ZONE_KEY) as StorageLocation) || 'fridge');
  const [active, setActive] = useState<InventoryItem | null>(null);
  const [searching, setSearching] = useState(false);
  const [door] = useState(firstDoorThisSession);

  const load = useCallback(async (fresh = false) => {
    try {
      const path = '/api/inventory?sort=expiration';
      const data = fresh ? await api.getFresh<{ items: InventoryItem[] }>(path) : await api.get<{ items: InventoryItem[] }>(path);
      setItems(data.items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your pantry.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byZone = useMemo(() => {
    const out: Record<StorageLocation, InventoryItem[]> = { fridge: [], pantry: [], freezer: [] };
    for (const item of items ?? []) out[item.storageLocation]?.push(item);
    return out;
  }, [items]);

  function pick(next: StorageLocation) {
    setZone(next);
    sessionStorage.setItem(ZONE_KEY, next);
  }

  return (
    <Page
      fixed
      left={
        <button type="button" className="icon-btn" aria-label="Search the pantry" onClick={() => setSearching(true)}>
          <Icon name="search" size={20} />
        </button>
      }
      center={<Logo />}
      right={
        <Link to="/add" className="icon-btn" aria-label="Put food away">
          <Icon name="plus" size={20} />
        </Link>
      }
    >
      <div className="seg zone-seg" role="tablist" aria-label="Where it is kept">
        {ZONES.map((z) => (
          <button key={z.key} type="button" role="tab" aria-selected={zone === z.key} className={zone === z.key ? 'on' : ''} onClick={() => pick(z.key)}>
            <span>
              {z.label}
              {items ? <span className="count">{byZone[z.key].length}</span> : null}
            </span>
          </button>
        ))}
      </div>

      {error ? (
        <div className="pad"><div className="banner error">{error} <button type="button" className="link-btn" onClick={() => void load(true)}>Try again</button></div></div>
      ) : null}

      <ZonePager
        zone={zone}
        onZone={pick}
        render={(z) => (
          <Fridge
            zone={z}
            items={byZone[z]}
            onItem={setActive}
            animateDoor={door && z === 'fridge'}
            empty={
              items ? (
                <Empty
                  title={z === 'freezer' ? 'The freezer is empty' : z === 'pantry' ? 'The cupboard is empty' : 'The fridge is empty'}
                  action={<Link to="/add" className="btn small">Put food away</Link>}
                >
                  Scan or type what you bought once. After that, using it is a tap.
                </Empty>
              ) : null
            }
          />
        )}
      />

      {searching ? (
        <SearchSheet
          items={items ?? []}
          onClose={() => setSearching(false)}
          onPick={(item) => {
            setSearching(false);
            setActive(item);
          }}
        />
      ) : null}

      {active ? (
        <ItemSheet
          item={active}
          onClose={() => setActive(null)}
          onChanged={() => {
            setActive(null);
            void load(true);
          }}
        />
      ) : null}
    </Page>
  );
}

function SearchSheet({ items, onClose, onPick }: { items: InventoryItem[]; onClose: () => void; onPick: (item: InventoryItem) => void }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const found = useMemo(
    () => (term ? items.filter((i) => i.food.name.toLowerCase().includes(term) || (i.food.brand ?? '').toLowerCase().includes(term)) : items).slice(0, 60),
    [items, term],
  );
  const where = { fridge: 'Fridge', pantry: 'Cupboard', freezer: 'Freezer' } as const;
  return (
    <Sheet title="Find in your pantry" onClose={onClose}>
      <div className="search" style={{ marginTop: 8 }}>
        <Icon name="search" size={18} />
        <input className="input" autoFocus value={q} placeholder="Milk, rice, that jar of pesto…" onChange={(e) => setQ(e.target.value)} aria-label="Search your pantry" />
      </div>
      <div className="list" style={{ marginTop: 12 }}>
        {found.map((item) => {
          const tag = expiryTag(item);
          return (
            <button key={item.id} type="button" className="list-row" onClick={() => onPick(item)}>
              <span className="thumb"><FoodThumb {...drawnAs(item.food)} quantity={item.quantity} unit={item.unit} isLeftover={item.isLeftover} size={34} />{needsLink(item.food) ? <LinkBadge /> : null}</span>
              <span className="grow">
                <span className="t">{item.food.name}</span>
                <span className="s">{formatAmount(item.quantity, item.unit)} · {where[item.storageLocation]}</span>
              </span>
              {tag ? <span className={`tag ${tag.tone}`}>{tag.text}</span> : null}
            </button>
          );
        })}
        {found.length === 0 ? <p className="fine" style={{ padding: '18px 0' }}>Nothing called “{q}”. <Link to="/add" className="link-btn">Add it</Link></p> : null}
      </div>
    </Sheet>
  );
}
