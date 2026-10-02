import { api } from '../../lib/api';
import type { InventoryItem } from '../../lib/types';
import type { Order } from './options';

/*
 * Talking to the kitchen: the server sends the order and what is in the
 * pantry to the AI model and checks what comes back against the person's own
 * rules. Ideas are short; the full recipe is only written for the one picked.
 */

export interface KitchenIdea {
  id: string;
  name: string;
  cuisine: string;
  feels: string[];
  minutes: number;
  kcal: number;
  serves: number;
  why: string;
  /** inventory item ids it uses */
  uses: string[];
  buy: string[];
}

export interface KitchenRecipe {
  ingredients: { name: string; amount: string; inventoryItemId?: string }[];
  steps: string[];
  kcal: number | null;
}

/** An idea as a ticket shows it: the food it uses, as drawn, and why it suits. */
export interface Ticket extends KitchenIdea {
  have: InventoryItem[];
  note: string;
  urgent: boolean;
}

/** a model takes a few seconds, and a busy one is retried on the server */
const KITCHEN_TIMEOUT_MS = 60_000;

function when(days: number): string {
  if (days === 0) return 'goes off today';
  if (days === 1) return 'goes off tomorrow';
  return `goes off in ${days} days`;
}

const sentence = (text: string) => {
  const t = text.trim();
  if (!t) return '';
  const capital = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
};

/**
 * The reason to cook it, in the app's own words when a date is near: the app
 * knows when food goes off, so it says so rather than trusting the model's
 * phrasing; otherwise the kitchen's own note.
 */
export function place(idea: KitchenIdea, pantry: InventoryItem[]): Ticket {
  const have = idea.uses.map((id) => pantry.find((i) => i.id === id)).filter((i): i is InventoryItem => Boolean(i));
  const soonest = [...have].filter((i) => i.daysUntilExpiration !== null && i.daysUntilExpiration >= 0).sort((a, b) => a.daysUntilExpiration! - b.daysUntilExpiration!)[0];
  const urgent = Boolean(soonest && soonest.daysUntilExpiration! <= 2);
  const note = urgent ? `Uses the ${soonest!.food.name.toLowerCase()}, which ${when(soonest!.daysUntilExpiration!)}.` : sentence(idea.why);
  return { ...idea, have, note, urgent };
}

type Sendable = Order & { caloriesLeft: number | null; avoid?: string[] };

export const askIdeas = (order: Sendable) =>
  api.post<{ ideas: KitchenIdea[]; sample: boolean }>('/api/kitchen/ideas', order, { timeoutMs: KITCHEN_TIMEOUT_MS });

export const askRecipe = (order: Sendable, idea: KitchenIdea) =>
  api.post<{ recipe: KitchenRecipe }>(
    '/api/kitchen/recipe',
    { order, idea: { name: idea.name, cuisine: idea.cuisine, uses: idea.uses, buy: idea.buy } },
    { timeoutMs: KITCHEN_TIMEOUT_MS },
  );

export const saveRecipe = (ticket: Ticket, recipe: KitchenRecipe) =>
  api.post<{ recipe: { id: string; name: string } }>('/api/kitchen/save', {
    name: ticket.name,
    cuisine: ticket.cuisine,
    why: ticket.note,
    minutes: ticket.minutes,
    serves: ticket.serves,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
  });

/** Which of a recipe's ingredients are the ones to buy: named on the ticket's shopping line. */
export function isToBuy(name: string, buy: string[]): boolean {
  const n = name.toLowerCase();
  return buy.some((b) => {
    const w = b.toLowerCase();
    return n.includes(w) || w.includes(n);
  });
}
