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
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { done } from '../../lib/native';
import type { DayDiary, InventoryItem, Settings } from '../../lib/types';
import { BackButton, Page, errorText, useToast } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { blankOrder, isBlank, type Order } from './options';
import { askIdeas, askRecipe, place, saveRecipe, type KitchenRecipe, type Ticket as KitchenTicket } from './kitchen';
import { Ticket } from './Ticket';
import { Ideas, Ordered, Printing } from './Pass';
import './order.css';

type Stage = 'order' | 'printing' | 'ideas' | 'recipe';

/** the person's own calendar day, never UTC's */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** the tickets take this long to print however quickly the kitchen answers */
const PRINT_MS = 1600;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Make me something: write an order, the kitchen (an AI model, on the server)
 * sends back three tickets, pick one and it is written up in full, ready to
 * save to your recipes or shop for.
 */
export default function MakeMeSomething() {
  const toast = useToast();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order>(blankOrder);
  const [stage, setStage] = useState<Stage>('order');
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [shown, setShown] = useState<string[]>([]);
  const [sample, setSample] = useState(false);
  const [chosen, setChosen] = useState<KitchenTicket | null>(null);
  const [recipe, setRecipe] = useState<KitchenRecipe | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pantry, setPantry] = useState<InventoryItem[] | null>(null);
  const [caloriesLeft, setCaloriesLeft] = useState<number | null>(null);
  const [dietTags, setDietTags] = useState<string[]>([]);
  const printedAt = useMemo(() => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), []);
  // each request is numbered: an answer that arrives after the person moved on is dropped
  const asking = useRef(0);

  useEffect(() => {
    let live = true;
    api.get<{ items: InventoryItem[] }>('/api/inventory?sort=expiration').then((d) => live && setPantry(d.items)).catch(() => live && setPantry([]));
    api.get<DayDiary>(`/api/consumption/today?date=${today()}`).then((d) => live && setCaloriesLeft(Math.round(d.caloriesRemaining))).catch(() => undefined);
    api.get<{ settings: Settings }>('/api/settings').then((d) => live && setDietTags(d.settings.dietTags ?? [])).catch(() => undefined);
    return () => {
      live = false;
      asking.current++;
    };
  }, []);

  // each step starts at the top of the screen, as a new page would
  useEffect(() => {
    document.querySelector('.make-page .page-scroll')?.scrollTo({ top: 0 });
  }, [stage, chosen]);

  async function send(next: Order = order, more = false) {
    const ask = ++asking.current;
    const avoid = more ? shown.slice(-9) : [];
    setOrder(next);
    setStage('printing');
    const started = Date.now();
    try {
      const answer = await askIdeas({ ...next, caloriesLeft, avoid });
      await wait(Math.max(0, PRINT_MS - (Date.now() - started)));
      if (ask !== asking.current) return;
      setTickets(answer.ideas.map((idea) => place(idea, pantry ?? [])));
      setShown([...avoid, ...answer.ideas.map((idea) => idea.name)]);
      setSample(answer.sample);
      setStage('ideas');
    } catch (cause) {
      if (ask !== asking.current) return;
      setStage(more ? 'ideas' : 'order');
      toast(errorText(cause, 'The kitchen did not answer. Try again.'));
    }
  }

  async function pick(ticket: KitchenTicket) {
    const ask = ++asking.current;
    setChosen(ticket);
    setRecipe(null);
    setSavedId(null);
    setStage('recipe');
    try {
      const answer = await askRecipe({ ...order, caloriesLeft }, ticket);
      if (ask === asking.current) setRecipe(answer.recipe);
    } catch (cause) {
      if (ask !== asking.current) return;
      setStage('ideas');
      toast(errorText(cause, 'That one could not be written up. Try another.'));
    }
  }

  async function save() {
    if (!chosen || !recipe || savedId) return;
    setBusy(true);
    try {
      const { recipe: saved } = await saveRecipe(chosen, recipe);
      setSavedId(saved.id);
      done();
      toast('Saved to your recipes.', { label: 'Open', run: () => navigate(`/recipes/${saved.id}`) });
    } catch (cause) {
      toast(errorText(cause, 'It could not be saved. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function list(names: string[]) {
    setBusy(true);
    let added = 0;
    try {
      for (const name of names) {
        await api.post('/api/shopping-list', { name: name.charAt(0).toUpperCase() + name.slice(1) });
        added++;
      }
      done();
      toast(`Added ${added} to your shopping list.`, { label: 'Open', run: () => navigate('/shopping') });
    } catch (cause) {
      toast(errorText(cause, added ? `Added ${added}, then something went wrong.` : 'The list could not be changed. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  const back = (to: Stage) => (
    <button type="button" className="icon-btn" aria-label="Back" onClick={() => { asking.current++; setStage(to); }}>
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
            <button key={isBlank(order) ? 'surprise' : 'send'} type="button" className="btn block" onClick={() => void send()}>
              {isBlank(order) ? 'Surprise me' : 'Send to the kitchen'}
            </button>
          </div>
        </>
      ) : stage === 'printing' ? (
        <Printing />
      ) : stage === 'ideas' ? (
        <Ideas tickets={tickets} sample={sample} onPick={(ticket) => void pick(ticket)} onAgain={() => void send(order, true)} onChange={() => setStage('order')} />
      ) : chosen ? (
        <Ordered
          ticket={chosen}
          recipe={recipe}
          pantry={pantry ?? []}
          sample={sample}
          order={order}
          saved={Boolean(savedId)}
          busy={busy}
          onTweak={(next) => void send(next)}
          onSave={() => void save()}
          onList={(names) => void list(names)}
        />
      ) : null}
    </Page>
  );
}
