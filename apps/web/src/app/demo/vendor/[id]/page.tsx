import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../../components/SiteFooter";
import { SiteHeader } from "../../../../components/SiteHeader";
import { VendorCatalogBrowser } from "../../../../components/VendorCatalogBrowser";
import { VendorLocationMap } from "../../../../components/VendorLocationMap";
import styles from "../../../../components/VendorStorefront.module.css";
import { getDemoStorefrontVendor, getDemoVendorCatalogCards, type DemoStorefrontVendor } from "../../../../lib/demo-storefront";
import { approvedVendorProfileMedia, type ApprovedVendorProfileMedia } from "../../../../lib/public-media-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "DEMO shop · KONTA MOY",
  robots: { index: false, follow: false, nocache: true }
};

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : value.slice(0, 2)).toLocaleUpperCase("el");
}

function addressText(location: DemoStorefrontVendor["location"]): string {
  if (!location) return "";
  return [location.addressLine1, location.addressLine2, [location.postcode, location.locality].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

function mediaPath(media?: ApprovedVendorProfileMedia): string | undefined {
  return media ? `/api/media/${encodeURIComponent(media.mediaId)}` : undefined;
}

function firstRole(media: readonly ApprovedVendorProfileMedia[], role: ApprovedVendorProfileMedia["role"]): ApprovedVendorProfileMedia | undefined {
  return media.find((item) => item.role === role);
}

export default async function DemoVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendor = await getDemoStorefrontVendor(id);
  if (!vendor) notFound();
  const [products, profileMedia] = await Promise.all([getDemoVendorCatalogCards(vendor), approvedVendorProfileMedia([vendor.id])]);
  const location = vendor.location;
  const intro = vendor.shortDescription ?? `Προεπισκόπηση του μελλοντικού καταστήματος ${vendor.name} μέσα στο ΚΟΝΤΑ ΜΟΥ Sparta. Η εμπειρία μιμείται το ενεργό storefront, αλλά δεν δημιουργεί παραγγελίες ή δεσμεύσεις.`;
  const fullAddress = addressText(location);
  const logoMedia = firstRole(profileMedia, "logo");
  const storefrontMedia = firstRole(profileMedia, "storefront");
  const teamMedia = firstRole(profileMedia, "team");
  const galleryMedia = profileMedia.filter((item) => item.role === "gallery");
  const logoUrl = mediaPath(logoMedia);
  const storefrontUrl = mediaPath(storefrontMedia);
  const teamUrl = mediaPath(teamMedia);

  return (
    <main className={styles.page}>
      <div className="announcement">DEMO storefront · πραγματική εμπειρία καταστήματος χωρίς παραγγελίες, πληρωμές ή δεσμεύσεις αποθέματος.</div>
      <SiteHeader />

      <section className={styles.hero}>
        <div className="shell">
          <a className={styles.backLink} href="/shops">← Όλα τα καταστήματα</a>
          <div className={styles.heroGrid}>
            <div className={styles.identity}>
              <div className={styles.brandRow}>
                <div className={styles.logoMark} aria-label={`Ταυτότητα καταστήματος ${vendor.name}`} style={{ overflow: "hidden" }}>
                  {logoUrl ? <Image src={logoUrl} alt={logoMedia?.altText ?? `Λογότυπο ${vendor.name}`} width={82} height={82} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 8 }} /> : initials(vendor.name)}
                </div>
                <div className={styles.brandMeta}>
                  <strong>DEMO συνεργάτη · προεπισκόπηση πριν την ενεργοποίηση</strong>
                  <span>{location?.locality ? `${location.locality}${location.postcode ? ` · ${location.postcode}` : ""}` : "Σπάρτη & τοπική αγορά"}</span>
                  <span>{logoUrl ? "Εγκεκριμένο storefront logo · ίδιο asset με το μελλοντικό LIVE shop." : "Η διάταξη και ο κατάλογος ακολουθούν το πραγματικό storefront ενεργού vendor."}</span>
                </div>
              </div>
              <div className="eyebrow">Meet the local shop · DEMO</div>
              <h1>{vendor.name}</h1>
              <p className={styles.intro}>{intro}</p>
              <div className={styles.quickFacts}>
                <span className={styles.quickFact}>{products.length} προϊόντα σε προεπισκόπηση</span>
                <span className={styles.quickFact}>Κατάσταση · {vendor.status.replaceAll("_", " ")}</span>
                <span className={styles.quickFact}>Checkout απενεργοποιημένο</span>
              </div>
              <div className={styles.heroActions}>
                <a className="button" href="#products">Δες προϊόντα</a>
                <a className="button button-secondary" href="#store-info">Στοιχεία καταστήματος</a>
              </div>
            </div>

            <div className={styles.mediaPanel} aria-label={`DEMO βιτρίνα ${vendor.name}`}>
              {storefrontUrl ? <Image src={storefrontUrl} alt={storefrontMedia?.altText ?? `DEMO βιτρίνα ${vendor.name}`} fill priority sizes="(max-width: 980px) 100vw, 54vw" style={{ objectFit: "cover" }} /> : <div className={styles.mediaPlaceholder}>
                <div className={styles.mediaPlaceholderInner}>
                  <span className={styles.mediaPlaceholderIcon}>⌂</span>
                  <strong>{vendor.name}</strong>
                  <span>DEMO βιτρίνα. Εγκεκριμένη φωτογραφία καταστήματος θα εμφανιστεί εδώ όταν δημοσιευθεί από το Partner Design.</span>
                </div>
              </div>}
              <div className={styles.mediaOverlay}>
                <strong>DEMO · {vendor.name}</strong>
                <span>{storefrontUrl ? "Εγκεκριμένη storefront εικόνα · ίδιο visual source με το LIVE shop." : "Ίδιο customer-facing layout με ενεργό κατάστημα, χωρίς εμπορικές ενέργειες."}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} shell`} aria-labelledby="people-story-title">
        <div className={styles.sectionHeader}>
          <div>
            <div className="eyebrow">Άνθρωποι & ιστορία</div>
            <h2 id="people-story-title">Ποιοι βρίσκονται πίσω από το κατάστημα;</h2>
          </div>
          <p className={styles.sectionLead}>Το DEMO κρατά το ίδιο storytelling section με το πραγματικό storefront. Δεν εφευρίσκουμε στοιχεία που ο vendor δεν έχει ακόμη εγκρίνει.</p>
        </div>
        <div className={styles.peopleStoryGrid}>
          <article className={`${styles.card} ${styles.peopleCard}`}>
            <div className="eyebrow">Meet the vendor</div>
            <div className={styles.peopleHead}>
              <div className={styles.personAvatar} style={{ overflow: "hidden" }}>{teamUrl ? <Image src={teamUrl} alt={teamMedia?.altText ?? `Η ομάδα του ${vendor.name}`} width={76} height={76} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(vendor.name)}</div>
              <div><h3>Η ομάδα του {vendor.name}</h3><p>Τοπική εξυπηρέτηση και γνώση προϊόντων.</p></div>
            </div>
            <p className={styles.peopleCopy}>{teamUrl ? "Η εγκεκριμένη εικόνα ομάδας προβάλλεται ήδη όπως θα εμφανιστεί στο LIVE storefront." : "Το όνομα συμβούλου, η φωτογραφία ομάδας και οι επιβεβαιωμένες δυνατότητες συμβουλής θα εμφανιστούν μόλις εγκριθούν στο onboarding."}</p>
          </article>
          <article className={`${styles.card} ${styles.storyCard}`}>
            <div className="eyebrow light">Η σύντομη ιστορία</div>
            <h2>Λίγα λόγια για το {vendor.name}.</h2>
            <p>{vendor.story ?? "Δεν έχει δημοσιευθεί ακόμη εγκεκριμένη ιστορία από το κατάστημα. Η θέση παραμένει ορατή στο DEMO ώστε ο prospect να δει πώς θα παρουσιαστεί όταν ολοκληρώσει το προφίλ του."}</p>
            <small className={styles.storyNote}>DEMO περιεχόμενο · η τελική δημόσια έκδοση μπορεί να αντικατασταθεί από separately governed Merchant Story.</small>
          </article>
        </div>

        {galleryMedia.length > 0 && <div style={{ marginTop: 28 }}>
          <div className={styles.sectionHeader} style={{ marginBottom: 18 }}>
            <div><div className="eyebrow">Store gallery · DEMO</div><h2>Μια ματιά στο {vendor.name}</h2></div>
            <p className={styles.sectionLead}>Οι ίδιες εγκεκριμένες gallery εικόνες που θα τροφοδοτούν το ενεργό storefront.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
            {galleryMedia.map((media) => <div className={styles.card} key={media.mediaId} style={{ position: "relative", overflow: "hidden", minHeight: 240 }}>
              <Image src={mediaPath(media)!} alt={media.altText ?? `${vendor.name} gallery`} fill sizes="(max-width: 640px) 100vw, 33vw" style={{ objectFit: "cover" }} />
            </div>)}
          </div>
        </div>}
      </section>

      <section className={styles.catalogSection} id="products" aria-labelledby="vendor-products-title">
        <div className="shell">
          <div className={styles.sectionHeader}>
            <div>
              <div className="eyebrow">Shop this vendor · DEMO</div>
              <h2 id="vendor-products-title">Προϊόντα από το {vendor.name}</h2>
            </div>
            <p className={styles.sectionLead}>Αναζήτησε μέσα στο κατάστημα και φιλτράρισε ανά κατηγορία, μάρκα, χρώμα και κατάσταση τιμής. Κάθε προϊόν ανοίγει πλήρη DEMO product page.</p>
          </div>
          {products.length > 0 ? (
            <VendorCatalogBrowser products={products} vendor={{ name: vendor.name }} demoVendorId={vendor.id} />
          ) : (
            <div className={styles.noResults}><h3>Δεν έχουν προετοιμαστεί ακόμη προϊόντα.</h3><p>Μόλις συνδεθούν canonical προϊόντα με τον prospect, θα εμφανιστούν εδώ με το ίδιο UI του κανονικού καταστήματος.</p></div>
          )}
        </div>
      </section>

      <section className={styles.askSection} id="ask-local" aria-labelledby="vendor-ask-title">
        <div className="shell">
          <div className={styles.askPanel}>
            <div className={styles.askCopy}>
              <div className="eyebrow">Ask Local · DEMO preview</div>
              <h2 id="vendor-ask-title">Δεν το βλέπεις; Ρώτησε.</h2>
              <p>Έτσι θα εμφανίζεται το vendor-specific Ask Local όταν το κατάστημα ενεργοποιηθεί. Στο DEMO δεν αποστέλλονται πραγματικά αιτήματα στον prospect.</p>
              <span className={styles.askVendorBadge}>Μελλοντική δρομολόγηση → {vendor.name}</span>
            </div>
            <div className={styles.askLoginCard}>
              <h3>DEMO · επικοινωνία απενεργοποιημένη</h3>
              <p>Η προεπισκόπηση δείχνει τη θέση και τη λειτουργία χωρίς να δημιουργεί customer request ή vendor notification.</p>
              <button className="button" type="button" disabled aria-disabled="true">Ζήτησε συμβουλή</button>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.infoSection} id="store-info" aria-labelledby="store-info-title">
        <div className={`shell ${styles.infoShell}`}>
          <div className={styles.sectionHeader}>
            <div><div className="eyebrow">General information</div><h2 id="store-info-title">Κατάστημα, επικοινωνία & φυσική τοποθεσία</h2></div>
            <p className={styles.sectionLead}>Το ίδιο information section που θα χρησιμοποιεί το ενεργό storefront, με τα στοιχεία που έχουν ήδη καταχωριστεί.</p>
          </div>
          <div className={styles.infoGrid}>
            <article className={`${styles.card} ${styles.infoCard}`}>
              <div className="eyebrow">Store details · DEMO</div>
              <dl className={styles.infoList}>
                <div className={styles.infoRow}><dt>Επιχείρηση</dt><dd>{vendor.name}</dd></div>
                <div className={styles.infoRow}><dt>Κατάσταση</dt><dd>DEMO · προ-ενεργοποίηση · καμία εμπορική συναλλαγή</dd></div>
                {location && <div className={styles.infoRow}><dt>Φυσικό κατάστημα</dt><dd>{location.addressLine1 ?? location.name ?? "—"}{location.addressLine2 ? <><br />{location.addressLine2}</> : null}{(location.postcode || location.locality) ? <><br />{[location.postcode, location.locality].filter(Boolean).join(" ")}</> : null}</dd></div>}
                {location?.phone && <div className={styles.infoRow}><dt>Τηλέφωνο</dt><dd><a className="text-link" href={`tel:${location.phone}`}>{location.phone}</a></dd></div>}
                {location?.publicEmail && <div className={styles.infoRow}><dt>Email</dt><dd><a className="text-link" href={`mailto:${location.publicEmail}`}>{location.publicEmail}</a></dd></div>}
              </dl>
            </article>
            <VendorLocationMap vendorId={vendor.id} vendorName={vendor.name} address={fullAddress || vendor.name} coordinates={location?.coordinates} />
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
