"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "./CartProvider";

type SharedLookItem = Readonly<{
  id: string;
  title: string;
  price: string;
  priceMinor: number;
  imageSrc?: string;
}>;

export function SharedLookActions({
  items,
  vendorId
}: {
  items: readonly SharedLookItem[];
  vendorId: string;
}) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  function addLookToCart() {
    for (const item of items) {
      addItem({
        canonicalVariantId: item.id,
        title: item.title,
        priceMinor: item.priceMinor,
        price: item.price,
        imageUrl: item.imageSrc,
        imageAlt: item.title
      });
    }
    setAdded(true);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <button
        type="button"
        onClick={addLookToCart}
        style={{
          border: 0,
          borderRadius: 999,
          padding: "15px 20px",
          fontWeight: 900,
          fontSize: "1rem",
          cursor: "pointer",
          background: "#151515",
          color: "#fff"
        }}
      >
        {added ? "Το look προστέθηκε ✓" : "Προσθήκη look στο καλάθι"}
      </button>

      {added ? (
        <Link
          href="/cart"
          style={{
            textAlign: "center",
            fontWeight: 800,
            textDecoration: "none",
            color: "inherit"
          }}
        >
          Άνοιξε το καλάθι →
        </Link>
      ) : null}

      <Link
        href={`/fitting-room?vendor=${encodeURIComponent(vendorId)}`}
        style={{
          textAlign: "center",
          border: "1px solid rgba(18,18,18,.18)",
          borderRadius: 999,
          padding: "14px 18px",
          fontWeight: 900,
          textDecoration: "none",
          color: "inherit",
          background: "rgba(255,255,255,.64)"
        }}
      >
        Φτιάξε το δικό σου look →
      </Link>

      <small style={{ textAlign: "center", opacity: .64, lineHeight: 1.45 }}>
        Η τελική τιμή και διαθεσιμότητα κάθε προϊόντος επιβεβαιώνονται ξανά στο checkout.
      </small>
    </div>
  );
}
