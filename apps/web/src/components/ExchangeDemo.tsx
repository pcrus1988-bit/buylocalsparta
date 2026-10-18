"use client";

import { useState } from "react";
import {
  freshExchangeDemoDrinks,
  simulateExchangeCrash,
  simulateExchangeDemand,
} from "../lib/exchange-demo-pricing";
import styles from "../app/hospitality/drinkStock/drinkStock.module.css";

const currency = new Intl.NumberFormat("el-GR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

const personalities: Record<string, { icon: string; label: string; code: string }> = {
  draft: { icon: "🍺", label: "THE CLASSIC", code: "BEER" },
  mojito: { icon: "🍹", label: "THE CROWD PLEASER", code: "MOJO" },
  spritz: { icon: "🍊", label: "SUNSET FAVOURITE", code: "SPRT" },
  cola: { icon: "🥤", label: "EVERYBODY KNOWS", code: "COLA" },
  gin: { icon: "🍸", label: "THE BLUE CHIP", code: "GIN" },
  espresso: { icon: "☕", label: "AFTER DARK", code: "ESPM" },
};

export function ExchangeDemo() {
  const [drinks, setDrinks] = useState(freshExchangeDemoDrinks);
  const [events, setEvents] = useState(0);
  const [crashes, setCrashes] = useState(0);
  const [lastAction, setLastAction] = useState("Select a drink to move the market.");

  function boost(id: string) {
    const selected = drinks.find((drink) => drink.id === id);
    if (!selected) return;
    setDrinks((previous) => simulateExchangeDemand(previous, id));
    setEvents((previous) => previous + 1);
    setLastAction(selected.name + " got a demand boost. Watch the other drinks move.");
  }

  function crash() {
    setDrinks((previous) => simulateExchangeCrash(previous));
    setCrashes((previous) => previous + 1);
    setEvents((previous) => previous + 1);
    setLastAction("MARKET CRASH! All simulated prices dropped within their demo limits.");
  }

  function reset() {
    setDrinks(freshExchangeDemoDrinks());
    setEvents(0);
    setCrashes(0);
    setLastAction("Market reset. Pick your first drink.");
  }

  const topMover = drinks.reduce((best, drink) =>
    drink.priceCents - drink.baseCents > best.priceCents - best.baseCents ? drink : best
  , drinks[0]);

  return (
    <section className={styles.exchange} id="exchange" aria-labelledby="exchange-heading">
      <div className={styles.intro}>
        <div>
          <div className={styles.kicker}><span aria-hidden="true" className={styles.glowDot} /> ENTER THE EXCHANGE · PLAYABLE DEMO</div>
          <h2 id="exchange-heading">DON&apos;T JUST DRINK.<br /><span>MOVE THE MARKET.</span></h2>
          <p>Πάτησε ένα ποτό και δες τη ζήτηση να ανεβάζει την τιμή του, ενώ οι υπόλοιπες αντιδρούν. Ή πάτησε CRASH για να πέσουν όλες. Εσύ κινείς το παιχνίδι.</p>
        </div>
        <div className={styles.demoWarning}><span aria-hidden="true">◎</span><strong>SIMULATION MODE</strong><small>No real orders · No payments · No live venue prices</small></div>
      </div>

      <div className={styles.terminal}>
        <div className={styles.terminalHead}>
          <div className={styles.marketIdentity}>
            <div className={styles.marketGlyph} aria-hidden="true">↗</div>
            <div><span className={styles.overline}>DRINKSTOCK EXCHANGE</span><strong>THE PARTY MARKET</strong></div>
          </div>
          <div className={styles.marketState}><span className={styles.liveDot} aria-hidden="true" /> DEMO MARKET OPEN</div>
        </div>

        <div className={styles.priceTape} aria-label="Simulated market ticker">
          <div className={styles.priceTapeInner}>
            {[...drinks, ...drinks].map((drink, index) => (
              <span className={styles.tapeItem} key={drink.id + "-" + index} aria-hidden={index >= drinks.length}>
                <b>{personalities[drink.id]?.code || drink.id.toUpperCase()}</b>
                <strong>{currency.format(drink.priceCents / 100)}</strong>
                <em className={drink.lastDeltaCents > 0 ? styles.positive : drink.lastDeltaCents < 0 ? styles.negative : styles.neutral}>{drink.lastDeltaCents > 0 ? "↗" : drink.lastDeltaCents < 0 ? "↘" : "→"}</em>
              </span>
            ))}
          </div>
        </div>

        <div className={styles.board}>
          <div className={styles.boardHead}>
            <div><span className={styles.overline}>YOUR MARKET / TONIGHT</span><h3>Pick your next move <span aria-hidden="true">✳</span></h3></div>
            <div className={styles.sessionNumber}>SESSION 001 <span>· DEMO</span></div>
          </div>
          <div className={styles.drinkGrid}>
            {drinks.map((drink) => {
              const movePercent = drink.lastDeltaCents && drink.priceCents - drink.lastDeltaCents > 0
                ? Math.abs(drink.lastDeltaCents / (drink.priceCents - drink.lastDeltaCents) * 100).toFixed(1)
                : "0.0";
              return (
                <article className={styles.drinkCard} key={drink.id}>
                  <div className={styles.drinkTop}>
                    <span className={styles.drinkEmoji} aria-hidden="true">{personalities[drink.id]?.icon || "🥂"}</span>
                    <span className={[styles.movement, drink.lastDeltaCents > 0 ? styles.rising : drink.lastDeltaCents < 0 ? styles.falling : styles.unchanged].join(" ")}>
                      {drink.lastDeltaCents > 0 ? "↗ +" : drink.lastDeltaCents < 0 ? "↘ −" : "→ "}{movePercent}%
                    </span>
                  </div>
                  <span className={styles.personality}>{personalities[drink.id]?.label}</span>
                  <h4>{drink.name}</h4>
                  <div className={styles.drinkDescription}>{drink.description}</div>
                  <div className={styles.priceRow}><strong>{currency.format(drink.priceCents / 100)}</strong><small>DEMO PRICE</small></div>
                  <button className={styles.boostButton} type="button" onClick={() => boost(drink.id)} aria-label={"Προσομοίωση αύξησης ζήτησης: " + drink.name}>
                    BOOST DEMAND <span aria-hidden="true">↗</span>
                  </button>
                </article>
              );
            })}
          </div>
        </div>

        <div className={styles.controlDeck}>
          <div className={styles.marketReadout}>
            <span className={styles.overline}>MARKET ACTIVITY</span>
            <div className={styles.readoutStats}>
              <div><strong>{String(events).padStart(2, "0")}</strong><small>DEMO MOVES</small></div>
              <div><strong>{String(crashes).padStart(2, "0")}</strong><small>MARKET CRASHES</small></div>
              <div><strong>{topMover ? (personalities[topMover.id]?.code || topMover.id) : "—"}</strong><small>TOP MOVER</small></div>
            </div>
          </div>
          <div className={styles.controlButtons}>
            <button className={styles.crashButton} type="button" onClick={crash}><span aria-hidden="true">⚡</span> CRASH THE MARKET</button>
            <button className={styles.resetButton} type="button" onClick={reset}><span aria-hidden="true">↺</span> RESET</button>
          </div>
        </div>

        <div className={styles.statusBar} role="status" aria-live="polite">
          <span className={styles.statusLight} aria-hidden="true" />
          <p>{lastAction}</p>
          <strong>PLAY MONEY ONLY / 100% DEMO</strong>
        </div>
      </div>
      <p className={styles.disclaimer}>Οι τιμές αλλάζουν μόνο στη δική σου τοπική προσομοίωση. Δεν πρόκειται για πραγματική αγορά, κατάλογο καταστήματος, απόθεμα, διαθεσιμότητα ή δυνατότητα συναλλαγής. Η παραγωγική τιμολόγηση θα έχει ξεχωριστούς κανόνες, ελέγχους και εξουσιοδότηση συνεργάτη.</p>
    </section>
  );
}
