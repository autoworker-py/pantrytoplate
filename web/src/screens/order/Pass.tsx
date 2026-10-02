import { useEffect, useState, type CSSProperties } from 'react';
import type { InventoryItem } from '../../lib/types';
import { FoodThumb, drawnAs } from '../../fridge/Fridge';
import { Icon } from '../../ui/Icon';
import type { Order } from './options';
import { isToBuy, type KitchenRecipe, type Ticket } from './kitchen';

/*
 * The pass: where finished tickets hang on a steel rail. Three print out for
 * each order; one is chosen and comes down to be read in full.
 */

const TILT = [-1.2, 0.9, -0.6];
const ROOM: Record<string, string> = { fridge: 'Fridge', pantry: 'Cupboard', freezer: 'Freezer' };

/** While the kitchen works: three blank tickets feeding out under the light. */
export function Printing() {
  const lines = ['Sent to the kitchen', 'Checking what you have', 'Writing up three tickets'];
  const [line, setLine] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setLine((n) => Math.min(n + 1, lines.length - 1)), 1100);
    return () => window.clearInterval(timer);
  }, [lines.length]);
  return (
    <div className="pass" aria-live="polite">
      <div className="rail" aria-hidden="true" />
      <div className="pass-row printing" aria-hidden="true">
        {TILT.map((tilt, i) => (
          <div key={i} className="hang" style={{ '--tilt': `${tilt}deg`, '--i': i } as CSSProperties}>
            <span className="slip-clip" />
            <BlankSlip />
          </div>
        ))}
      </div>
      <p className="pass-status">{lines[line]}</p>
    </div>
  );
}

function BlankSlip() {
  return (
    <div className="slip blank">
      <span className="bar" style={{ width: '38%' }} />
      <span className="bar tall" style={{ width: '82%' }} />
      <span className="bar tall" style={{ width: '64%' }} />
      <span className="bar" style={{ width: '90%' }} />
      <span className="bar" style={{ width: '70%' }} />
    </div>
  );
}

export function Ideas({
  tickets,
  sample,
  onPick,
  onAgain,
  onChange,
}: {
  tickets: Ticket[];
  /** the server has no AI key: canned tickets, said so */
  sample: boolean;
  onPick: (ticket: Ticket) => void;
  onAgain: () => void;
  onChange: () => void;
}) {
  return (
    <div className="pass">
      <div className="rail" aria-hidden="true" />
      {tickets.length ? (
        <div className="pass-row" role="list">
          {tickets.map((ticket, i) => (
            <div key={ticket.id} role="listitem" className="hang" style={{ '--tilt': `${TILT[i]}deg`, '--i': i } as CSSProperties}>
              <span className="slip-clip" aria-hidden="true" />
              <article className="slip" aria-labelledby={`slip-${ticket.id}`}>
                <header className="slip-head">
                  <span>{i + 1} of {tickets.length}</span>
                  <span className="num">{ticket.minutes} min</span>
                </header>
                <h2 id={`slip-${ticket.id}`}>{ticket.name}</h2>
                {ticket.note ? <p className={`slip-note${ticket.urgent ? ' urgent' : ''}`}>{ticket.note}</p> : null}
                <Stamps feels={ticket.feels} sample={sample} />
                <p className="slip-meta">{ticket.cuisine ? `${ticket.cuisine} · ` : ''}serves {ticket.serves} · <span className="num">{ticket.kcal}</span> kcal each</p>
                <div className="slip-have">
                  <span className="slip-have-count">{ticket.have.length ? `${ticket.have.length} from your kitchen` : 'Nothing from your kitchen'}</span>
                  {ticket.have.length ? (
                    <span className="thumbs">
                      {ticket.have.slice(0, 6).map((item) => (
                        <FoodThumb key={item.id} {...drawnAs(item.food)} quantity={item.quantity} unit={item.unit} isLeftover={item.isLeftover} size={28} />
                      ))}
                    </span>
                  ) : null}
                </div>
                <p className="slip-buy">{ticket.buy.length ? <>To buy: {ticket.buy.join(', ')}</> : 'Nothing to buy'}</p>
                <button type="button" className="slip-pick" onClick={() => onPick(ticket)}>
                  See the recipe <Icon name="chevron" size={16} stroke={2.2} />
                </button>
              </article>
            </div>
          ))}
        </div>
      ) : (
        <div className="pass-row">
          <div className="hang lone" style={{ '--tilt': '-0.8deg', '--i': 0 } as CSSProperties}>
            <span className="slip-clip" aria-hidden="true" />
            <article className="slip">
              <h2>Nothing fits that order</h2>
              <p className="slip-note">Loosen it a little: fewer feels, another cuisine, or Anything instead of Only mine.</p>
            </article>
          </div>
        </div>
      )}
      <p className="pass-note">
        {sample
          ? 'Sample tickets: this server has no AI key, so these are the same three every time.'
          : 'Written by AI from your order and your kitchen. Check for allergens, and cook meat, fish and eggs through.'}
      </p>
      <div className="btn-row pass-actions">
        <button type="button" className="btn secondary" onClick={onChange}>Change the order</button>
        <button type="button" className="btn outline" onClick={onAgain}>Three more</button>
      </div>
    </div>
  );
}

function Stamps({ feels, sample }: { feels: string[]; sample: boolean }) {
  return (
    <div className="slip-stamps">
      {feels.slice(0, 3).map((feel) => (
        <span key={feel} className="stamp">{feel}</span>
      ))}
      {sample ? <span className="stamp sample">Sample</span> : null}
    </div>
  );
}

const TWEAKS: { label: string; apply: (o: Order) => Order }[] = [
  { label: 'Spicier', apply: (o) => ({ ...o, feels: o.feels.includes('Spicy') ? o.feels : [...o.feels, 'Spicy'], heat: 'Hot' }) },
  { label: 'Milder', apply: (o) => ({ ...o, feels: o.feels.filter((f) => f !== 'Spicy') }) },
  { label: 'Quicker', apply: (o) => ({ ...o, time: 'Under 15 min' }) },
  { label: 'Lighter', apply: (o) => ({ ...o, feels: o.feels.includes('Light') ? o.feels : [...o.feels, 'Light'], calories: 'light' }) },
  { label: 'No oven', apply: (o) => ({ ...o, kit: 'No oven' }) },
  { label: 'Vegetarian', apply: (o) => ({ ...o, diet: 'Vegetarian' }) },
];

/** The chosen ticket, in full: what it takes from the kitchen, what to buy, how to make it. */
export function Ordered({
  ticket,
  recipe,
  pantry,
  sample,
  order,
  saved,
  busy,
  onTweak,
  onSave,
  onList,
}: {
  ticket: Ticket;
  /** null while the kitchen writes it up */
  recipe: KitchenRecipe | null;
  pantry: InventoryItem[];
  sample: boolean;
  order: Order;
  saved: boolean;
  busy: boolean;
  onTweak: (next: Order) => void;
  onSave: () => void;
  onList: (names: string[]) => void;
}) {
  const fromKitchen = (recipe?.ingredients ?? [])
    .map((ingredient) => ({ ingredient, item: ingredient.inventoryItemId ? pantry.find((i) => i.id === ingredient.inventoryItemId) : undefined }))
    .filter((row): row is { ingredient: KitchenRecipe['ingredients'][number]; item: InventoryItem } => Boolean(row.item));
  const others = (recipe?.ingredients ?? []).filter((i) => !fromKitchen.some((row) => row.ingredient === i));
  const toBuy = others.filter((i) => isToBuy(i.name, ticket.buy));
  const besides = others.filter((i) => !toBuy.includes(i));

  return (
    <div className="ordered">
      <div className="rail" aria-hidden="true" />
      <div className="hang stub" style={{ '--tilt': '-0.4deg', '--i': 0 } as CSSProperties}>
        <span className="slip-clip" aria-hidden="true" />
        <article className="slip">
          <header className="slip-head">
            <span>{ticket.cuisine || 'To order'}</span>
            <span className="num">{ticket.minutes} min</span>
          </header>
          <h1>{ticket.name}</h1>
          {ticket.note ? <p className={`slip-note${ticket.urgent ? ' urgent' : ''}`}>{ticket.note}</p> : null}
          <Stamps feels={ticket.feels} sample={sample} />
          <p className="slip-meta">Serves {ticket.serves} · <span className="num">{recipe?.kcal ?? ticket.kcal}</span> kcal a serving</p>
        </article>
      </div>

      {!recipe ? (
        <div className="writing" aria-live="polite">
          <p className="pass-status">Writing it up</p>
          <div className="skeleton" style={{ height: 64, marginTop: 14 }} />
          <div className="skeleton" style={{ height: 64, marginTop: 8 }} />
          <div className="skeleton" style={{ height: 120, marginTop: 8 }} />
        </div>
      ) : (
        <>
          <section className="ordered-part">
            <h2>From your kitchen</h2>
            {fromKitchen.length ? (
              <div className="group">
                {fromKitchen.map(({ ingredient, item }) => (
                  <div key={`${ingredient.name}-${item.id}`} className="list-row">
                    <span className="thumb"><FoodThumb {...drawnAs(item.food)} quantity={item.quantity} unit={item.unit} isLeftover={item.isLeftover} size={34} /></span>
                    <span className="grow">
                      <span className="t">{item.food.name}</span>
                      <span className="s">{ingredient.amount}</span>
                    </span>
                    <span className="room">{ROOM[item.storageLocation] ?? ''}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Nothing in this one comes from your kitchen.</p>
            )}
          </section>

          {toBuy.length ? (
            <section className="ordered-part">
              <h2>To buy</h2>
              <div className="group">
                {toBuy.map((ingredient) => (
                  <div key={ingredient.name} className="list-row">
                    <span className="grow">
                      <span className="t">{ingredient.name.charAt(0).toUpperCase() + ingredient.name.slice(1)}</span>
                      <span className="s">{ingredient.amount}</span>
                    </span>
                  </div>
                ))}
              </div>
              <button type="button" className="btn secondary block" style={{ marginTop: 12 }} disabled={busy} onClick={() => onList(toBuy.map((i) => i.name))}>
                <Icon name="shopping" size={18} /> Add {toBuy.length} to the shopping list
              </button>
            </section>
          ) : null}

          {besides.length ? (
            <p className="fine" style={{ marginTop: 12 }}>
              Also uses {besides.map((i) => `${i.amount ? `${i.amount} ` : ''}${i.name}`.trim()).join(', ')}.
            </p>
          ) : null}

          <section className="ordered-part">
            <h2>Method</h2>
            <ol className="method">
              {recipe.steps.map((step, i) => (
                <li key={i}>{step.replace(/^\s*\d+[.)]\s*/, '')}</li>
              ))}
            </ol>
          </section>

          <section className="ordered-part">
            <h2>Change it</h2>
            <div className="chips wrap">
              {TWEAKS.map((t) => (
                <button key={t.label} type="button" className="chip" onClick={() => onTweak(t.apply(order))}>{t.label}</button>
              ))}
            </div>
          </section>

          <div className="order-send">
            <button key={saved ? 'saved' : 'save'} type="button" className="btn block" disabled={busy || saved} onClick={onSave}>
              {saved ? 'Saved to your recipes' : busy ? 'Saving…' : 'Save to my recipes'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
