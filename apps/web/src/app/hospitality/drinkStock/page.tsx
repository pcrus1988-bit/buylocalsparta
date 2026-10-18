import type { Metadata } from "next";
import Link from "next/link";
import { ExchangeDemo } from "../../../components/ExchangeDemo";
import styles from "./drinkStock.module.css";

export const metadata: Metadata = {
  title: "DrinkStock — The party is the market",
  description: "A playful, simulated drinks stock exchange. Explore rising and falling drink prices and the hospitality concept behind DrinkStock.",
  robots: { index: false, follow: false }
};

const nightTicker = ["🍺 BEER +7.0%", "🍸 G&T ↗", "🍹 SPRITZ", "⚡ MARKET CRASH", "🪩 THE BAR IS THE MARKET", "🥤 COLA ↘"];

export default function DrinkStockLanding() {
  return <main className={styles.page} data-drinkstock>
    <section className={styles.hero}>
      <div className={`${styles.inner} ${styles.heroWrap}`}>
        <div>
          <span className={styles.topPill}>THE NEXT ROUND IS NEVER THE SAME</span>
          <h1 className={styles.heroTitle}>DRINK.<br /><span className={styles.accentWord}>TRADE.</span><em>PARTY.</em></h1>
          <p className={styles.heroLead}>Welcome to <strong>DrinkStock.</strong> The bar becomes a stock exchange. Prices move with demand, the crowd drives the action, and every round feels like an event.</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryLink} href="#demo">🎮 PLAY THE MARKET DEMO <span aria-hidden="true">↗</span></a>
            <Link className={styles.ghostLink} href="https://hospitality.kontamou.site/drinkStock/login">FOR VENUE PARTNERS <span aria-hidden="true">→</span></Link>
          </div>
          <p className={styles.heroNote}><span aria-hidden="true">✳</span> <strong>Concept preview.</strong> Interactive demo uses imaginary orders and prices — never real transactions.</p>
        </div>
        <div className={styles.heroVisual} aria-label="Illustration of a party drink on a playful stock market">
          <div className={styles.orbit} aria-hidden="true" />
          <div className={`${styles.floatChip} ${styles.floatChipOne}`}><span>🍺</span><span>BEER <b>↗ +7.0%</b></span></div>
          <div className={styles.heroGlass}><span className={styles.glassIcon} aria-hidden="true">🍹</span><span className={styles.glassLabel}>MOJITO / DEMO</span><strong className={styles.glassPrice}>€9.00</strong><span className={styles.glassChange}>↗ THE MARKET IS OPEN</span></div>
          <div className={`${styles.floatChip} ${styles.floatChipTwo}`}><span>⚡</span><span>MARKET CRASH <b>↘ -13%</b></span></div>
          <span className={styles.stamp}>NO REAL TRADING. JUST GOOD TIMES.</span>
        </div>
      </div>
    </section>

    <div className={styles.marqueeBar} aria-label="DrinkStock nightlife concepts">
      <div className={styles.marqueeInner} aria-hidden="true">{[...nightTicker, ...nightTicker].map((label, index) => <span key={index}><b>✦</b> {label}</span>)}</div>
    </div>

    <section className={styles.demoArea}>
      <div className={styles.inner}><ExchangeDemo /></div>
    </section>

    <section className={styles.howSection} id="how-it-works">
      <div className={styles.inner}>
        <span className={styles.sectionLabel}>THE RULES ARE SIMPLE</span>
        <h2 className={styles.sectionTitle}>Sip. Watch. <em>Repeat.</em></h2>
        <p className={styles.sectionLead}>No complicated trading screens. Just an easy, exciting night out where drink prices become part of the entertainment.</p>
        <div className={styles.steps}>
          <article className={styles.stepCard}><div className={styles.stepIcon} aria-hidden="true">👀</div><strong>01. Check the board</strong><p>Spot your favourite drink and see its current market price and momentum on the venue screen.</p></article>
          <article className={styles.stepCard}><div className={styles.stepIcon} aria-hidden="true">🍹</div><strong>02. Demand changes prices</strong><p>As certain drinks get popular, their prices can rise within the venue's configured limits. Others may become a bargain.</p></article>
          <article className={styles.stepCard}><div className={styles.stepIcon} aria-hidden="true">⚡</div><strong>03. Wait for the crash!</strong><p>Special market moments can bring prices down. Big screens, bold visuals, and a room full of anticipation.</p></article>
        </div>
      </div>
    </section>

    <section className={styles.partnerSection}>
      <div className={styles.inner}>
        <div className={styles.partnerPanel}>
          <div>
            <span className={styles.sectionLabel}>FOR BARS, CLUBS & HOSPITALITY VENUES</span>
            <h2>Turn your bar into <span style={{color:"#b8ff52"}}>the main event.</span></h2>
            <p>DrinkStock is designed to be POS-independent, configurable, and isolated by hospitality partner. Every venue keeps control of its own products, price limits and market sessions.</p>
            <Link className={styles.primaryLink} href="https://hospitality.kontamou.site/drinkStock/login">PARTNER ACCESS <span aria-hidden="true">↗</span></Link>
            <p className={styles.finePrint}>Partner login is reserved for authorised registered users. Live venue operations are under development; this public page is a concept and simulation.</p>
          </div>
          <ul className={styles.partnerBenefits}>
            <li><span>✳</span> Venue-specific workspaces</li>
            <li><span>✳</span> Configurable price floor & ceiling</li>
            <li><span>✳</span> Big-screen market experiences</li>
            <li><span>✳</span> POS-independent architecture</li>
            <li><span>✳</span> Fun for guests. Control for staff.</li>
          </ul>
        </div>
      </div>
    </section>
  </main>;
}
