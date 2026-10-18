"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { EXCHANGE_DEMO_DRINKS, freshExchangeDemoDrinks, simulateExchangeDemand, simulateMarketCrash, type ExchangeDemoDrink } from "../lib/exchange-demo-pricing";
import styles from "../app/hospitality/drinkStock/drinkStock.module.css";

const euros = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const identities: Record<string, { icon: string; ticker: string; category: string; color: string }> = {
  draft: { icon: "🍺", ticker: "BEER", category: "Beer", color: "#f9ba5b" },
  mojito: { icon: "🍃", ticker: "MOJI", category: "Cocktails", color: "#a5ff48" },
  spritz: { icon: "🍹", ticker: "SPRT", category: "Cocktails", color: "#ff9866" },
  cola: { icon: "🥤", ticker: "COLA", category: "Soft drinks", color: "#f2baff" },
  gin: { icon: "🍸", ticker: "GNTC", category: "Cocktails", color: "#62e7ff" },
  shot: { icon: "🥃", ticker: "SHOT", category: "Shots", color: "#ff7cbd" }
};
const categories = ["All drinks", "Cocktails", "Beer", "Soft drinks", "Shots"] as const;
type Category = (typeof categories)[number];

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const points = values.length === 1 ? [values[0], values[0]] : values;
  const minimum = Math.min(...points) - 12;
  const maximum = Math.max(...points) + 12;
  const range = Math.max(1, maximum - minimum);
  const coordinates = points.map((value, index) =>
    `${(index / Math.max(1, points.length - 1)) * 140},${42 - ((value - minimum) / range) * 35}`
  ).join(" ");
  return <svg className={styles.sparkline} viewBox="0 0 140 48" preserveAspectRatio="none" aria-hidden="true">
    <polyline points={coordinates} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
  </svg>;
}

function movementLabel(drink: ExchangeDemoDrink): string {
  const delta = drink.priceCents - drink.baseCents;
  return `${delta > 0 ? "+" : ""}${Math.round((delta / drink.baseCents) * 100)}%`;
}

export function ExchangeDemo() {
  const [snapshots, setSnapshots] = useState<ExchangeDemoDrink[][]>(() => [freshExchangeDemoDrinks()]);
  const [activeCategory, setActiveCategory] = useState<Category>("All drinks");
  const [lastEvent, setLastEvent] = useState("The opening bell just rang. Pick a drink and move the market!");
  const [crashes, setCrashes] = useState(0);
  const [moveCount, setMoveCount] = useState(0);
  const [autoPulse, setAutoPulse] = useState(false);
  const [screenMode, setScreenMode] = useState(false);
  const drinks = snapshots[snapshots.length - 1];
  const moves = moveCount;
  const visibleDrinks = drinks.filter(drink => activeCategory === "All drinks" || identities[drink.id]?.category === activeCategory);
  const sorted = [...drinks].sort((a, b) => (b.priceCents - b.baseCents) / b.baseCents - (a.priceCents - a.baseCents) / a.baseCents);

  function moveMarket(id: string) {
    const selected = EXCHANGE_DEMO_DRINKS.find(drink => drink.id === id);
    if (!selected) return;
    setSnapshots(previous => [...previous.slice(-24), simulateExchangeDemand(previous[previous.length - 1], id)]);
    setMoveCount(previous => previous + 1);
    setLastEvent(`${selected.name} demand is heating up! Other drinks just got a little cheaper.`);
  }

  function crashMarket() {
    setSnapshots(previous => [...previous.slice(-24), simulateMarketCrash(previous[previous.length - 1])]);
    setCrashes(previous => previous + 1);
    setMoveCount(previous => previous + 1);
    setLastEvent("MARKET CRASH! Prices dropped across the board. Grab a virtual bargain!");
  }

  function resetMarket() {
    setSnapshots([freshExchangeDemoDrinks()]);
    setCrashes(0);
    setMoveCount(0);
    setAutoPulse(false);
    setLastEvent("Market reset. A whole new round starts now!");
  }

  useEffect(() => {
    if (!autoPulse) return;
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      setSnapshots(previous => {
        const index = (previous.length * 7 + crashes) % EXCHANGE_DEMO_DRINKS.length;
        return [...previous.slice(-24), simulateExchangeDemand(previous[previous.length - 1], EXCHANGE_DEMO_DRINKS[index].id)];
      });
      setMoveCount(previous => previous + 1);
      setLastEvent("Auto-pulse: new virtual orders are moving the prices.");
    }, 4200);
    return () => window.clearInterval(interval);
  }, [autoPulse, crashes]);

  return (
    <section className={styles.demoSection} id="demo" aria-labelledby="exchange-demo-title">
      <div className={styles.demoIntro}>
        <div>
          <span className={styles.eyebrow}>THE PLAYGROUND / NO REAL TRANSACTIONS</span>
          <h2 id="exchange-demo-title">Your drink. <em>Your market.</em></h2>
          <p>Hit a drink to create demand. Watch prices go wild. Or crash the entire market. This is your party exchange!</p>
        </div>
        <a className={styles.scrollHint} href="#how-it-works">Wait, how does this work? ↗</a>
      </div>

      <div className={`${styles.demoPanel} ${screenMode ? styles.screenMode : ""}`}>
        <div className={styles.demoTopline}>
          <div className={styles.exchangeIdentity}>
            <span className={styles.exchangeLogo} aria-hidden="true">↗</span>
            <div><strong>DRINK<span>STOCK</span> <small>EXCHANGE</small></strong><span className={styles.demoOverline}>VIRTUAL TRADING FLOOR</span></div>
          </div>
          <div className={styles.topControls}>
            <span className={styles.demoTag}><span className={styles.demoLamp} /> SIMULATED MARKET</span>
            <button type="button" className={styles.toolButton} onClick={() => setScreenMode(value => !value)} aria-pressed={screenMode}>{screenMode ? "✕ Exit screen" : "▣ Big screen"}</button>
          </div>
        </div>

        <div className={styles.tickerBand} aria-label="Simulated drink market ticker">
          <div className={styles.tickerTrack}>
            {[...drinks, ...drinks].map((drink, index) => (
              <span key={drink.id + index}><b>{identities[drink.id]?.ticker ?? drink.id.toUpperCase()}</b> {euros.format(drink.priceCents / 100)}
                <i className={drink.priceCents >= drink.baseCents ? styles.tickerUp : styles.tickerDown}>{movementLabel(drink)}</i>
              </span>
            ))}
          </div>
        </div>

        <div className={styles.marketStatus}>
          <div className={styles.marketTitle}><span className={styles.pulseDot} /> <span>MARKET OPEN <b>·</b> PARTY ON</span></div>
          <div className={styles.marketStats}><span>DRINKS LISTED <b>{drinks.length}</b></span><span>MARKET MOVES <b>{moves}</b></span><span>CRASHES <b>{crashes}</b></span></div>
        </div>

        <div className={styles.leaderboard}>
          <div><span>🔥 HOTTEST RIGHT NOW</span><strong>{identities[sorted[0].id]?.icon} {sorted[0].name}</strong></div>
          <div><span>🧊 THE BIGGEST DIP</span><strong>{identities[sorted[sorted.length - 1].id]?.icon} {sorted[sorted.length - 1].name}</strong></div>
          <div className={styles.marketAnnouncement}><span>📣 MARKET BUZZ</span><strong aria-live="polite" aria-atomic="true">{lastEvent}</strong></div>
        </div>

        <div className={styles.drinkToolbar}>
          <div className={styles.categoryTabs} role="group" aria-label="Filter drinks">
            {categories.map(category => <button type="button" key={category} className={activeCategory === category ? styles.activeTab : ""} onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category}>{category}</button>)}
          </div>
          <span className={styles.priceLegend}><b>↗</b> demand up = price up <b>↘</b> others ease</span>
        </div>

        <div className={styles.drinkGrid}>
          {visibleDrinks.map(drink => {
            const identity = identities[drink.id];
            const history = snapshots.map(snapshot => snapshot.find(entry => entry.id === drink.id)?.priceCents ?? drink.priceCents);
            const change = drink.priceCents - drink.baseCents;
            return <article key={drink.id} className={styles.drinkCard} style={{ "--drink-accent": identity?.color ?? "#a4ff63" } as CSSProperties}>
              <div className={styles.drinkHead}>
                <div className={styles.drinkIcon} aria-hidden="true">{identity?.icon ?? "🍹"}</div>
                <span className={styles.drinkTicker}>{identity?.ticker ?? drink.id.toUpperCase()} <small> / DSX</small></span>
              </div>
              <div className={styles.drinkIdentity}><h3>{drink.name}</h3><p>{drink.description}</p></div>
              <div className={styles.priceLine}>
                <strong>{euros.format(drink.priceCents / 100)}</strong>
                <span className={`${styles.change} ${change > 0 ? styles.rise : change < 0 ? styles.fall : styles.flat}`}>
                  {change > 0 ? "↗ " : change < 0 ? "↘ " : "→ "}{movementLabel(drink)}
                </span>
              </div>
              <div className={styles.chartArea}><Sparkline values={history} color={identity?.color ?? "#a4ff63"} /><span>PRICE TREND</span></div>
              <button type="button" className={styles.tradeButton} onClick={() => moveMarket(drink.id)} aria-label={`Simulate more demand for ${drink.name}`}>
                BOOST DEMAND <span aria-hidden="true">↗</span>
              </button>
            </article>;
          })}
        </div>

        <div className={styles.marketActions}>
          <div><strong>Ready to shake things up?</strong><span>Everything here is a simulation. No orders, payments or venue prices change.</span></div>
          <div className={styles.marketButtons}>
            <button type="button" className={styles.pulseButton} onClick={() => setAutoPulse(value => !value)} aria-pressed={autoPulse}>{autoPulse ? "Ⅱ Pause auto-pulse" : "▶ Auto-pulse"}</button>
            <button type="button" className={styles.crashButton} onClick={crashMarket}>⚡ MARKET CRASH!</button>
            <button type="button" className={styles.resetButton} onClick={resetMarket}>↺ Reset</button>
          </div>
        </div>
        <div className={styles.demoFooter}><span>DEMO MODE · INDEPENDENT, MADE-UP MARKET</span><span>NO POS · NO REAL ORDERS · NO PAYMENTS</span></div>
      </div>
      <p className={styles.demoDisclaimer}>All drinks, prices and demand changes shown here are fictional. The production engine will use venue-specific rules and price bounds. This public demo never accesses partner or customer data.</p>
    </section>
  );
}
