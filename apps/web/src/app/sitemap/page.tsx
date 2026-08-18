import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { ACCOUNT_UTILITY_NAVIGATION, HUMAN_SITEMAP_SECTIONS } from "../../lib/site-navigation";
import { STOREFRONT_CATEGORIES } from "../../lib/storefront-taxonomy";

export const metadata: Metadata = {
  title: "Χάρτης ιστοτόπου",
  description: "Οι πραγματικές δημόσιες διαδρομές του Buy Local Sparta, οργανωμένες χωρίς διπλές ή παραπλανητικές επιλογές.",
  alternates: { canonical: "/sitemap" }
};

export default function HumanSitemapPage() {
  return (
    <main>
      <div className="announcement">Χάρτης ιστοτόπου · οι πραγματικές διαδρομές του Buy Local Sparta σε ένα σημείο.</div>
      <SiteHeader />

      <section className="shell route-map-hero">
        <div className="eyebrow">Clear navigation</div>
        <h1>Βρες ακριβώς τη διαδρομή που χρειάζεσαι.</h1>
        <p className="lead">Ο χάρτης περιλαμβάνει μόνο σελίδες και ροές που υπάρχουν πραγματικά. Τα ιδιωτικά dashboard και τα τεχνικά API δεν παρουσιάζονται ως δημόσιο περιεχόμενο.</p>
      </section>

      <section className="shell route-map-section" aria-label="Δημόσιες διαδρομές">
        <div className="route-map-grid">
          {HUMAN_SITEMAP_SECTIONS.map((section) => (
            <article className="route-map-card" key={section.title}>
              <div className="eyebrow">{section.title}</div>
              <div className="route-map-links">
                {section.links.map((link) => (
                  <Link href={link.href} key={link.href}>
                    <strong>{link.label}</strong>
                    {link.description && <span>{link.description}</span>}
                    <i aria-hidden="true">→</i>
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section section-tint">
        <div className="shell route-map-split">
          <div>
            <div className="eyebrow">Κατηγορίες προϊόντων</div>
            <h2>Μπες κατευθείαν στην κατηγορία.</h2>
            <div className="route-map-category-list">
              {STOREFRONT_CATEGORIES.map((category) => <Link href={`/category/${category.slug}`} key={category.slug}>{category.label}<span aria-hidden="true">→</span></Link>)}
            </div>
          </div>
          <aside className="route-map-account">
            <div className="eyebrow">Λογαριασμός πελάτη</div>
            <h2>Σύνδεση ή νέα εγγραφή.</h2>
            <p>Οι σελίδες λογαριασμού δεν μπαίνουν στο XML sitemap, αλλά παραμένουν σαφείς και προσβάσιμες όταν τις χρειάζεσαι.</p>
            <div className="hero-actions">
              {ACCOUNT_UTILITY_NAVIGATION.map((link) => <Link className="button button-secondary" href={link.href} key={link.href}>{link.label}</Link>)}
            </div>
          </aside>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
