import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { VendorAskLocalPanel } from "../../../components/VendorAskLocalPanel";
import { VendorCatalogBrowser } from "../../../components/VendorCatalogBrowser";
import { VendorLocationMap } from "../../../components/VendorLocationMap";
import styles from "../../../components/VendorStorefront.module.css";
import { getAccountSession } from "../../../lib/account-session";
import { getVendorCatalogCards } from "../../../lib/catalog-view";
import { approvedVendorProfileMedia, type ApprovedVendorProfileMedia } from "../../../lib/public-media-service";
import { getPublicVendorDirectoryEntry } from "../../../lib/public-vendor-directory";
import { getSeoGlobalSettingsSnapshot } from "../../../lib/seo-settings";
import { getSeoEntityOverridesSnapshot } from "../../../lib/seo-entity-overrides";
import { absoluteSeoCanonical, findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "../../../lib/seo-entity-policy";
import { buildGovernedSeoMetadata } from "../../../lib/seo-metadata";
import { researchVendorIndexEligibility } from "../../../lib/seo-visibility-policy";

type Props = Readonly<{ params: Promise<{ id: string }> }>;

function safeHttpUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function checkedDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("el-GR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date);
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : value.slice(0, 2)).toLocaleUpperCase("el");
}

function addressText(location: NonNullable<Awaited<ReturnType<typeof getPublicVendorDirectoryEntry>>>["location"]): string {
  if (!location) return "";
  return [location.addressLine1, location.addressLine2, `${location.postcode} ${location.locality}`].filter(Boolean).join(", ");
}

function mediaPath(media?: ApprovedVendorProfileMedia): string | undefined {
  return media ? `/api/media/${encodeURIComponent(media.mediaId)}` : undefined;
}

function firstRole(media: readonly ApprovedVendorProfileMedia[], role: ApprovedVendorProfileMedia["role"]): ApprovedVendorProfileMedia | undefined {
  return media.find((item) => item.role === role);
}

function absolutePublicMedia(url: string, origin: string): string {
  return /^https?:\/\//.test(url) ? url : `${origin}${url}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const [vendor, profileMedia, { settings }, overrides] = await Promise.all([
    getPublicVendorDirectoryEntry(id),
    approvedVendorProfileMedia([id]),
    getSeoGlobalSettingsSnapshot(),
    getSeoEntityOverridesSnapshot()
  ]);
  if (!vendor) return { title: "Κατάστημα" };
  const isResearch = vendor.directoryStatus === "research";
  const reference: SeoEntityReference = { kind: isResearch ? "research_vendor" : "partner_vendor", id: vendor.id };
  const quality = researchVendorIndexEligibility(vendor, { enabled: true, minimumScore: settings.researchVendorMinimumScore });
  const category = vendor.taxonomies[0];
  const description = vendor.story?.excerpt ?? (isResearch
    ? `Δημόσια καταχώριση για το ${vendor.name}${category?.subcategoryLabel ? ` · ${category.subcategoryLabel}` : ""} στη χαρτογραφημένη αγορά της Σπάρτης.`
    : `Γνώρισε το ${vendor.name}, τους ανθρώπους του, τα διαθέσιμα προϊόντα και την τοπική συμβουλή που προσφέρει μέσα από το ΚΟΝΤΑ ΜΟΥ Sparta.`);
  const ogMedia = vendor.story?.mediaUrl ?? mediaPath(firstRole(profileMedia, "storefront") ?? firstRole(profileMedia, "logo"));
  return buildGovernedSeoMetadata({
    reference,
    settings,
    override: findSeoEntityOverride(overrides.entries, reference),
    defaults: {
      title: `${vendor.name} · ${isResearch ? "Τοπική επιχείρηση" : "Τοπικό κατάστημα"}`,
      description,
      canonicalPath: `/vendor/${encodeURIComponent(vendor.id)}`,
      openGraphTitle: vendor.name,
      openGraphDescription: description,
      openGraphImage: ogMedia,
      keywords: [
        vendor.name,
        `${vendor.name} ${vendor.location?.locality ?? "Σπάρτη"}`,
        category?.subcategoryLabel,
        category?.categoryLabel,
        category?.categoryLabel ? `${category.categoryLabel} ${vendor.location?.locality ?? "Σπάρτη"}` : undefined,
        vendor.researchCategory
      ]
    },
    entityEligible: !isResearch || quality.blockingReasons.length === 0,
    defaultIndexAllowed: !isResearch || (settings.researchVendorIndexingEnabled && quality.eligible)
  });
}

export default async function VendorPage({ params }: Props) {
  const { id } = await params;
  const [vendor, { settings }, overrides] = await Promise.all([
    getPublicVendorDirectoryEntry(id),
    getSeoGlobalSettingsSnapshot(),
    getSeoEntityOverridesSnapshot()
  ]);
  if (!vendor) notFound();

  const isResearch = vendor.directoryStatus === "research";
  const reference: SeoEntityReference = { kind: isResearch ? "research_vendor" : "partner_vendor", id: vendor.id };
  const quality = researchVendorIndexEligibility(vendor, { enabled: true, minimumScore: settings.researchVendorMinimumScore });
  const override = findSeoEntityOverride(overrides.entries, reference);
  const seoControl = resolveSeoEntityControl({
    settings,
    kind: reference.kind,
    entityEligible: !isResearch || quality.blockingReasons.length === 0,
    defaultIndexAllowed: !isResearch || (settings.researchVendorIndexingEnabled && quality.eligible),
    defaultSchemaAllowed: true,
    override
  });
  const [products, principal, profileMedia] = isResearch
    ? [[], undefined, []] as const
    : await Promise.all([getVendorCatalogCards(id), getAccountSession(), approvedVendorProfileMedia([id])]);
  const location = vendor.location;
  const storyMedia = vendor.story?.mediaUrl;
  const logoMedia = firstRole(profileMedia, "logo");
  const storefrontMedia = firstRole(profileMedia, "storefront");
  const teamMedia = firstRole(profileMedia, "team");
  const galleryMedia = profileMedia.filter((item) => item.role === "gallery");
  const logoUrl = mediaPath(logoMedia);
  const storefrontUrl = mediaPath(storefrontMedia);
  const teamUrl = mediaPath(teamMedia);
  const website = safeHttpUrl(vendor.research?.onlineShopUrl);
  const directoryProfile = safeHttpUrl(vendor.research?.directoryProfileUrl);
  const vendorUrl = absoluteSeoCanonical(settings.canonicalOrigin, reference, override);
  const fullAddress = addressText(location);
  const mapHref = `/shops/map?vendor=${encodeURIComponent(vendor.id)}`;
  const adviserName = vendor.adviser ?? "Η ομάδα του καταστήματος";
  const intro = isResearch
    ? `Το ${vendor.name} έχει χαρτογραφηθεί ως τοπική επιχείρηση${location?.locality ? ` στην περιοχή ${location.locality}` : ""}. Η συνεργασία με το ΚΟΝΤΑ ΜΟΥ Sparta δεν έχει ακόμη ενεργοποιηθεί.`
    : (vendor.story?.excerpt ?? `Γνώρισε το ${vendor.name}, τους ανθρώπους του και ό,τι μπορείς να βρεις ή να ζητήσεις απευθείας από το κατάστημα.`);
  const structuredImages = [storyMedia, storefrontUrl, logoUrl].filter((value): value is string => Boolean(value)).map((url) => absolutePublicMedia(url, settings.canonicalOrigin));

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${vendorUrl}#business`,
    name: vendor.name,
    url: vendorUrl,
    description: vendor.story?.excerpt ?? (isResearch ? "Χαρτογραφημένη τοπική επιχείρηση από δημόσιες επιχειρηματικές πηγές." : undefined),
    image: structuredImages.length ? structuredImages : undefined,
    logo: logoUrl ? absolutePublicMedia(logoUrl, settings.canonicalOrigin) : undefined,
    telephone: location?.phone,
    email: location?.publicEmail,
    sameAs: [website, directoryProfile].filter(Boolean),
    address: location ? {
      "@type": "PostalAddress",
      streetAddress: [location.addressLine1, location.addressLine2].filter(Boolean).join(", "),
      addressLocality: location.locality,
      postalCode: location.postcode,
      addressCountry: "GR"
    } : undefined,
    geo: location?.coordinates ? {
      "@type": "GeoCoordinates",
      latitude: location.coordinates.latitude,
      longitude: location.coordinates.longitude
    } : undefined
  };

  return (
    <main className={styles.page}>
      {seoControl.schemaAllowed ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c") }} /> : null}
      <div className="announcement">
        {isResearch
          ? "Τοπικός επιχειρηματικός κατάλογος · δημόσια στοιχεία και σαφές στάδιο συνεργασίας."
          : "Local storefront · άνθρωποι, προϊόντα και άμεση τοπική βοήθεια σε μία σελίδα."}
      </div>
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
                  <strong>{isResearch ? "Τοπική επιχείρηση" : "Ενεργός συνεργάτης ΚΟΝΤΑ ΜΟΥ Sparta"}</strong>
                  <span>{location?.locality ? `${location.locality}${location.postcode ? ` · ${location.postcode}` : ""}` : "Σπάρτη & τοπική αγορά"}</span>
                  <span>{logoUrl ? "Εγκεκριμένο λογότυπο του vendor." : "Δεν έχει δημοσιευθεί ακόμη εγκεκριμένο λογότυπο· εμφανίζεται ουδέτερο μονόγραμμα."}</span>
                </div>
              </div>
              <div className="eyebrow">{isResearch ? "Public local-business profile" : "Meet the local shop"}</div>
              <h1>{vendor.name}</h1>
              <p className={styles.intro}>{intro}</p>
              <div className={styles.quickFacts}>
                {!isResearch && <span className={styles.quickFact}>{products.length} διαθέσιμα προϊόντα</span>}
                {vendor.taxonomies.slice(0, 2).map((taxonomy) => (
                  <span className={styles.quickFact} key={`${taxonomy.categorySlug}-${taxonomy.subcategorySlug ?? "all"}`}>
                    {taxonomy.subcategoryLabel ?? taxonomy.categoryLabel}
                  </span>
                ))}
                {location?.verified && <span className={styles.quickFact}>Επαληθευμένη τοποθεσία</span>}
              </div>
              <div className={styles.heroActions}>
                {!isResearch ? (
                  <>
                    <a className="button" href="#products">Δες προϊόντα</a>
                    <a className="button button-secondary" href="#ask-local">Ρώτησε το κατάστημα</a>
                  </>
                ) : (
                  <>
                    {website && <a className="button" href={website} target="_blank" rel="noreferrer">Website επιχείρησης ↗</a>}
                    <a className="button button-secondary" href="#store-info">Στοιχεία & χάρτης</a>
                  </>
                )}
              </div>
            </div>

            <div className={styles.mediaPanel} aria-label={`Φωτογραφία καταστήματος ${vendor.name}`}>
              {storyMedia ? (
                <>
                  <Image src={storyMedia} alt={`Εγκεκριμένη merchant-story εικόνα για ${vendor.name}`} fill priority sizes="(max-width: 980px) 100vw, 54vw" />
                  <div className={styles.mediaOverlay}>
                    <strong>{vendor.name}</strong>
                    <span>Εγκεκριμένο merchant-story visual. Η σελίδα δεν χρησιμοποιεί φωτογραφίες προϊόντων ως υποκατάστατο βιτρίνας.</span>
                  </div>
                </>
              ) : storefrontUrl ? (
                <>
                  <Image src={storefrontUrl} alt={storefrontMedia?.altText ?? `Εγκεκριμένη εικόνα για ${vendor.name}`} fill priority sizes="(max-width: 980px) 100vw, 54vw" />
                  <div className={styles.mediaOverlay}>
                    <strong>{vendor.name}</strong>
                    <span>Εγκεκριμένη φωτογραφία φυσικού καταστήματος.</span>
                  </div>
                </>
              ) : (
                <div className={styles.mediaPlaceholder}>
                  <div className={styles.mediaPlaceholderInner}>
                    <span className={styles.mediaPlaceholderIcon}>⌂</span>
                    <strong>Φωτογραφία φυσικού καταστήματος</strong>
                    <span>Η θέση είναι έτοιμη και θα εμφανίσει φωτογραφία μόλις υπάρχει εγκεκριμένο merchant ή storefront media.</span>
                  </div>
                </div>
              )}
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
          <p className={styles.sectionLead}>Πριν από τον κατάλογο προϊόντων, ο πελάτης βλέπει ποιο κατάστημα επισκέπτεται, ποιος μπορεί να τον βοηθήσει και ποια είναι η σύντομη ιστορία του.</p>
        </div>

        <div className={styles.peopleStoryGrid}>
          <article className={`${styles.card} ${styles.peopleCard}`}>
            <div className="eyebrow">Meet the vendor</div>
            <div className={styles.peopleHead}>
              <div className={styles.personAvatar} aria-hidden={!teamUrl} style={{ overflow: "hidden" }}>
                {teamUrl ? <Image src={teamUrl} alt={teamMedia?.altText ?? `Η ομάδα του ${vendor.name}`} width={76} height={76} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(adviserName)}
              </div>
              <div>
                <h3>{isResearch ? "Η επιχείρηση" : adviserName}</h3>
                <p>{isResearch ? "Δεν έχει δημοσιευθεί ακόμη εγκεκριμένο προφίλ ανθρώπων." : `Τοπική συμβουλή και εξυπηρέτηση από το ${vendor.name}.`}</p>
              </div>
            </div>
            <p className={styles.peopleCopy}>
              {isResearch
                ? "Η δημόσια καταχώριση δεν συμπληρώνει ονόματα ή φωτογραφίες ανθρώπων χωρίς onboarding και έγκριση από την επιχείρηση."
                : `Αν χρειάζεσαι διευκρίνιση πριν αγοράσεις, μπορείς να απευθυνθείς απευθείας στο ${vendor.name} μέσω του Ask Local στο κάτω μέρος της σελίδας.`}
            </p>
          </article>

          <article className={`${styles.card} ${styles.storyCard}`}>
            <div className="eyebrow light">{isResearch ? "Δημόσιο business dossier" : "Η σύντομη ιστορία"}</div>
            <h2>{isResearch ? "Τι γνωρίζουμε δημόσια." : (vendor.story?.title ?? `Λίγα λόγια για το ${vendor.name}.`)}</h2>
            <p>
              {isResearch
                ? "Η σελίδα συγκεντρώνει μόνο δημόσια επιχειρηματικά στοιχεία. Η παρουσία εδώ δεν σημαίνει συνεργασία, έγκριση προϊόντων ή εμπορική σχέση με το ΚΟΝΤΑ ΜΟΥ Sparta."
                : (vendor.story?.excerpt ?? "Δεν έχει δημοσιευθεί ακόμη εγκεκριμένη ιστορία από το κατάστημα. Το ΚΟΝΤΑ ΜΟΥ Sparta δεν εφευρίσκει storytelling ή προσωπικές πληροφορίες όταν ο vendor δεν τις έχει εγκρίνει.")}
            </p>
            {!isResearch && vendor.story && <small className={styles.storyNote}>Merchant story δημοσιευμένο με καταγεγραμμένη έγκριση του vendor.</small>}
            {isResearch && checkedDate(vendor.research?.checkedAt) && <small className={styles.storyNote}>Τελευταίος δημόσιος έλεγχος: {checkedDate(vendor.research?.checkedAt)}</small>}
          </article>
        </div>

        {galleryMedia.length > 0 && <div style={{ marginTop: 28 }}>
          <div className={styles.sectionHeader} style={{ marginBottom: 18 }}>
            <div><div className="eyebrow">Store gallery</div><h2>Μια ματιά στο {vendor.name}</h2></div>
            <p className={styles.sectionLead}>Εγκεκριμένες φωτογραφίες του χώρου και της εμπειρίας του φυσικού καταστήματος.</p>
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
              <div className="eyebrow">Shop this vendor</div>
              <h2 id="vendor-products-title">Προϊόντα από το {vendor.name}</h2>
            </div>
            <p className={styles.sectionLead}>
              {isResearch
                ? "Ο κατάλογος ενεργοποιείται μόνο όταν ολοκληρωθεί onboarding, verification και publication review."
                : "Αναζήτησε μόνο μέσα στο συγκεκριμένο κατάστημα και περιόρισε άμεσα τα αποτελέσματα ανά κατηγορία, μάρκα, χρώμα ή διαθεσιμότητα."}
            </p>
          </div>

          {isResearch ? (
            <div className={styles.researchNotice}>
              <strong>Δεν υπάρχει ενεργός κατάλογος προϊόντων.</strong> Η επιχείρηση είναι ακόμη δημόσια χαρτογραφημένη / προσκεκλημένη και δεν παρουσιάζεται ως ενεργός marketplace vendor.
            </div>
          ) : products.length > 0 ? (
            <VendorCatalogBrowser products={products} vendor={{ name: vendor.name, adviser: vendor.adviser }} />
          ) : (
            <div className={styles.noResults}>
              <h3>Δεν υπάρχουν αυτή τη στιγμή δημοσιευμένα προϊόντα.</h3>
              <p>Το κατάστημα παραμένει ορατό, αλλά μη διαθέσιμες ή μη εγκεκριμένες προσφορές δεν εμφανίζονται ως ενεργός κατάλογος.</p>
              <a className="button" href="#ask-local">Ρώτησε το κατάστημα</a>
            </div>
          )}
        </div>
      </section>

      <section className={styles.askSection} id="ask-local" aria-labelledby="vendor-ask-title">
        <div className="shell">
          <div className={styles.askPanel}>
            <div className={styles.askCopy}>
              <div className="eyebrow">Ask Local · vendor specific</div>
              <h2 id="vendor-ask-title">Δεν το βλέπεις; Ρώτησε.</h2>
              <p>
                {isResearch
                  ? "Αυτό το κατάστημα δεν είναι ακόμη ενεργός συνεργάτης, επομένως ένα Ask Local αίτημα δεν μπορεί να δεθεί σε αυτό. Μπορείς όμως να ζητήσεις το προϊόν από το δίκτυο ενεργών τοπικών συνεργατών."
                  : `Στείλε μια ιδιωτική ερώτηση απευθείας στο ${vendor.name}. Το αίτημα αποθηκεύεται με το συγκεκριμένο vendor ως προτιμώμενο κατάστημα και δεν μετατρέπεται σε δημόσιο bidding.`}
              </p>
              <span className={styles.askVendorBadge}>{isResearch ? "Γενικό Ask Local" : `Δρομολόγηση → ${vendor.name}`}</span>
            </div>
            {isResearch ? (
              <div className={styles.askLoginCard}>
                <h3>Ρώτησε την τοπική αγορά</h3>
                <p>Το αίτημα θα δρομολογηθεί μόνο σε κατάλληλους ενεργούς συνεργάτες, χωρίς να παρουσιάζεται το συγκεκριμένο research listing ως συνεργάτης.</p>
                <a className="button" href="/ask-local">Άνοιξε το Ask Local</a>
              </div>
            ) : (
              <VendorAskLocalPanel vendorId={vendor.id} vendorName={vendor.name} csrfToken={principal?.csrfToken} />
            )}
          </div>
        </div>
      </section>

      <section className={styles.infoSection} id="store-info" aria-labelledby="store-info-title">
        <div className={`shell ${styles.infoShell}`}>
          <div className={styles.sectionHeader}>
            <div>
              <div className="eyebrow">General information</div>
              <h2 id="store-info-title">Κατάστημα, επικοινωνία & φυσική τοποθεσία</h2>
            </div>
            <p className={styles.sectionLead}>Οι πρακτικές πληροφορίες μένουν συγκεντρωμένες στο τέλος της σελίδας, δίπλα στον πραγματικό χάρτη του αποθηκευμένου σημείου.</p>
          </div>

          <div className={styles.infoGrid}>
            <article className={`${styles.card} ${styles.infoCard}`}>
              <div className="eyebrow">Store details</div>
              <dl className={styles.infoList}>
                <div className={styles.infoRow}>
                  <dt>Επιχείρηση</dt>
                  <dd>{vendor.name}</dd>
                </div>
                <div className={styles.infoRow}>
                  <dt>Κατάσταση</dt>
                  <dd>{isResearch ? "Χαρτογραφημένη / προσκεκλημένη · όχι ακόμη ενεργός συνεργάτης" : "Ενεργός συνεργάτης ΚΟΝΤΑ ΜΟΥ Sparta"}</dd>
                </div>
                {location && (
                  <div className={styles.infoRow}>
                    <dt>Φυσικό κατάστημα</dt>
                    <dd>{location.addressLine1}{location.addressLine2 ? <><br />{location.addressLine2}</> : null}<br />{location.postcode} {location.locality}{location.verified ? <><br />Επαληθευμένη τοποθεσία</> : null}</dd>
                  </div>
                )}
                {location?.phone && (
                  <div className={styles.infoRow}>
                    <dt>Τηλέφωνο</dt>
                    <dd><a className="text-link" href={`tel:${location.phone}`}>{location.phone}</a></dd>
                  </div>
                )}
                {location?.publicEmail && (
                  <div className={styles.infoRow}>
                    <dt>Email</dt>
                    <dd><a className="text-link" href={`mailto:${location.publicEmail}`}>{location.publicEmail}</a></dd>
                  </div>
                )}
                {website && (
                  <div className={styles.infoRow}>
                    <dt>Website</dt>
                    <dd><a className="text-link" href={website} target="_blank" rel="noreferrer">{website.replace(/^https?:\/\//, "").replace(/\/$/, "")} ↗</a></dd>
                  </div>
                )}
                {vendor.taxonomies.length > 0 && (
                  <div className={styles.infoRow}>
                    <dt>Κατηγορίες</dt>
                    <dd>
                      <div className={styles.taxonomyList}>
                        {vendor.taxonomies.map((taxonomy) => (
                          <span className={styles.taxonomyTag} key={`${taxonomy.categorySlug}-${taxonomy.subcategorySlug ?? "all"}`}>
                            {taxonomy.categoryLabel}{taxonomy.subcategoryLabel ? ` · ${taxonomy.subcategoryLabel}` : ""}
                          </span>
                        ))}
                      </div>
                    </dd>
                  </div>
                )}
                {isResearch && vendor.research?.directoryCategories && (
                  <div className={styles.infoRow}>
                    <dt>Δημόσια κατηγορία</dt>
                    <dd>{vendor.research.directoryCategories}</dd>
                  </div>
                )}
                {isResearch && directoryProfile && (
                  <div className={styles.infoRow}>
                    <dt>Πηγή</dt>
                    <dd><a className="text-link" href={directoryProfile} target="_blank" rel="noreferrer">Δημόσια καταχώριση ↗</a></dd>
                  </div>
                )}
                {location?.coordinates && (
                  <div className={styles.infoRow}>
                    <dt>Χάρτης</dt>
                    <dd><a className="text-link" href={mapHref}>Άνοιξε σε πλήρη προβολή →</a></dd>
                  </div>
                )}
              </dl>
            </article>

            <VendorLocationMap
              vendorId={vendor.id}
              vendorName={vendor.name}
              address={fullAddress || vendor.name}
              coordinates={location?.coordinates}
            />
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
