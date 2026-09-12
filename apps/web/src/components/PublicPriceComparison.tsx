import { formatMoney, money } from "@buy-local-sparta/core";
import { getVisibleOfferMsrpMinor } from "../lib/public-offer-msrp";

function savingsPercent(msrpMinor: number, retailPriceMinor: number): number | undefined {
  if (!Number.isSafeInteger(msrpMinor) || !Number.isSafeInteger(retailPriceMinor) || msrpMinor <= retailPriceMinor || retailPriceMinor < 0) return undefined;
  return Math.round(((msrpMinor - retailPriceMinor) / msrpMinor) * 1000) / 10;
}

export async function PublicPriceComparison({
  productId,
  vendorId,
  retailPriceMinor,
  retailLabel,
  comparisonEnabled = true
}: {
  productId: string;
  vendorId?: string;
  retailPriceMinor: number;
  retailLabel: string;
  comparisonEnabled?: boolean;
}) {
  const msrpMinor = comparisonEnabled
    ? await getVisibleOfferMsrpMinor(productId, vendorId, retailPriceMinor)
    : undefined;
  const saving = msrpMinor === undefined ? undefined : savingsPercent(msrpMinor, retailPriceMinor);

  return <div aria-label="Τιμή προϊόντος">
    {msrpMinor !== undefined ? (
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 2 }}>
        <s aria-label={`Προτεινόμενη λιανική ${formatMoney(money(msrpMinor))}`} style={{ opacity: 0.58, fontWeight: 600 }}>
          {formatMoney(money(msrpMinor))}
        </s>
        {saving !== undefined ? (
          <span
            aria-label={`Όφελος ${saving}% σε σχέση με την προτεινόμενη λιανική`}
            style={{ fontSize: "0.82rem", fontWeight: 850, borderRadius: 999, padding: "3px 8px", background: "var(--paper, #f4f1ea)" }}
          >
            −{saving.toLocaleString("el-GR", { maximumFractionDigits: 1 })}%
          </span>
        ) : null}
      </div>
    ) : null}
    <div className="detail-price">{retailLabel}</div>
  </div>;
}
