import assert from "node:assert/strict";
import test from "node:test";
import {
  freshExchangeDemoDrinks,
  simulateExchangeCrash,
  simulateExchangeDemand,
  createExchangeShowState,
  DEMO_ORDER_SEQUENCE,
  DEMO_CRASH_DURATION_MS,
  DEMO_FEED_LIMIT,
  processExchangeDemoOrder,
  triggerExchangeDemoCrash,
  syncExchangeDemoClock,
  exchangeDemoSecondsRemaining,
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


test("public demo replays predefined orders in order and keeps bounded real-like price changes", () => {
  const original = createExchangeShowState();
  const firstOrder = DEMO_ORDER_SEQUENCE[0];
  const first = processExchangeDemoOrder(original, 1_000);
  const selected = first.drinks.find((d) => d.id === firstOrder.drinkId)!;
  assert.equal(first.orderCount, 1);
  assert.equal(first.nextOrderIndex, 1);
  assert.equal(first.feed[0].kind, "order");
  assert.ok(first.feed[0].label.includes(firstOrder.quantity + "×"));
  assert.ok(selected.priceCents > original.drinks.find((d) => d.id === firstOrder.drinkId)!.priceCents);
  assert.equal(original.orderCount, 0, "immutable initial state");
  let state = first;
  for (let i = 0; i < 1_000; i++) state = processExchangeDemoOrder(state, 1_001 + i * 4_500);
  assert.equal(state.orderCount, 1_001);
  assert.equal(state.nextOrderIndex, (1_001 % DEMO_ORDER_SEQUENCE.length));
  assert.ok(state.feed.length <= DEMO_FEED_LIMIT);
  for (const drink of state.drinks) {
    assert.ok(drink.priceCents >= Math.ceil(drink.baseCents * 0.7 / 5) * 5);
    assert.ok(drink.priceCents <= Math.floor(drink.baseCents * 1.45 / 5) * 5);
  }
});

test("manager-style crash immediately drops prices, freezes scripted orders and counts 60 seconds", () => {
  const before = processExchangeDemoOrder(createExchangeShowState(), 20_000);
  const crash = triggerExchangeDemoCrash(before, 25_000);
  assert.equal(crash.crashEndsAt, 25_000 + DEMO_CRASH_DURATION_MS);
  assert.equal(exchangeDemoSecondsRemaining(crash), 60);
  assert.equal(crash.crashes, 1);
  assert.equal(crash.feed[0].kind, "crash");
  assert.ok(crash.drinks.every((d, i) => d.priceCents <= before.drinks[i].priceCents));
  assert.strictEqual(processExchangeDemoOrder(crash, 30_000), crash, "orders must not occur during crash");
  assert.strictEqual(triggerExchangeDemoCrash(crash, 27_000), crash, "duplicate crash cannot restart timer");
  const almost = syncExchangeDemoClock(crash, 84_001);
  assert.equal(exchangeDemoSecondsRemaining(almost), 1);
  assert.equal(almost.crashEndsAt, 85_000);
  const reopened = syncExchangeDemoClock(almost, 85_000);
  assert.equal(reopened.crashEndsAt, null);
  assert.equal(reopened.feed[0].kind, "reopen");
  assert.equal(reopened.crashes, 1);
  const next = processExchangeDemoOrder(reopened, 85_100);
  assert.equal(next.orderCount, before.orderCount + 1, "queued demo sequence resumes");
  assert.equal(next.feed[0].kind, "order");
  assert.equal(exchangeDemoSecondsRemaining(next), 0);
  assert.equal(createExchangeShowState().orderCount, 0, "reset restarts scripted show");
});
