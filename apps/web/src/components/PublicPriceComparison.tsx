import { formatMoney, money } from "@buy-local-sparta/core";
import { getVisibleOfferMsrpMinor } from "../lib/public-offer-msrp";
import { publicPriceBadgeLabel, publicSavingsLabel, type PriceHighlightKind } from "../lib/public-price-presentation";

export async function PublicPriceComparison({
  productId,
  vendorId,
  retailPriceMinor,
  retailLabel,
  comparisonEnabled = true,
  highlightKind = "msrp-savings"
}: {
  productId: string;
  vendorId?: string;
  retailPriceMinor: number;
  retailLabel: string;
  comparisonEnabled?: boolean;
  /**
   * `sale` is reserved for an explicit future SALE/promotion state. The normal
   * MSRP comparison must remain `msrp-savings` even when the saving is large.
   */
  highlightKind?: PriceHighlightKind;
}) {
  // This is an MSRP/RRP comparison, never a claim about a previous KONTA MOU selling price.
  const msrpMinor = comparisonEnabled
    ? await getVisibleOfferMsrpMinor(productId, vendorId, retailPriceMinor)
    : undefined;
  const savingLabel = msrpMinor === undefined ? undefined : publicSavingsLabel(msrpMinor, retailPriceMinor);
  const sale = highlightKind === "sale";

  return <div aria-label="Τιμή προϊόντος" data-price-highlight-kind={savingLabel ? highlightKind : undefined}>
    {msrpMinor !== undefined ? (
      <div style={{ display: "grid", gap: 4, marginBottom: 3 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <s aria-label={`Προτεινόμενη λιανική ${formatMoney(money(msrpMinor))}`} style={{ opacity: 0.58, fontWeight: 600 }}>
            ΠΛΤ {formatMoney(money(msrpMinor))}
          </s>
          {sale && savingLabel ? (
            <span
              aria-label={`SALE, όφελος ${savingLabel}% σε σχέση με την προτεινόμενη λιανική`}
              style={{ fontSize: "0.82rem", fontWeight: 900, borderRadius: 999, padding: "4px 9px", background: "var(--terracotta, #aa664f)", color: "white" }}
            >
              {publicPriceBadgeLabel("sale", savingLabel)}
            </span>
          ) : null}
        </div>
        {!sale && savingLabel ? (
          <span
            aria-label={`Όφελος ${savingLabel}% σε σχέση με την προτεινόμενη λιανική`}
            style={{ fontSize: "0.92rem", fontWeight: 900 }}
          >
            Κερδίζεις {savingLabel}% έναντι ΠΛΤ
          </span>
        ) : null}
      </div>
    ) : null}
    <div className="detail-price">{retailLabel}</div>
  </div>;
}
