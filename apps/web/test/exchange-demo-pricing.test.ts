import assert from "node:assert/strict";
import test from "node:test";
import {
  freshExchangeDemoDrinks,
  simulateExchangeDemand,
  simulateMarketCrash,
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
test("party market crash lowers every current price but never breaches the venue-like demo floor", () => {
  const before = freshExchangeDemoDrinks();
  const after = simulateMarketCrash(before);
  assert.equal(after.length, before.length);
  for (const [index, drink] of after.entries()) {
    assert.ok(drink.priceCents < before[index].priceCents);
    assert.ok(drink.priceCents >= Math.ceil(drink.baseCents * 0.7 / 5) * 5);
    assert.equal(drink.lastDeltaCents, drink.priceCents - before[index].priceCents);
  }
  assert.equal(before[0].priceCents, 500);
});
test("simulated crash floor holds after repeated crashes", () => {
  let state = freshExchangeDemoDrinks();
  for (let i = 0; i < 30; i++) state = simulateMarketCrash(state);
  for (const drink of state) {
    assert.ok(drink.priceCents >= Math.ceil(drink.baseCents * 0.7 / 5) * 5);
    assert.ok(drink.priceCents <= Math.floor(drink.baseCents * 1.45 / 5) * 5);
  }
});
