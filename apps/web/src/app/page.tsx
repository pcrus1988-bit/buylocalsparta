import { SiteHeader } from "../components/SiteHeader";
import { getCatalogCards } from "../lib/catalog-view";
import { getAvailableStorefrontCategories } from "../lib/available-catalog-taxonomy";
import { getVisitorKey } from "../lib/visitor";
import { CatalogProductCard } from "../components/CatalogProductCard";
import { SiteFooter } from "../components/SiteFooter";

export default async function Home() {
  const visitorKey = await getVisitorKey();
  const [cards, categories] = await Promise.all([
    getCatalogCards(visitorKey),
    getAvailableStorefrontCategories("23100")
  ]);

  return (
    <main>
      <div className="announcement">Δωρεάν παραλαβή από συνεργαζόμενα καταστήματα στη Σπάρτη</div>

      <SiteHeader />

      <section className="hero shell" id="top">
        <div className="hero-copy">
          <div className="eyebrow">Αγοράζουμε τοπικά. Γνωρίζουμε ποιος είναι πίσω από το προϊόν.</div>
          <h1>Η αγορά της Σπάρτης, σε ένα μέρος.</h1>
          <p className="lead">
            Ανακάλυψε προϊόντα από τοπικά καταστήματα, μίλα με ανθρώπους που τα γνωρίζουν και αγόρασε με μία ενιαία εμπειρία checkout.
          </p>
          <div className="hero-actions">
            <a className="button" href="/shop">Ανακάλυψε προϊόντα</a>
            <a className="button button-secondary" href="/ask-local">Ρώτησε ένα κατάστημα</a>
          </div>
          <div className="hero-proof" aria-label="Marketplace benefits">
            <span><strong>1</strong> checkout</span>
            <span><strong>Τοπική</strong> συμβουλή</span>
            <span><strong>Δίκαιη</strong> προβολή καταστημάτων</span>
          </div>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="visual-card visual-card-main">
            <div className="visual-label">SPARTA · 23100</div>
            <div className="visual-title">Local finds.<br />Real people.</div>
            <div className="visual-orbit visual-orbit-one" />
            <div className="visual-orbit visual-orbit-two" />
            <div className="visual-dot visual-dot-one" />
            <div className="visual-dot visual-dot-two" />
          </div>
          <div className="floating-note floating-note-top">✓ Διαθέσιμο τοπικά</div>
          <div className="floating-note floating-note-bottom">Μίλα με τον άνθρωπο πίσω από το προϊόν</div>
        </div>
      </section>

      {categories.length > 0 ? <section className="section shell" aria-labelledby="categories-title">
        <div className="section-heading">
          <div><div className="eyebrow">Ξεκίνα από εδώ</div><h2 id="categories-title">Κατηγορίες</h2></div>
          <a className="text-link" href="/shop">Όλα τα προϊόντα →</a>
        </div>
        <div className="category-grid">
          {categories.map((category) => (
            <a className={`category-card category-card-${category.slug}`} href={`/category/${category.slug}`} key={category.slug}>
              <span className="category-mark">{category.mark}</span>
              <span><strong>{category.label}</strong><small>{category.name}</small></span>
              <span className="category-symbol" aria-hidden="true">{category.symbol}</span>
              <span className="category-arrow">↗</span>
            </a>
          ))}
        </div>
      </section> : null}

      <section className="section section-tint" id="shop">
        <div className="shell">
          <div className="section-heading">
            <div><div className="eyebrow">Επιλεγμένα τώρα</div><h2>Διαθέσιμα στη Σπάρτη</h2></div>
            <p className="section-note">Ένα προϊόν εμφανίζεται μία φορά. Η πλατφόρμα αναθέτει δίκαια το κατάστημα εκπλήρωσης στο παρασκήνιο.</p>
          </div>
          <div className="product-grid" aria-label="Demo canonical products">
            {cards.map((product, index) => <CatalogProductCard product={product} index={index} key={product.id} />)}
          </div>
        </div>
      </section>

      <section className="story-grid shell section" id="people">
        <article className="story-panel story-panel-dark">
          <div className="eyebrow light">Οι άνθρωποι της αγοράς</div>
          <h2>Δεν αγοράζεις από μια απρόσωπη λίστα.</h2>
          <p>Κάθε συνεργαζόμενο κατάστημα μπορεί να παρουσιάσει την ιστορία, την τεχνογνωσία και τους ανθρώπους του — χωρίς να ανταγωνίζεται δημόσια τον διπλανό του για το ίδιο προϊόν.</p>
          <a className="button button-light" href="/shops">Γνώρισε τα καταστήματα</a>
        </article>
        <article className="story-panel story-portrait" aria-label="Local merchant storytelling illustration">
          <div className="portrait-frame"><span>LOCAL<br />PEOPLE</span></div>
          <div className="portrait-caption"><strong>Know your vendor.</strong><span>Η προσωπική σχέση επιστρέφει στο online shopping.</span></div>
        </article>
      </section>

      <section className="advice-section" id="advice">
        <div className="shell advice-grid">
          <div>
            <div className="eyebrow">Human commerce</div>
            <h2>Χρειάζεσαι συμβουλή πριν αγοράσεις;</h2>
            <p className="lead compact">Ξεκίνα chat, ζήτησε εξατομικευμένη πρόταση ή κλείσε σύντομη βιντεοκλήση με κατάστημα που γνωρίζει πραγματικά την κατηγορία.</p>
          </div>
          <div className="advice-list">
            <div><span>01</span><p><strong>Ρώτησε για προϊόν</strong><small>Στείλε ερώτηση μέσα από τη σελίδα του προϊόντος.</small></p></div>
            <div><span>02</span><p><strong>Πάρε πραγματική συμβουλή</strong><small>Ο κατάλληλος τοπικός επαγγελματίας απαντά ιδιωτικά.</small></p></div>
            <div><span>03</span><p><strong>Αγόρασε όταν είσαι έτοιμος</strong><small>Η προσφορά περνά απευθείας στο καλάθι σου.</small></p></div>
          </div>
          <div className="hero-actions">
            <a className="button" href="/advice">Βρες τοπικό σύμβουλο</a>
            <a className="button button-secondary" href="/how-it-works">Δες όλη τη διαδρομή</a>
          </div>
        </div>
      </section>

      <section className="ask-local shell section" id="ask-local">
        <div>
          <div className="eyebrow">Δεν βρίσκεις ακριβώς αυτό που θέλεις;</div>
          <h2>Ask Local.</h2>
          <p>Πες μας τι ψάχνεις. Το αίτημα δρομολογείται ιδιωτικά σε ένα κατάλληλο κατάστημα — όχι σε δημόσιο bidding war.</p>
        </div>
        <form className="ask-form" action="/ask-local" method="get">
          <label htmlFor="ask">Τι ψάχνεις;</label>
          <div className="ask-row">
            <input id="ask" name="need" minLength={10} maxLength={2000} required placeholder="π.χ. δώρο για παιδί 8 ετών έως 35€" />
            <button type="submit" className="button">Ρώτησε τοπικά</button>
          </div>
          <small>Θα συνδεθείς με ασφάλεια για να υποβάλεις και να παρακολουθείς το ιδιωτικό αίτημα.</small>
        </form>
      </section>

      <SiteFooter />
    </main>
  );
}