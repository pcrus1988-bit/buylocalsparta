import {drinkPriceBand,priceRehearsalDemand} from "./drinkstock-market-pricing.ts";

/**
 * Browser-only pricing demo for the KONTA MOY EXCHANGE concept.
 * Not an authoritative price engine and never suitable for actual transactions.
 */
export type ExchangeDemoDrink = {
  id: string;
  name: string;
  description: string;
  baseCents: number;
  priceCents: number;
  lastDeltaCents: number;
};

export const EXCHANGE_DEMO_DRINKS: readonly ExchangeDemoDrink[] = [
  { id: "draft", name: "Draft Beer", description: "500 ml", baseCents: 500, priceCents: 500, lastDeltaCents: 0 },
  { id: "mojito", name: "Mojito", description: "Classic cocktail", baseCents: 900, priceCents: 900, lastDeltaCents: 0 },
  { id: "spritz", name: "Spritz", description: "Aperitivo", baseCents: 800, priceCents: 800, lastDeltaCents: 0 },
  { id: "cola", name: "Cola", description: "330 ml", baseCents: 350, priceCents: 350, lastDeltaCents: 0 },
  { id: "gin", name: "Gin & Tonic", description: "Highball", baseCents: 850, priceCents: 850, lastDeltaCents: 0 },
  { id: "espresso", name: "Espresso Martini", description: "Signature cocktail", baseCents: 950, priceCents: 950, lastDeltaCents: 0 },
];

export function freshExchangeDemoDrinks(): ExchangeDemoDrink[] {
  return EXCHANGE_DEMO_DRINKS.map((drink) => ({ ...drink }));
}

/**
 * Public auto-play shares the same cent-precision demand model as the
 * server-persisted venue rehearsal; it NEVER writes to operational prices.
 * A scripted order's quantity affects the price as a single volume-weighted
 * execution, not N arbitrary +7% movements.
 */
export function simulateExchangeDemand(
  drinks: readonly ExchangeDemoDrink[],
  selectedId: string,
  units = 1
): ExchangeDemoDrink[] {
  if (!drinks.some((drink) => drink.id === selectedId)) {
    return drinks.map((drink) => ({ ...drink }));
  }
  const movements = priceRehearsalDemand(drinks, selectedId, undefined, units);
  return drinks.map((drink, i) => ({
    ...drink,
    priceCents: movements[i]!.afterCents,
    lastDeltaCents: movements[i]!.deltaCents,
  }));
}

/** 60-second theatre-only crash shock. Trading never stops during a crash. */
export function simulateExchangeCrash(drinks: readonly ExchangeDemoDrink[]): ExchangeDemoDrink[] {
  return drinks.map((drink) => {
    const floor = drinkPriceBand(drink.baseCents).minCents;
    const priceCents = Math.max(floor, Math.round(drink.priceCents * 0.82));
    return { ...drink, priceCents, lastDeltaCents: priceCents - drink.priceCents };
  });
}

/**
 * Public, browser-only DrinkStock theatre. The sequence is repeatable and
 * represents simulated orders, not customer demand or actual POS sales.
 */
export const DEMO_ORDER_INTERVAL_MS = 4500;
/** Increased simulated order frequency while the 60-second crash offer is active. */
export const DEMO_CRASH_ORDER_INTERVAL_MS = 1700;
export const DEMO_CRASH_DURATION_MS = 60_000;
export const DEMO_FEED_LIMIT = 9;

export type ScriptedDemoOrder = {
  drinkId: string;
  quantity: number;
  table: string;
};

export const DEMO_ORDER_SEQUENCE: readonly ScriptedDemoOrder[] = [
  { drinkId: "gin", quantity: 2, table: "TABLE 04" },
  { drinkId: "draft", quantity: 3, table: "BAR 01" },
  { drinkId: "mojito", quantity: 2, table: "TABLE 08" },
  { drinkId: "spritz", quantity: 1, table: "ROOFTOP" },
  { drinkId: "draft", quantity: 2, table: "BAR 03" },
  { drinkId: "espresso", quantity: 2, table: "TABLE 12" },
  { drinkId: "gin", quantity: 1, table: "TABLE 06" },
  { drinkId: "cola", quantity: 3, table: "TABLE 02" },
  { drinkId: "mojito", quantity: 3, table: "BAR 02" },
  { drinkId: "spritz", quantity: 2, table: "TABLE 11" },
  { drinkId: "espresso", quantity: 1, table: "LOUNGE" },
  { drinkId: "cola", quantity: 2, table: "TABLE 05" },
];

export type DemoMarketFeedEvent = {
  id: number;
  kind: "order" | "crash" | "recovery";
  duringCrash?: boolean;
  label: string;
  detail: string;
  time: string;
  deltaCents: number;
};

export type ExchangeShowState = {
  drinks: ExchangeDemoDrink[];
  nextOrderIndex: number;
  orderCount: number;
  crashOrderCount: number;
  totalDemoEvents: number;
  crashes: number;
  crashEndsAt: number | null;
  clockMs: number;
  lastOrderDrinkId: string | null;
  feed: DemoMarketFeedEvent[];
  status: string;
};

export function createExchangeShowState(): ExchangeShowState {
  return {
    drinks: freshExchangeDemoDrinks(),
    nextOrderIndex: 0,
    orderCount: 0,
    crashOrderCount: 0,
    totalDemoEvents: 0,
    crashes: 0,
    crashEndsAt: null,
    clockMs: 0,
    lastOrderDrinkId: null,
    feed: [],
    status: "The scripted market is open. First simulated order is coming in.",
  };
}

function demoTime(nowMs: number): string {
  return new Date(nowMs).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function appendDemoFeed(
  previous: readonly DemoMarketFeedEvent[],
  event: DemoMarketFeedEvent,
): DemoMarketFeedEvent[] {
  return [event, ...previous].slice(0, DEMO_FEED_LIMIT);
}

/** Advance one scripted order during both normal trading and the active crash. */
export function processExchangeDemoOrder(
  state: ExchangeShowState,
  nowMs: number,
): ExchangeShowState {
  // Expiry never discards an order if a background tab resumes late.
  const current = state.crashEndsAt !== null && nowMs >= state.crashEndsAt
    ? syncExchangeDemoClock(state, nowMs)
    : state;
  const duringCrash = current.crashEndsAt !== null;
  const order = DEMO_ORDER_SEQUENCE[current.nextOrderIndex % DEMO_ORDER_SEQUENCE.length];
  const selected = current.drinks.find((drink) => drink.id === order.drinkId);
  if (!selected) return current;

  // One volume-weighted demand event, with 1-cent quotes and fixed owner band.
  const nextDrinks = simulateExchangeDemand(current.drinks, order.drinkId, order.quantity);
  const newPrice = nextDrinks.find((drink) => drink.id === order.drinkId)!.priceCents;
  const deltaCents = newPrice - selected.priceCents;
  const eventId = current.totalDemoEvents + 1;
  return {
    ...current,
    drinks: nextDrinks,
    nextOrderIndex: (current.nextOrderIndex + 1) % DEMO_ORDER_SEQUENCE.length,
    orderCount: current.orderCount + 1,
    crashOrderCount: current.crashOrderCount + (duringCrash ? 1 : 0),
    totalDemoEvents: eventId,
    clockMs: nowMs,
    lastOrderDrinkId: order.drinkId,
    feed: appendDemoFeed(current.feed, {
      id: eventId,
      kind: "order",
      duringCrash,
      label: order.quantity + "× " + selected.name,
      detail: order.table + (duringCrash ? " · CRASH BUY" : " · SCRIPTED ORDER"),
      time: demoTime(nowMs),
      deltaCents,
    }),
    status: (duringCrash ? "CRASH RUSH! " : "") + order.table + " ordered " + order.quantity + "× " + selected.name + ". Demo prices adjusted.",
  };
}

/** Public demo impersonates a manager action, without touching venue APIs. */
export function triggerExchangeDemoCrash(
  state: ExchangeShowState,
  nowMs: number,
): ExchangeShowState {
  if (state.crashEndsAt !== null) return state;
  const eventId = state.totalDemoEvents + 1;
  return {
    ...state,
    drinks: simulateExchangeCrash(state.drinks),
    crashes: state.crashes + 1,
    crashOrderCount: 0,
    totalDemoEvents: eventId,
    crashEndsAt: nowMs + DEMO_CRASH_DURATION_MS,
    clockMs: nowMs,
    lastOrderDrinkId: null,
    feed: appendDemoFeed(state.feed, {
      id: eventId,
      kind: "crash",
      label: "⚠ MARKET CRASH",
      detail: "SIMULATED MANAGER ACTION · 60s",
      time: demoTime(nowMs),
      deltaCents: 0,
    }),
    status: "MARKET CRASH! Prices dropped and scripted orders are accelerating for 60 seconds.",
  };
}

/** Deadline-based clock survives throttled browser timers without prolonging the crash. */
export function syncExchangeDemoClock(state: ExchangeShowState, nowMs: number): ExchangeShowState {
  if (state.crashEndsAt === null) return state;
  if (nowMs < state.crashEndsAt) return { ...state, clockMs: nowMs };
  const eventId = state.totalDemoEvents + 1;
  return {
    ...state,
    crashEndsAt: null,
    clockMs: nowMs,
    totalDemoEvents: eventId,
    feed: appendDemoFeed(state.feed, {
      id: eventId,
      kind: "recovery",
      label: "CRASH EVENT FINISHED",
      detail: "NORMAL TRADING CONTINUES",
      time: demoTime(nowMs),
      deltaCents: 0,
    }),
    status: "Crash event ended. Simulated orders continue at their normal pace.",
  };
}

export function exchangeDemoSecondsRemaining(state: ExchangeShowState): number {
  if (state.crashEndsAt === null) return 0;
  return Math.ceil(Math.max(0, state.crashEndsAt - state.clockMs) / 1000);
}
