/**
 * Browser-only pricing demo for DrinkStock.
 * This is never authoritative for billing, orders, inventory or venue prices.
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
  { id: "draft", name: "Draft Beer", description: "500 ml · Lager", baseCents: 500, priceCents: 500, lastDeltaCents: 0 },
  { id: "mojito", name: "Mojito", description: "Fresh mint · Rum", baseCents: 900, priceCents: 900, lastDeltaCents: 0 },
  { id: "spritz", name: "Aperol Spritz", description: "Aperitivo · Bubbles", baseCents: 800, priceCents: 800, lastDeltaCents: 0 },
  { id: "cola", name: "Cola", description: "330 ml · Soft drink", baseCents: 350, priceCents: 350, lastDeltaCents: 0 },
  { id: "gin", name: "Gin & Tonic", description: "Gin · Tonic · Lime", baseCents: 850, priceCents: 850, lastDeltaCents: 0 },
  { id: "shot", name: "Party Shot", description: "House selection", baseCents: 400, priceCents: 400, lastDeltaCents: 0 }
];

export function freshExchangeDemoDrinks(): ExchangeDemoDrink[] {
  return EXCHANGE_DEMO_DRINKS.map((drink) => ({ ...drink }));
}

function boundedPrice(drink: ExchangeDemoDrink, candidate: number): number {
  const floor = Math.ceil((drink.baseCents * 0.7) / 5) * 5;
  const ceiling = Math.floor((drink.baseCents * 1.45) / 5) * 5;
  return Math.min(ceiling, Math.max(floor, Math.round(candidate / 5) * 5));
}

/** A simulated demand event lifts the selected drink 7% and eases others 1.5%. */
export function simulateExchangeDemand(
  drinks: readonly ExchangeDemoDrink[],
  selectedId: string
): ExchangeDemoDrink[] {
  if (!drinks.some((drink) => drink.id === selectedId)) {
    return drinks.map((drink) => ({ ...drink }));
  }
  return drinks.map((drink) => {
    const priceCents = boundedPrice(drink, drink.priceCents * (drink.id === selectedId ? 1.07 : 0.985));
    return { ...drink, priceCents, lastDeltaCents: priceCents - drink.priceCents };
  });
}

/** A fun, venue-independent demonstration of a market-wide price drop. */
export function simulateMarketCrash(drinks: readonly ExchangeDemoDrink[]): ExchangeDemoDrink[] {
  return drinks.map((drink) => {
    const priceCents = boundedPrice(drink, drink.priceCents * 0.87);
    return { ...drink, priceCents, lastDeltaCents: priceCents - drink.priceCents };
  });
}