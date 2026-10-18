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
];

export function freshExchangeDemoDrinks(): ExchangeDemoDrink[] {
  return EXCHANGE_DEMO_DRINKS.map((drink) => ({ ...drink }));
}

/**
 * Simulate a demand event: the chosen item rises 7%, others ease 1.5%.
 * Round to five cents and enforce a 70%-145% band around the starting price.
 */
export function simulateExchangeDemand(
  drinks: readonly ExchangeDemoDrink[],
  selectedId: string
): ExchangeDemoDrink[] {
  if (!drinks.some((drink) => drink.id === selectedId)) {
    return drinks.map((drink) => ({ ...drink }));
  }
  return drinks.map((drink) => {
    const multiplier = drink.id === selectedId ? 1.07 : 0.985;
    const candidate = Math.round((drink.priceCents * multiplier) / 5) * 5;
    const floor = Math.ceil((drink.baseCents * 0.7) / 5) * 5;
    const ceiling = Math.floor((drink.baseCents * 1.45) / 5) * 5;
    const priceCents = Math.min(ceiling, Math.max(floor, candidate));
    return { ...drink, priceCents, lastDeltaCents: priceCents - drink.priceCents };
  });
}