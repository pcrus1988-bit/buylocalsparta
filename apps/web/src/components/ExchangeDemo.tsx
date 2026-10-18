"use client";

import { useEffect, useState } from "react";
import {
  createExchangeShowState,
  DEMO_ORDER_INTERVAL_MS,
  DEMO_CRASH_ORDER_INTERVAL_MS,
  DEMO_ORDER_SEQUENCE,
  exchangeDemoSecondsRemaining,
  processExchangeDemoOrder,
  syncExchangeDemoClock,
  triggerExchangeDemoCrash,
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

/**
 * Only called inside a direct user click, so browser audio activation rules
 * are respected. Short, moderate-level alarm; no autoplay or audio file.
 */
function playCrashAlarm() {
  if (typeof window === "undefined" || !window.AudioContext) return;
  try {
    const context = new window.AudioContext();
    void context.resume().catch(() => undefined);
    const startAt = context.currentTime + 0.03;
    for (const offset of [0, 0.36, 0.72]) {
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      const start = startAt + offset;
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(740, start);
      oscillator.frequency.linearRampToValueAtTime(510, start + 0.25);
      volume.gain.setValueAtTime(0.001, start);
      volume.gain.linearRampToValueAtTime(0.05, start + 0.035);
      volume.gain.exponentialRampToValueAtTime(0.001, start + 0.27);
      oscillator.connect(volume);
      volume.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.28);
    }
    window.setTimeout(() => { void context.close().catch(() => undefined); }, 1300);
  } catch {
    // Audio is optional: the visual alert and timer remain fully functional.
  }
}

export function ExchangeDemo() {
  const [market, setMarket] = useState(createExchangeShowState);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const crashing = market.crashEndsAt !== null;

  // Orders always continue: the 60s crash increases the scripted order pace.
  // The switch back to normal speed is automatic when the crash deadline ends.
  useEffect(() => {
    const ticker = window.setInterval(() => {
      setMarket((previous) => processExchangeDemoOrder(previous, Date.now()));
    }, crashing ? DEMO_CRASH_ORDER_INTERVAL_MS : DEMO_ORDER_INTERVAL_MS);
    return () => window.clearInterval(ticker);
  }, [crashing]);

  // Wall-clock deadline: background tabs cannot extend the 60s crash rush.
  useEffect(() => {
    const clock = window.setInterval(() => {
      setMarket((previous) => syncExchangeDemoClock(previous, Date.now()));
    }, 500);
    return () => window.clearInterval(clock);
  }, []);

  const secondsRemaining = exchangeDemoSecondsRemaining(market);
  const timerText = String(Math.floor(secondsRemaining / 60)).padStart(2, "0")
    + ":" + String(secondsRemaining % 60).padStart(2, "0");
  const topMover = market.drinks.reduce((best, drink) =>
    drink.priceCents - drink.baseCents > best.priceCents - best.baseCents ? drink : best
  , market.drinks[0]);
  const nextOrder = DEMO_ORDER_SEQUENCE[market.nextOrderIndex];
  const nextDrink = market.drinks.find((drink) => drink.id === nextOrder.drinkId);

  function crash() {
    if (crashing) return;
    if (soundEnabled) playCrashAlarm();
    setMarket((previous) => triggerExchangeDemoCrash(previous, Date.now()));
  }

  function reset() {
    setMarket(createExchangeShowState());
  }

  return (
    <section className={styles.exchange} id="exchange" aria-labelledby="exchange-heading">
      <div className={styles.intro}>
        <div>
          <div className={styles.kicker}><span aria-hidden="true" className={styles.glowDot} /> ENTER THE EXCHANGE · AUTOMATED LIVE-STYLE DEMO</div>
          <h2 id="exchange-heading">THE ORDERS ROLL IN.<br /><span>THE PRICES MOVE.</span></h2>
          <p>Παρακολούθησε τη ροή προσομοιωμένων παραγγελιών: κάθε γύρος αλλάζει αυτόματα τις τιμές. Δοκίμασε το κουμπί του manager για ένα εντυπωσιακό market crash με συναγερμό και αντίστροφη μέτρηση 60 δευτερολέπτων.</p>
        </div>
        <div className={styles.demoWarning}><span aria-hidden="true">◎</span><strong>SIMULATION MODE</strong><small>Predefined orders · No real customers, POS or payments</small></div>
      </div>

      <div className={[styles.terminal, crashing ? styles.crashing : ""].join(" ")}>
        {crashing && (
          <div className={styles.emergencyLights} aria-hidden="true">
            <span className={[styles.emergencyLight, styles.lightTopLeft].join(" ")} />
            <span className={[styles.emergencyLight, styles.lightTopRight].join(" ")} />
            <span className={[styles.emergencyLight, styles.lightBottomLeft].join(" ")} />
            <span className={[styles.emergencyLight, styles.lightBottomRight].join(" ")} />
          </div>
        )}
        <div className={styles.terminalHead}>
          <div className={styles.marketIdentity}>
            <div className={styles.marketGlyph} aria-hidden="true">↗</div>
            <div><span className={styles.overline}>DRINKSTOCK EXCHANGE</span><strong>THE PARTY MARKET</strong></div>
          </div>
          <div className={[styles.marketState, crashing ? styles.marketStateCrash : ""].join(" ")}>
            <span className={styles.liveDot} aria-hidden="true" />
            {crashing ? "CRASH RUSH · TRADING LIVE" : "SIMULATED MARKET OPEN"}
          </div>
        </div>

        {crashing && (
          <div className={styles.crashStrip} role="timer" aria-label={"Market crash ends in " + secondsRemaining + " seconds"}>
            <span className={styles.crashEyebrow}>⚠ MANAGER INITIATED MARKET CRASH</span>
            <div className={styles.crashCounter}>{timerText}</div>
            <div className={styles.crashSubtitle}>BUY THE DIP! · ORDERS STILL FLOWING · CRASH ENDS IN</div>
            <div className={styles.crashOrderTally}><span>⚡ {market.crashOrderCount} CRASH ORDERS</span><span>TRADES EVERY 1.7s</span></div>
            {market.crashOrderCount > 0 && market.feed[0]?.kind === "order" && (
              <div className={styles.crashOrderSplash} key={market.orderCount} aria-hidden="true">
                <span>⚡ NEW BUY</span>
                <strong>{market.feed[0].label}</strong>
                <small>PRICE MOVED ↗</small>
              </div>
            )}
            <div className={styles.crashProgress} aria-hidden="true"><span style={{ width: (secondsRemaining / 60 * 100) + "%" }} /></div>
          </div>
        )}

        <div className={styles.priceTape} aria-label="Simulated market prices">
          <div className={styles.priceTapeInner}>
            {[...market.drinks, ...market.drinks].map((drink, index) => (
              <span className={styles.tapeItem} key={drink.id + "-" + index} aria-hidden={index >= market.drinks.length}>
                <b>{personalities[drink.id]?.code || drink.id.toUpperCase()}</b>
                <strong>{currency.format(drink.priceCents / 100)}</strong>
                <em className={drink.lastDeltaCents > 0 ? styles.positive : drink.lastDeltaCents < 0 ? styles.negative : styles.neutral}>
                  {drink.lastDeltaCents > 0 ? "↗" : drink.lastDeltaCents < 0 ? "↘" : "→"}
                </em>
              </span>
            ))}
          </div>
        </div>

        <div className={styles.board}>
          <div className={styles.boardHead}>
            <div><span className={styles.overline}>TONIGHT'S SIMULATED MARKET</span><h3>Drinks are trading <span aria-hidden="true">✳</span></h3></div>
            <div className={styles.sessionNumber}>AUTO-PLAY <span>· DEMO SESSION</span></div>
          </div>

          <div className={styles.boardContent}>
            <div className={styles.drinkGrid}>
              {market.drinks.map((drink) => {
                const previousPrice = drink.priceCents - drink.lastDeltaCents;
                const movePercent = drink.lastDeltaCents !== 0 && previousPrice > 0
                  ? Math.abs(drink.lastDeltaCents / previousPrice * 100).toFixed(1) : "0.0";
                return (
                  <article className={[styles.drinkCard, market.lastOrderDrinkId === drink.id ? styles.recentlyOrdered : ""].join(" ")} key={drink.id}>
                    <div className={styles.drinkTop}>
                      <span className={styles.drinkEmoji} aria-hidden="true">{personalities[drink.id]?.icon || "🥂"}</span>
                      <span className={[styles.movement, drink.lastDeltaCents > 0 ? styles.rising : drink.lastDeltaCents < 0 ? styles.falling : styles.unchanged].join(" ")}>
                        {drink.lastDeltaCents > 0 ? "↗ +" : drink.lastDeltaCents < 0 ? "↘ −" : "→ "}{movePercent}%
                      </span>
                    </div>
                    <span className={styles.personality}>{personalities[drink.id]?.label}</span>
                    <h4>{drink.name}</h4>
                    <div className={styles.drinkDescription}>{drink.description}</div>
                    <div className={styles.priceRow}><strong>{currency.format(drink.priceCents / 100)}</strong><small>SIMULATED PRICE</small></div>
                    <div className={styles.autoTradeTag}>
                      <span aria-hidden="true">{market.lastOrderDrinkId === drink.id ? "●" : "↗"}</span>
                      {market.lastOrderDrinkId === drink.id ? (crashing ? "⚡ CRASH BUY" : "LATEST ORDER") : "AUTOMATED TRADING"}
                    </div>
                    {market.lastOrderDrinkId === drink.id && (
                      <span className={crashing ? styles.crashCardBurst : styles.orderCardBurst} key={market.orderCount} aria-hidden="true">+1 TRADE ↗</span>
                    )}
                  </article>
                );
              })}
            </div>

            <aside className={styles.orderFeed} aria-label="Simulated live order feed">
              <div className={styles.feedHeader}>
                <span className={styles.feedBlink} aria-hidden="true" />
                <div><strong>LIVE ORDER FLOW</strong><small>PREDEFINED DEMO SEQUENCE</small></div>
                <span className={styles.feedCounter}>{String(market.orderCount).padStart(3, "0")}</span>
              </div>
              <div className={styles.feedNext}>
                <span>UP NEXT {crashing ? "· BUY THE DIP" : "· AUTO-QUEUE"}</span>
                <strong>{nextOrder.quantity}× {nextDrink?.name || nextOrder.drinkId}</strong>
                <small>{nextOrder.table} · {crashing ? "EVERY 1.7 SECONDS" : "EVERY 4.5 SECONDS"}</small>
              </div>
              <div className={styles.feedEntries} aria-live="off">
                {market.feed.length === 0 && (
                  <p className={styles.feedEmpty}>Order stream connecting…<br />The first simulated round appears automatically.</p>
                )}
                {market.feed.map((event) => (
                  <div className={[styles.feedEntry, event.kind === "crash" ? styles.feedCrash : event.kind === "recovery" ? styles.feedReopen : event.duringCrash ? styles.feedCrashOrder : ""].join(" ")} key={event.id}>
                    <div className={styles.feedEntryTop}>
                      <span>{event.kind === "order" ? event.duringCrash ? "⚡ CRASH BUY" : "● ORDER FILLED" : event.kind === "crash" ? "⚠ CRASH START" : "✓ CRASH ENDED"}</span>
                      <time>{event.time}</time>
                    </div>
                    <strong>{event.label}</strong>
                    <div className={styles.feedEntryFoot}>
                      <small>{event.detail}</small>
                      {event.kind === "order" && (
                        <em className={event.deltaCents >= 0 ? styles.feedUp : styles.feedDown}>
                          {event.deltaCents > 0 ? "+" : ""}{currency.format(event.deltaCents / 100)}
                        </em>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className={styles.feedFootnote}>ILLUSTRATIVE ONLY · NO REAL TRADES</div>
            </aside>
          </div>
        </div>

        <div className={styles.controlDeck}>
          <div className={styles.marketReadout}>
            <span className={styles.overline}>MARKET ACTIVITY</span>
            <div className={styles.readoutStats}>
              <div><strong>{String(market.orderCount).padStart(2, "0")}</strong><small>SCRIPTED ORDERS</small></div>
              <div><strong>{String(market.crashes).padStart(2, "0")}</strong><small>MARKET CRASHES</small></div>
              <div><strong>{topMover ? (personalities[topMover.id]?.code || topMover.id) : "—"}</strong><small>TOP MOVER</small></div>
            </div>
          </div>
          <div className={styles.controlButtons}>
            <button className={styles.soundButton} type="button" onClick={() => setSoundEnabled((enabled) => !enabled)} aria-pressed={soundEnabled} title="Toggle crash alarm sound">
              {soundEnabled ? "🔊 ALARM ON" : "🔇 ALARM OFF"}
            </button>
            <button className={styles.crashButton} type="button" onClick={crash} disabled={crashing} aria-label="Simulate manager-initiated 60-second market crash">
              <span aria-hidden="true">⚡</span> {crashing ? "MARKET CRASH ACTIVE" : "SIMULATE MANAGER CRASH"}
            </button>
            <button className={styles.resetButton} type="button" onClick={reset}><span aria-hidden="true">↺</span> RESET DEMO</button>
          </div>
        </div>

        <div className={styles.statusBar} role="status" aria-live="polite">
          <span className={styles.statusLight} aria-hidden="true" />
          <p>{market.status}</p>
          <strong>PRE-SET DEMO / NO REAL ORDERS</strong>
        </div>
      </div>
      <p className={styles.disclaimer}>
        Οι εικονικές παραγγελίες συνεχίζονται και επιταχύνονται στη διάρκεια του 60-δευτερολέπτου crash. Όλες οι «παραγγελίες» και οι τιμές είναι προσχεδιασμένη, τοπική προσομοίωση. Το δημόσιο κουμπί crash προσομοιώνει ενέργεια manager και δεν ελέγχει πραγματικό κατάστημα. Ο ήχος παίζει μόνο μετά από κλικ και μπορεί να απενεργοποιηθεί. Δεν γίνονται πραγματικές παραγγελίες, πληρωμές ή συνδέσεις POS.
      </p>
    </section>
  );
}
