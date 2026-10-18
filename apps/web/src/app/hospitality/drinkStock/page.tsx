import type { Metadata } from "next";
import Link from "next/link";
import { ExchangeDemo } from "../../../components/ExchangeDemo";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "DrinkStock — The Party Is The Market",
  description: "DrinkStock is a gamified drink-exchange concept. Watch scripted drink orders change simulated prices, then trigger a manager-style 60-second market crash. Powered by KONTA MOY Hospitality.",
  alternates: { canonical: "https://hospitality.kontamou.site/drinkstock" },
  robots: { index: false, follow: false }
};

const HOW_IT_WORKS = [
  { number: "01", symbol: "🍸", title: "PICK YOUR DRINK", description: "Η προσομοίωση δέχεται αυτόματα μία προκαθορισμένη ακολουθία παραγγελιών. Κάθε ποτό εμφανίζεται σε δυναμικό πίνακα τιμών." },
  { number: "02", symbol: "📈", title: "WATCH IT MOVE", description: "Η ζήτηση αλλάζει τις τιμές μέσα σε προκαθορισμένα όρια. Όταν ένα ανεβαίνει, κάποιο άλλο μπορεί να γίνει ευκαιρία." },
  { number: "03", symbol: "⚡", title: "WAIT FOR THE CRASH", description: "Τα market crashes φέρνουν ανατροπές και κάνουν την οθόνη μέρος του party. Οι κανόνες ελέγχονται από το venue." },
] as const;

const CAPABILITIES = [
  { code: "LIVE BOARD", symbol: "▦", title: "Your bar. Your exchange.", description: "Πίνακες τιμών σχεδιασμένοι για τηλεοράσεις και μεγάλες οθόνες στον χώρο." },
  { code: "VENUE CONTROL", symbol: "⚙", title: "You make the rules.", description: "Όρια, επιλογές ποτών, κανόνες και δυνατότητα παύσης, ανά επιχείρηση και venue." },
  { code: "PLAYFUL EXPERIENCE", symbol: "✳", title: "The venue becomes a spectacle.", description: "Προσομοιωμένη ροή παραγγελιών, ζωντανές μεταβολές τιμών και manager-triggered crash με κόκκινα φώτα και countdown." },
  { code: "BUILT TO CONNECT", symbol: "⇄", title: "POS independent by design.", description: "Η αρχιτεκτονική προβλέπει μελλοντικές συνδέσεις με διαφορετικά POS, χωρίς να ισχυρίζεται ότι είναι ήδη διαθέσιμες." },
] as const;

export default function DrinkStockLanding() {
  return (
    <main className={styles.page} data-drinkstock-landing>
      <div className={styles.ambientOne} aria-hidden="true" />
      <div className={styles.ambientTwo} aria-hidden="true" />

      <header className={styles.nav}>
        <Link href="/drinkstock" className={styles.logo} aria-label="DrinkStock – αρχική">
          <span className={styles.logoMark} aria-hidden="true">↗</span>
          <span className={styles.logoText}>DRINK<span>STOCK</span><small>THE PARTY MARKET</small></span>
        </Link>
        <nav className={styles.navLinks} aria-label="DrinkStock navigation">
          <a href="#exchange">THE EXCHANGE</a>
          <a href="#how-it-works">HOW IT WORKS</a>
          <a href="#for-venues" className={styles.navVenue}>FOR VENUES</a>
        </nav>
        <a href="/drinkstock/login" className={styles.partnerLink}>PARTNER LOGIN <span aria-hidden="true">↗</span></a>
      </header>

      <section className={styles.hero} aria-labelledby="drinkstock-hero-title">
        <div className={styles.heroCopy}>
          <div className={styles.heroKicker}><span className={styles.kickerDot} aria-hidden="true" /> THE FIRST-EVER NIGHT OUT THAT PLAYS THE MARKET <span className={styles.heroKickerEnd}>/ CONCEPT DEMO</span></div>
          <h1 id="drinkstock-hero-title">DRINKS <span className={styles.lime}>UP.</span><br />PRICES <span className={styles.pink}>DOWN.</span><br /><span className={styles.italic}>PARTY ON.</span></h1>
          <p>What if every round could change the game? <strong>Welcome to DrinkStock.</strong> Το bar γίνεται χρηματιστήριο ποτών. Οι εικονικές παραγγελίες κυλούν, οι τιμές αλλάζουν και ο manager μπορεί να προκαλέσει crash ενός λεπτού.</p>
          <div className={styles.heroActions}>
            <a href="#exchange" className={styles.ctaPrimary}>WATCH THE LIVE DEMO <span aria-hidden="true">↗</span></a>
            <a href="#how-it-works" className={styles.ctaGhost}>HOW IT WORKS <span aria-hidden="true">↓</span></a>
          </div>
          <div className={styles.heroTrust}><span aria-hidden="true">◎</span> REAL ENERGY. SIMULATED PRICES. NO REAL PURCHASES.</div>
        </div>

        <div className={styles.heroVisual} aria-label="Illustrative DrinkStock price exchange preview">
          <div className={styles.visualFrame}>
            <div className={styles.visualHeader}>
              <div><span className={styles.visualLight} aria-hidden="true" /> DRINKSTOCK / MARKET BOARD</div><span>DEMO 001</span>
            </div>
            <div className={styles.visualHeadline}>THE NIGHT<br /><span>IS TRADING.</span></div>
            <div className={styles.chartBox}>
              <div className={styles.chartTitle}><span>PARTY ENERGY</span><span>ILLUSTRATIVE GRAPH</span></div>
              <svg viewBox="0 0 520 155" role="img" aria-label="Decorative rising and falling chart, not live market data" preserveAspectRatio="none">
                <defs><linearGradient id="drinkstock-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#caff4e" stopOpacity=".38" /><stop offset="100%" stopColor="#caff4e" stopOpacity="0" /></linearGradient></defs>
                <path d="M0 130 L48 119 L89 132 L136 75 L190 98 L233 57 L268 90 L324 44 L366 64 L418 18 L466 40 L520 5 L520 155 L0 155 Z" fill="url(#drinkstock-chart-fill)" />
                <path d="M0 130 L48 119 L89 132 L136 75 L190 98 L233 57 L268 90 L324 44 L366 64 L418 18 L466 40 L520 5" fill="none" stroke="#d2ff54" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
                <circle cx="520" cy="5" r="6" fill="#e8ff96" />
              </svg>
            </div>
            <div className={styles.previewRows}>
              <div><span>🍸 &nbsp; GIN & TONIC</span><strong>€ 8.50</strong><em className={styles.previewUp}>↗</em></div>
              <div><span>🍺 &nbsp; DRAFT BEER</span><strong>€ 5.00</strong><em className={styles.previewDown}>↘</em></div>
              <div><span>🍹 &nbsp; MOJITO</span><strong>€ 9.00</strong><em className={styles.previewUp}>↗</em></div>
            </div>
            <div className={styles.visualBottom}><span>NO REAL TRADES</span><span>LIVE LOOK / DEMO DATA</span></div>
          </div>
          <div className={styles.sticker} aria-hidden="true">BUY THE<br />DIP! <span>⚡</span></div>
          <div className={styles.visualGlow} aria-hidden="true" />
        </div>
      </section>

      <div className={styles.ribbon} aria-label="DrinkStock concepts"><div className={styles.ribbonInner}>
        {[0, 1].map((index) => <span key={index} aria-hidden={index === 1}>
          <b>DRINK</b> <i>✳</i> <b>TRADE</b> <i>✳</i> <b>PARTY</b> <i>✳</i> <b>CRASH</b> <i>✳</i> <b>REPEAT</b> <i>✳</i>
        </span>)}
      </div></div>

      <ExchangeDemo />

      <section className={styles.steps} id="how-it-works" aria-labelledby="how-it-works-title">
        <div className={styles.sectionHeader}><span className={styles.sectionLabel}>01 / HOW IT WORKS</span><h2 id="how-it-works-title">IT&apos;S NOT JUST A BAR.<br /><em>IT&apos;S A GAME.</em></h2><p>Μια εντυπωσιακή εμπειρία που κάνει τους επισκέπτες να παρακολουθούν την αγορά, όχι μόνο το μενού.</p></div>
        <div className={styles.stepGrid}>
          {HOW_IT_WORKS.map((step) => <article className={styles.stepCard} key={step.number}>
            <div className={styles.stepTop}><span>{step.number} / 03</span><span className={styles.stepSymbol} aria-hidden="true">{step.symbol}</span></div>
            <h3>{step.title}</h3><p>{step.description}</p>
          </article>)}
        </div>
      </section>

      <section className={styles.venue} id="for-venues" aria-labelledby="venues-title">
        <div className={styles.venueIntro}>
          <div><span className={styles.sectionLabel}>02 / FOR BARS & VENUES</span><h2 id="venues-title">YOU RUN THE BAR.<br /><em>WE BRING THE HYPE.</em></h2></div>
          <p>Το DrinkStock σχεδιάζεται με κάθε συνεργάτη στο επίκεντρο. Ανεξάρτητη διαχείριση, ασφαλής πρόσβαση σε ανατεθειμένα καταστήματα και απόλυτος διαχωρισμός των δεδομένων ανά venue.</p>
        </div>
        <div className={styles.venueGrid}>
          {CAPABILITIES.map((feature) => <article className={styles.venueCard} key={feature.code}><div className={styles.venueSymbol} aria-hidden="true">{feature.symbol}</div><span>{feature.code}</span><h3>{feature.title}</h3><p>{feature.description}</p></article>)}
        </div>
        <div className={styles.venueCallout}><div><strong>YOUR VENUE. YOUR RULES.</strong><p>Partner workspaces are accessible only to specifically authorized registered users. No generic marketplace account can access venue data.</p></div><a href="/drinkstock/login" className={styles.ctaPrimary}>PARTNER ACCESS <span aria-hidden="true">↗</span></a></div>
      </section>

      <section className={styles.outro} aria-labelledby="drinkstock-outro-title">
        <span className={styles.sectionLabel}>THIS IS ONLY THE BEGINNING</span>
        <h2 id="drinkstock-outro-title">MAKE THE NIGHT<br /><em>UNPREDICTABLE.</em></h2>
        <p>When prices move, everybody watches. When the market crashes, the party gets interesting.</p>
        <a href="#exchange" className={styles.ctaPrimary}>ONE MORE ROUND <span aria-hidden="true">↗</span></a>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}><strong>DRINK<span>STOCK</span> ↗</strong><small>A KONTA MOY HOSPITALITY EXPERIENCE</small></div>
        <div className={styles.footerLinks}><a href="#exchange">DEMO</a><a href="/drinkstock/login">PARTNERS</a><Link href="/">HOSPITALITY GATEWAY</Link></div>
        <p>Concept demo only. No real trading, ordering or payment functionality. Developed in Sparta for Greece.</p>
      </footer>
    </main>
  );
}
