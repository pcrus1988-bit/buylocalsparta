import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "../../../../../components/SiteHeader";
import { SiteFooter } from "../../../../../components/SiteFooter";
import { VendorExternalWebsiteFrame } from "../../../../../components/VendorExternalWebsiteFrame";
import { getPublicHubClaim,listHubClaimMedia } from "../../../../../lib/hub-claim-runtime";
import { HubClaimInquiryForm } from "../../../../../components/HubClaimInquiryForm";
import styles from "../../../claim/claim.module.css";

type Params = { params: Promise<{ hubSlug: string; id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { hubSlug, id } = await params;
  const profile = await getPublicHubClaim(hubSlug, id);
  if (!profile) return { title: "Καταχώριση μη διαθέσιμη · KONTA MOY", robots: { index: false, follow: false } };
  const canonical = "/hubs/" + hubSlug + "/business/" + id;
  const description = profile.businessName + " · " + profile.category + " στο KONTA MOY HUB " + profile.hubCity + ". Επαληθευμένη δωρεάν καταχώριση επιχείρησης.";
  return {
    title: profile.businessName + " · HUB " + profile.hubCity + " · KONTA MOY",
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: { title: profile.businessName + " · KONTA MOY", description, url: canonical, type: "website" }
  };
}

export default async function PublicHubClaimPage({ params }: Params) {
  const { hubSlug, id } = await params;
  const profile = await getPublicHubClaim(hubSlug, id);
  if (!profile) notFound();
  const media=await listHubClaimMedia(profile.id,true);
  const logo=media.find(m=>m.role==="logo"),cover=media.find(m=>m.role==="storefront");
  const gallery=media.filter(m=>m.role==="gallery").slice(0,4);
  const mapUrl="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(profile.address+" "+profile.postcode+" "+profile.hubCity);

  return <main>
    <SiteHeader compact />
    <section className="shell">
      <div className={styles.hero}>
        <div className={styles.kicker}>KONTA MOY · HUB {profile.hubCity}</div>
        {logo&&<img src={"/api/hubs/claim/media/"+logo.id} alt={logo.altText} className={styles.logo} loading="lazy"/>}
        <h1 className={styles.title}>{profile.businessName}</h1>
        <p className={styles.lead}>{profile.category} · {profile.hubCity}, {profile.hubRegion}</p>
      </div>
      {cover&&<img src={"/api/hubs/claim/media/"+cover.id} alt={cover.altText} className={styles.cover} loading="lazy"/>}
      <div className={styles.grid}>
        <article className={styles.panel}>
          <h2>Στοιχεία επιχείρησης</h2>
          <p className={styles.details}><strong>Κατηγορία:</strong> {profile.category}</p>
          <p className={styles.details}><strong>Περιοχή:</strong> {profile.hubCity} · {profile.postcode}</p>
          <p className={styles.details}><strong>Διεύθυνση:</strong> {profile.address}</p>
          <p className={styles.details}><strong>Τηλέφωνο:</strong> <a href={"tel:"+profile.phone.replace(/[^+0-9]/g,"")}>{profile.phone}</a></p>
          <p><a href={mapUrl} target="_blank" rel="noopener noreferrer">Προβολή σε χάρτη ↗</a></p>
          {profile.openingHours&&<><h3>Ωράριο λειτουργίας</h3><p className={styles.multiline}>{profile.openingHours}</p></>}
          {profile.description&&<><h3>Η επιχείρησή μας</h3><p className={styles.multiline}>{profile.description}</p></>}
          {profile.instagramUrl&&<p><a href={profile.instagramUrl} rel="noopener noreferrer nofollow" target="_blank">Instagram ↗</a></p>}
          {profile.facebookUrl&&<p><a href={profile.facebookUrl} rel="noopener noreferrer nofollow" target="_blank">Facebook ↗</a></p>}
          {profile.website && <p className={styles.details}><a href={profile.website} target="_blank" rel="noopener noreferrer nofollow">Ιστοσελίδα επιχείρησης ↗</a></p>}
        </article>
        <aside className={styles.panel}>
          <h2>Επαληθευμένη παρουσία</h2>
          <p className={styles.hint}>Η επιχείρηση έχει επιβεβαιώσει τη δωρεάν παρουσία της στο KONTA MOY. Πρόκειται για καταχώριση καταλόγου, όχι για ενεργό ηλεκτρονικό κατάστημα ή δυνατότητα αγοράς.</p>
          <div className={styles.actions}><Link className={styles.button + " " + styles.secondary} href="/hubs/join">Γνώρισε το KONTA MOY HUB</Link></div>
        </aside>
      </div>
      {gallery.length>0&&<section className={styles.panel}><h2>Εικόνες επιχείρησης</h2><div className={styles.mediaGrid}>{gallery.map(asset=><img key={asset.id} src={"/api/hubs/claim/media/"+asset.id} alt={asset.altText} loading="lazy"/>)}</div></section>}
      <HubClaimInquiryForm id={profile.id}/>
      {profile.websiteEmbedEnabled && profile.website && <section className={styles.panel} style={{ marginTop: 20 }} aria-labelledby="claim-website-title">
        <h2 id="claim-website-title">Ιστοσελίδα επιχείρησης</h2>
        <VendorExternalWebsiteFrame url={profile.website} vendorName={profile.businessName} />
      </section>}
    </section>
    <SiteFooter />
  </main>;
}
