import type { CatalogCard } from "../lib/catalog-view";
import { storefrontCategoryForCode } from "../lib/storefront-taxonomy";

export function CatalogProductCard({ product, index = 0, vendorContext }: { product: CatalogCard; index?: number; vendorContext?: Readonly<{ name: string; adviser?: string }> }) {
  const category = storefrontCategoryForCode(product.categoryCode);
  const vendorName = vendorContext?.name ?? product.vendorName;
  const adviser = vendorContext?.adviser ?? product.adviser;
  const vendorHref = !vendorContext && product.vendorId ? `/vendor/${product.vendorId}` : undefined;

  return (
    <article className="product-card">
      <a href={`/product/${product.id}`} className={`product-art ${category.artClass}`} aria-label={`Δες ${product.title}`}>
        <span className="product-badge">{product.available ? "Διαθέσιμο σήμερα" : "Προσωρινά μη διαθέσιμο"}</span>
        <span className="art-category">{category.name}</span>
        <span className="art-symbol" aria-hidden="true">{category.symbol}</span>
        <span className="art-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      </a>
      <div className="product-body">
        <div className="eyebrow">{category.label}</div>
        <h3><a href={`/product/${product.id}`}>{product.title}</a></h3>
        {vendorName && adviser ? (
          <p className="partner">Συμβουλή & παραλαβή από <strong>{vendorHref ? <a href={vendorHref}>{vendorName}</a> : vendorName}</strong> · Ρώτησε {adviser}.</p>
        ) : vendorName ? (
          <p className="partner">Εξυπηρέτηση από <strong>{vendorHref ? <a href={vendorHref}>{vendorName}</a> : vendorName}</strong>.</p>
        ) : (
          <p className="partner">Δεν υπάρχει αυτή τη στιγμή επιλέξιμος τοπικός συνεργάτης εκπλήρωσης.</p>
        )}
        <div className="product-bottom"><div className="price">{product.price}</div><a className="round-add" href={`/product/${product.id}`} aria-label={`Δες ${product.title}`}>→</a></div>
      </div>
    </article>
  );
}
