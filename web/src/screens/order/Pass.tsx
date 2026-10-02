import { useEffect, useState, type CSSProperties } from 'react';
import { FoodThumb, drawnAs } from '../../fridge/Fridge';
import { Icon } from '../../ui/Icon';
import type { Order } from './options';
import type { Placed } from './samples';

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
    const timer = window.setInterval(() => setLine((n) => Math.min(n + 1, lines.length - 1)), 850);
    return () => window.clearInterval(timer);
  }, [lines.length]);
  return (
    <div className="pass" aria-live="polite">
      <div className="rail" aria-hidden="true" />
      <div className="pass-row printing" aria-hidden="true">
        {TILT.map((tilt, i) => (
          <div key={i} className="hang" style={{ '--tilt': `${tilt}deg`, '--i': i } as CSSProperties}>
            <span className="slip-clip" />
            <div className="slip blank">
              <span className="bar" style={{ width: '38%' }} />
              <span className="bar tall" style={{ width: '82%' }} />
              <span className="bar tall" style={{ width: '64%' }} />
              <span className="bar" style={{ width: '90%' }} />
              <span className="bar" style={{ width: '70%' }} />
            </div>
          </div>
        ))}
      </div>
      <p className="pass-status">{lines[line]}</p>
    </div>
  );
}

export function Ideas({
  ideas,
  more,
  onPick,
  onAgain,
  onChange,
}: {
  ideas: Placed[];
  /** whether "Three more" has anything left to show */
  more: boolean;
  onPick: (idea: Placed) => void;
  onAgain: () => void;
  onChange: () => void;
}) {
  return (
    <div className="pass">
      <div className="rail" aria-hidden="true" />
      {ideas.length ? (
        <div className="pass-row" role="list">
          {ideas.map((idea, i) => (
            <div key={idea.id} role="listitem" className="hang" style={{ '--tilt': `${TILT[i]}deg`, '--i': i } as CSSProperties}>
            <span className="slip-clip" aria-hidden="true" />
            <article className="slip" aria-labelledby={`slip-${idea.id}`}>
              <header className="slip-head">
                <span>{i + 1} of {ideas.length}</span>
                <span className="num">{idea.minutes} min</span>
              </header>
              <h2 id={`slip-${idea.id}`}>{idea.name}</h2>
              <p className={`slip-note${idea.urgent ? ' urgent' : ''}`}>{idea.note}</p>
              <Stamps idea={idea} />
              <p className="slip-meta">{idea.dish} · serves {idea.serves} · <span className="num">{idea.kcal}</span> kcal each</p>
              <div className="slip-have">
                <span className="slip-have-count">{idea.have.length ? `${idea.have.length} from your kitchen` : 'Nothing from your kitchen'}</span>
                {idea.have.length ? (
                  <span className="thumbs">
                    {idea.have.slice(0, 6).map(({ item }) => (
                      <FoodThumb key={item.id} {...drawnAs(item.food)} quantity={item.quantity} unit={item.unit} isLeftover={item.isLeftover} size={28} />
                    ))}
                  </span>
                ) : null}
              </div>
              <p className="slip-buy">{idea.buy.length ? <>To buy: {idea.buy.map((b) => b.name.toLowerCase()).join(', ')}</> : 'Nothing to buy'}</p>
              <button type="button" className="slip-pick" onClick={() => onPick(idea)}>
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
      <p className="pass-note">Sample tickets: the kitchen isn’t connected yet, so these come from a small set of real recipes.</p>
      <div className="btn-row pass-actions">
        <button type="button" className="btn secondary" onClick={onChange}>Change the order</button>
        <button type="button" className="btn outline" onClick={onAgain} disabled={!more}>Three more</button>
      </div>
    </div>
  );
}

function Stamps({ idea }: { idea: Placed }) {
  return (
    <div className="slip-stamps">
      {idea.feels.slice(0, 3).map((feel) => (
        <span key={feel} className="stamp">{feel}</span>
      ))}
      <span className="stamp sample">Sample</span>
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
  idea,
  order,
  onTweak,
  onSave,
  onList,
}: {
  idea: Placed;
  order: Order;
  onTweak: (next: Order) => void;
  onSave: () => void;
  onList: () => void;
}) {
  const staples = idea.ingredients.filter((i) => i.staple && !idea.have.some((h) => h.ingredient === i));
  return (
    <div className="ordered">
      <div className="rail" aria-hidden="true" />
      <div className="hang stub" style={{ '--tilt': '-0.4deg', '--i': 0 } as CSSProperties}>
      <span className="slip-clip" aria-hidden="true" />
      <article className="slip">
        <header className="slip-head">
          <span>{idea.dish}</span>
          <span className="num">{idea.minutes} min</span>
        </header>
        <h1>{idea.name}</h1>
        <p className={`slip-note${idea.urgent ? ' urgent' : ''}`}>{idea.note}</p>
        <Stamps idea={idea} />
        <p className="slip-meta">Serves {idea.serves} · <span className="num">{idea.kcal}</span> kcal a serving{order.serves !== String(idea.serves) ? ` · you asked for ${order.serves}` : ''}</p>
      </article>
      </div>

      <section className="ordered-part">
        <h2>From your kitchen</h2>
        {idea.have.length ? (
          <div className="group">
            {idea.have.map(({ ingredient, item }) => (
              <div key={ingredient.name} className="list-row">
                <span className="thumb"><FoodThumb {...drawnAs(item.food)} quantity={item.quantity} unit={item.unit} isLeftover={item.isLeftover} size={34} /></span>
                <span className="grow">
                  <span className="t">{ingredient.name}</span>
                  <span className="s">{ingredient.amount}</span>
                </span>
                <span className="room">{ROOM[item.storageLocation] ?? ''}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Nothing in this one comes from your kitchen.</p>
        )}
        {staples.length ? <p className="fine" style={{ marginTop: 10 }}>Also uses {staples.map((s) => s.name.toLowerCase()).join(', ')}, from the cupboard staples.</p> : null}
      </section>

      {idea.buy.length ? (
        <section className="ordered-part">
          <h2>To buy</h2>
          <div className="group">
            {idea.buy.map((ingredient) => (
              <div key={ingredient.name} className="list-row">
                <span className="grow">
                  <span className="t">{ingredient.name}</span>
                  <span className="s">{ingredient.amount}</span>
                </span>
              </div>
            ))}
          </div>
          <button type="button" className="btn secondary block" style={{ marginTop: 12 }} onClick={onList}>
            <Icon name="shopping" size={18} /> Add {idea.buy.length} to the shopping list
          </button>
        </section>
      ) : null}

      <section className="ordered-part">
        <h2>Method</h2>
        <ol className="method">
          {idea.steps.map((step, i) => (
            <li key={i}>{step}</li>
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
        <button type="button" className="btn block" onClick={onSave}>Save to my recipes</button>
      </div>
    </div>
  );
}
