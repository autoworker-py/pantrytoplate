/*
 * THESIS: Ordering dinner from your own kitchen: a paper order ticket filled in
 * like a waiter's pad, not a chat box and not a settings form.
 * OWN-WORLD: The Night room under one warm light; a long strip of thermal paper
 * (printed type, torn edge) where choices are inked with the receipt's warm
 * highlighter; food drawings are the only colour; the small print is
 * dot-leader receipt lines that open the phone's own pickers; finished tickets
 * hang on a steel rail.
 * STORY: Say what you want, mark how it should feel, pick a cuisine, tick food
 * to use up, send. Three tickets print onto the rail; pick one, read it in full,
 * save it or shop the gaps.
 * FIRST VIEWPORT: Header "Make me something"; the ticket's head (ORDER and the
 * time) under the light; the big "What are you after?" line; the feel tags
 * beginning; "Send to the kitchen" held at the foot above the tabs.
 * FORM: Order ticket, first on my ordered list, dealt third; seed d6e6f504.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 * finish review, the verdict, DESIGN.md, and every shipping raster carrying its
 * provenance
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { DayDiary, InventoryItem, Settings } from '../../lib/types';
import { BackButton, Page, useToast } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { blankOrder, isBlank, type Order } from './options';
import { pickIdeas, remaining, type Placed } from './samples';
import { Ticket } from './Ticket';
import { Ideas, Ordered, Printing } from './Pass';
import './order.css';

type Stage = 'order' | 'printing' | 'ideas' | 'recipe';

/** the person's own calendar day, never UTC's */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Make me something: write an order, the kitchen sends back three tickets,
 * pick one. The kitchen is an AI model once it is connected; until then the
 * tickets come from a small set of real sample recipes and say so.
 */
export default function MakeMeSomething() {
  const toast = useToast();
  const [order, setOrder] = useState<Order>(blankOrder);
  const [stage, setStage] = useState<Stage>('order');
  const [ideas, setIdeas] = useState<Placed[]>([]);
  const [shown, setShown] = useState<string[]>([]);
  const [chosen, setChosen] = useState<Placed | null>(null);
  const [pantry, setPantry] = useState<InventoryItem[] | null>(null);
  const [caloriesLeft, setCaloriesLeft] = useState<number | null>(null);
  const [dietTags, setDietTags] = useState<string[]>([]);
  const printedAt = useMemo(() => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), []);
  const kitchen = useRef<number | undefined>(undefined);

  useEffect(() => {
    let live = true;
    api.get<{ items: InventoryItem[] }>('/api/inventory?sort=expiration').then((d) => live && setPantry(d.items)).catch(() => live && setPantry([]));
    api.get<DayDiary>(`/api/consumption/today?date=${today()}`).then((d) => live && setCaloriesLeft(Math.round(d.caloriesRemaining))).catch(() => undefined);
    api.get<{ settings: Settings }>('/api/settings').then((d) => live && setDietTags(d.settings.dietTags ?? [])).catch(() => undefined);
    return () => {
      live = false;
      window.clearTimeout(kitchen.current);
    };
  }, []);

  // each step starts at the top of the screen, as a new page would
  useEffect(() => {
    document.querySelector('.make-page .page-scroll')?.scrollTo({ top: 0 });
  }, [stage, chosen]);

  function send(next: Order = order, fresh = true) {
    const already = fresh ? [] : shown;
    setOrder(next);
    setStage('printing');
    window.clearTimeout(kitchen.current);
    kitchen.current = window.setTimeout(() => {
      const picked = pickIdeas(next, pantry ?? [], already);
      setIdeas(picked);
      setShown([...already, ...picked.map((p) => p.id)]);
      setStage('ideas');
    }, 2400);
  }

  const sample = () => toast('This is a sample ticket. Saving and lists work once the kitchen is connected.');

  const back = (to: Stage) => (
    <button type="button" className="icon-btn" aria-label="Back" onClick={() => { window.clearTimeout(kitchen.current); setStage(to); }}>
      <Icon name="back" size={20} />
    </button>
  );
  const left = stage === 'order' ? <BackButton /> : stage === 'recipe' ? back('ideas') : back('order');

  return (
    <Page left={left} title="Make me something" className="make-page">
      {stage === 'order' ? (
        <>
          <div className="ticket-stage">
            <Ticket order={order} onChange={setOrder} pantry={pantry} caloriesLeft={caloriesLeft} dietTags={dietTags} printedAt={printedAt} />
          </div>
          <div className="order-send">
            {/* keyed by its label: iOS WebKit does not always repaint a pinned button whose text changes */}
            <button key={isBlank(order) ? 'surprise' : 'send'} type="button" className="btn block" onClick={() => send()}>
              {isBlank(order) ? 'Surprise me' : 'Send to the kitchen'}
            </button>
          </div>
        </>
      ) : stage === 'printing' ? (
        <Printing />
      ) : stage === 'ideas' ? (
        <Ideas
          ideas={ideas}
          more={remaining(shown) > 0}
          onPick={(idea) => { setChosen(idea); setStage('recipe'); }}
          onAgain={() => send(order, false)}
          onChange={() => setStage('order')}
        />
      ) : chosen ? (
        <Ordered idea={chosen} order={order} onTweak={(next) => send(next)} onSave={sample} onList={sample} />
      ) : null}
    </Page>
  );
}
