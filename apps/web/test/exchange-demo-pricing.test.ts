import assert from "node:assert/strict";
import test from "node:test";
import {
  freshExchangeDemoDrinks,
  simulateExchangeCrash,
  simulateExchangeDemand,
} from "../src/lib/exchange-demo-pricing.ts";

test("simulated demand raises the selected item's price and lowers the other items", () => {
  const before = freshExchangeDemoDrinks();
  const after = simulateExchangeDemand(before, "draft");
  assert.ok(after.find((drink) => drink.id === "draft")!.priceCents > before[0].priceCents);
  assert.ok(after.find((drink) => drink.id === "cola")!.priceCents < before[3].priceCents);
  assert.equal(before[0].priceCents, 500, "original collection must not mutate");
});

test("simulated demand is bounded between 70% and 145% of base price", () => {
  let state = freshExchangeDemoDrinks();
  for (let i = 0; i < 100; i++) {
    state = simulateExchangeDemand(state, "mojito");
  }
  for (const drink of state) {
    assert.ok(drink.priceCents >= Math.ceil((drink.baseCents * 0.7) / 5) * 5);
    assert.ok(drink.priceCents <= Math.floor((drink.baseCents * 1.45) / 5) * 5);
  }
});

test("unknown demand event does not alter state", () => {
  const original = freshExchangeDemoDrinks();
  assert.deepEqual(simulateExchangeDemand(original, "unknown"), original);
});
test("market crash lowers all simulated prices but never below the floor", () => {
  const initial = freshExchangeDemoDrinks();
  let state = simulateExchangeCrash(initial);
  assert.ok(state.every((drink, index) => drink.priceCents < initial[index].priceCents));
  for (let i = 0; i < 100; i++) state = simulateExchangeCrash(state);
  assert.ok(state.every((drink) => drink.priceCents >= Math.ceil(drink.baseCents * 0.7 / 5) * 5));
  assert.deepEqual(freshExchangeDemoDrinks(), initial, "simulation must not mutate initial data");
});
