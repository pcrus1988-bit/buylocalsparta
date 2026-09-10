import { getPublicVendorDirectoryEntry } from "../lib/public-vendor-directory";

const mediaFrameStyle = {
  width: "96px",
  minWidth: "96px",
  height: "112px",
  overflow: "hidden",
  borderRadius: "14px",
  background: "#e9e2d5",
  display: "grid",
  placeItems: "center"
} as const;

const mediaImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover"
} as const;

export async function ProductVendorHumanCard({
  productId,
  vendorId,
  vendorName,
  adviser
}: {
  productId: string;
  vendorId?: string;
  vendorName?: string;
  adviser?: string;
}) {
  if (!vendorId || !vendorName) {
    return <div className="vendor-card product-vendor-human">
      <div><span className="vendor-avatar">?</span></div>
      <div>
        <div className="eyebrow">Προσωρινά χωρίς διαθέσιμο offer</div>
        <strong>Δεν υπάρχει επιλέξιμο τοπικό κατάστημα αυτή τη στιγμή.</strong>
        <p>Μπορείς να χρησιμοποιήσεις το Ask Local για να περιγράψεις τι χρειάζεσαι.</p>
        <div className="vendor-actions"><a className="button button-secondary" href="/ask-local">Ask Local</a></div>
      </div>
    </div>;
  }

  let presentation: Awaited<ReturnType<typeof getPublicVendorDirectoryEntry>>;
  try {
    presentation = await getPublicVendorDirectoryEntry(vendorId);
  } catch {
    presentation = undefined;
  }
  const mediaSrc = presentation?.mediaId ? `/api/media/${encodeURIComponent(presentation.mediaId)}` : presentation?.story?.mediaUrl;
  const description = presentation?.profileShortDescription
    ?? presentation?.story?.excerpt
    ?? presentation?.profileStory;

  return <div className="vendor-card product-vendor-human">
    <div className={`product-vendor-human-media${mediaSrc ? " has-image" : ""}`} style={mediaFrameStyle}>
      {mediaSrc
        ? <img src={mediaSrc} alt={presentation?.mediaAlt ?? `Το κατάστημα ${vendorName}`} loading="lazy" decoding="async" style={mediaImageStyle} />
        : <span className="vendor-avatar">{(adviser ?? vendorName).slice(0, 1)}</span>}
    </div>
    <div>
      <div className="eyebrow">Τοπικό κατάστημα · πραγματική παρουσία</div>
      <strong><a href={`/vendor/${encodeURIComponent(vendorId)}`}>{vendorName}</a></strong>
      {adviser
        ? <p><strong>{adviser}</strong> μπορεί να σε βοηθήσει με συμβατότητα, χρήση, διαθεσιμότητα ή τη σωστή παραλλαγή.</p>
        : <p>{description ?? "Δες το κατάστημα ή ρώτησέ το πριν ολοκληρώσεις την αγορά."}</p>}
      <div className="vendor-actions">
        <a className="button button-secondary" href={`/ask-local?product=${encodeURIComponent(productId)}&vendor=${encodeURIComponent(vendorId)}`}>{adviser ? `Ρώτησε ${adviser}` : "Ρώτησε το κατάστημα"}</a>
        <a className="text-link" href={`/vendor/${encodeURIComponent(vendorId)}`}>Δες το κατάστημα →</a>
      </div>
    </div>
  </div>;
}
