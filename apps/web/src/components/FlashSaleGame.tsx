"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { FlashSaleState } from "../lib/flash-sale-runtime";
import { useCart } from "./CartProvider";
import styles from "../app/flash-sale/flash-sale.module.css";

function money(minor: number) {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

function friendlyError(message: string): string {
  if (message.includes("POOL_TOO_SMALL")) return "Δεν υπάρχουν αρκετά ασφαλή Flash προϊόντα αυτή τη στιγμή. Δοκίμασε ξανά αργότερα.";
  if (message.includes("ALREADY_DECIDED")) return "Αυτό το προϊόν έχει ήδη κριθεί.";
  if (message.includes("AUTH")) return "Η σύνδεσή σου έληξε. Συνδέσου ξανά για να συνεχίσεις.";
  return "Κάτι δεν πήγε καλά. Η επιλογή σου δεν χάθηκε — δοκίμασε ξανά.";
}

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/account/session", { cache: "no-store" });
  if (!response.ok) throw new Error("AUTH_REQUIRED");
  const body = await response.json() as { csrfToken?: string };
  if (!body.csrfToken) throw new Error("AUTH_REQUIRED");
  return body.csrfToken;
}

async function mutateFlashSale(body: Record<string, unknown>): Promise<FlashSaleState> {
  const csrf = await csrfToken();
  const response = await fetch("/api/flash-sale", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrf },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const payload = await response.json() as { state?: FlashSaleState; error?: string };
  if (!response.ok || !payload.state) throw new Error(payload.error ?? "FLASH_SALE_FAILED");
  return payload.state;
}

export function FlashSaleGame({ initialState }: { initialState?: FlashSaleState }) {
  const [state, setState] = useState<FlashSaleState | undefined>(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragX, setDragX] = useState(0);
  const [showHow, setShowHow] = useState(false);
  const pointerStart = useRef<{ id: number; x: number } | undefined>(undefined);
  const { items: cartItems, addItem, openCart, closeCart } = useCart();

  const undecided = state?.items.filter((item) => !item.decision) ?? [];
  const current = undecided[0];
  const selected = state?.items.filter((item) => item.decision === "selected") ?? [];
  const totalExtraSaving = selected.reduce((sum, item) => sum + item.flashDiscountMinor, 0);
  const flashBasketTotal = selected.reduce((sum, item) => sum + item.flashPriceMinor, 0);

  const nextResetLabel = useMemo(() => {
    if (!state) return "";
    const expires = new Date(state.expiresAt);
    if (!Number.isFinite(expires.getTime())) return "";
    return new Intl.DateTimeFormat("el-GR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Athens" }).format(expires);
  }, [state]);

  const start = useCallback(async () => {
    setBusy(true);
    setError("");
    try { setState(await mutateFlashSale({ action: "start" })); }
    catch (nextError) { setError(friendlyError(nextError instanceof Error ? nextError.message : "FLASH_SALE_FAILED")); }
    finally { setBusy(false); }
  }, []);

  const decide = useCallback(async (decision: "selected" | "skipped") => {
    if (!current || busy) return;
    setBusy(true);
    setError("");
    setDragX(decision === "selected" ? 140 : -140);
    try {
      const next = await mutateFlashSale({ action: "swipe", itemId: current.id, decision });
      if (decision === "selected") {
        const alreadyInCart = cartItems.some((item) => item.canonicalVariantId === current.canonicalVariantId);
        if (!alreadyInCart) {
          addItem({
            canonicalVariantId: current.canonicalVariantId,
            title: current.title,
            priceMinor: current.flashPriceMinor,
            price: money(current.flashPriceMinor),
            imageUrl: current.imageUrl,
            imageAlt: current.title,
            fulfilmentKind: "partner"
          }, 1);
          closeCart();
        }
      }
      window.setTimeout(() => { setState(next); setDragX(0); }, 110);
    } catch (nextError) {
      setDragX(0);
      setError(friendlyError(nextError instanceof Error ? nextError.message : "FLASH_SALE_FAILED"));
    } finally {
      window.setTimeout(() => setBusy(false), 120);
    }
  }, [addItem, busy, cartItems, closeCart, current]);

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (busy || !current) return;
    pointerStart.current = { id: event.pointerId, x: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointerStart.current || pointerStart.current.id !== event.pointerId || busy) return;
    setDragX(Math.max(-170, Math.min(170, event.clientX - pointerStart.current.x)));
  }

  function pointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointerStart.current || pointerStart.current.id !== event.pointerId || busy) return;
    const distance = event.clientX - pointerStart.current.x;
    pointerStart.current = undefined;
    if (distance >= 85) void decide("selected");
    else if (distance <= -85) void decide("skipped");
    else setDragX(0);
  }

  if (!state) {
    return <section className={styles.startPanel} aria-labelledby="flash-start-title">
      <div className={styles.startCopy}>
        <span className={styles.kicker}>Η σημερινή παρτίδα είναι έτοιμη</span>
        <h2 id="flash-start-title">10 προϊόντα. 10 swipes. Μία ευκαιρία σήμερα.</h2>
        <p>Κάθε προϊόν είναι ήδη τουλάχιστον 60% κάτω από MSRP. Ό,τι κρατήσεις με δεξί swipe ξεκλειδώνει ακόμη <strong>20% extra</strong> μέχρι τα μεσάνυχτα.</p>
        <div className={styles.startActions}>
          <button className={styles.primaryButton} type="button" onClick={() => void start()} disabled={busy}>{busy ? "Ετοιμάζουμε τα 10 σου…" : "ΠΑΙΞΕ ΤΩΡΑ"}</button>
          <button className={styles.infoButton} type="button" onClick={() => setShowHow(true)} aria-haspopup="dialog"><span aria-hidden="true">i</span> Πώς παίζεται</button>
        </div>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </div>
      <div className={styles.miniDeck} aria-hidden="true"><span>10</span><small>τυχαίες Flash επιλογές</small></div>
      {showHow ? <HowDialog onClose={() => setShowHow(false)} /> : null}
    </section>;
  }

  if (state.status === "completed" || !current) {
    return <section className={styles.finishPanel} aria-labelledby="flash-finish-title">
      <span className={styles.kicker}>FLASH COMPLETE</span>
      <h2 id="flash-finish-title">Σήμερα ξεκλείδωσες {money(totalExtraSaving)} extra έκπτωση.</h2>
      <p>{selected.length ? `Κράτησες ${selected.length} από τα 10 προϊόντα. Η Flash τιμή τους ισχύει μέχρι τα μεσάνυχτα.` : "Σήμερα δεν κράτησες κάποιο προϊόν. Αύριο σε περιμένουν 10 νέες επιλογές."}</p>
      {selected.length ? <div className={styles.selectedGrid}>
        {selected.map((item) => <article className={styles.selectedItem} key={item.id}>
          <img src={item.imageUrl} alt="" loading="lazy" />
          <div><strong>{item.brand ?? item.title}</strong><small>{item.brand ? item.title : "ΚΟΝΤΑ ΜΟΥ Flash Sale"}</small></div>
          <div className={styles.selectedPrice}><s>{money(item.listedPriceMinor)}</s><strong>{money(item.flashPriceMinor)}</strong></div>
        </article>)}
      </div> : null}
      {selected.length ? <div className={styles.finishTotal}><span>Flash σύνολο</span><strong>{money(flashBasketTotal)}</strong><small>Extra κέρδος {money(totalExtraSaving)}</small></div> : null}
      <div className={styles.finishActions}>
        {selected.length ? <button className={styles.primaryButton} type="button" onClick={openCart}>Δες το καλάθι</button> : <Link className={styles.primaryLink} href="/shop">Συνέχισε στο Shop</Link>}
        <button className={styles.infoButton} type="button" onClick={() => setShowHow(true)}><span aria-hidden="true">i</span> Όροι Flash</button>
      </div>
      <p className={styles.resetNote}>Νέο Flash Sale μετά τις {nextResetLabel || "00:00"} · ώρα Ελλάδας</p>
      {showHow ? <HowDialog onClose={() => setShowHow(false)} /> : null}
    </section>;
  }

  const progress = state.decidedCount + 1;
  const nextCard = undecided[1];
  const rotation = dragX / 24;
  const selectOpacity = Math.max(0, Math.min(1, dragX / 90));
  const skipOpacity = Math.max(0, Math.min(1, -dragX / 90));

  return <section className={styles.gamePanel} aria-labelledby="flash-game-title">
    <header className={styles.gameHeader}>
      <div><span className={styles.kicker}>ΚΟΝΤΑ ΜΟΥ FLASH SALE</span><h2 id="flash-game-title">{progress} / 10</h2></div>
      <button className={styles.circleInfo} type="button" onClick={() => setShowHow(true)} aria-label="Πώς λειτουργεί το Flash Sale">i</button>
    </header>
    <div className={styles.progressTrack} aria-label={`${state.decidedCount} από 10 ολοκληρώθηκαν`}><span style={{ width: `${state.decidedCount * 10}%` }} /></div>

    <div className={styles.deck}>
      {nextCard ? <div className={`${styles.productCard} ${styles.nextCard}`} aria-hidden="true"><img src={nextCard.imageUrl} alt="" /></div> : null}
      <div
        className={`${styles.productCard} ${busy ? styles.busyCard : ""}`}
        style={{ transform: `translateX(${dragX}px) rotate(${rotation}deg)` }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={() => { pointerStart.current = undefined; setDragX(0); }}
      >
        <div className={styles.skipStamp} style={{ opacity: skipOpacity }}>ΟΧΙ ΓΙΑ ΜΕΝΑ</div>
        <div className={styles.wantStamp} style={{ opacity: selectOpacity }}>ΤΟ ΘΕΛΩ</div>
        <div className={styles.imageStage}>
          <img src={current.imageUrl} alt={current.title} draggable={false} />
          <span className={styles.discountBadge}>-{current.currentDiscountPct}%</span>
          <span className={styles.flashBadge}>FLASH<br /><strong>-20% EXTRA</strong></span>
        </div>
        <div className={styles.cardCopy}>
          {current.brand ? <span className={styles.brand}>{current.brand}</span> : null}
          <h3>{current.title}</h3>
          <div className={styles.priceRows}>
            <span><small>MSRP</small><s>{money(current.msrpMinor)}</s></span>
            <span><small>ΚΟΝΤΑ ΜΟΥ</small><s>{money(current.listedPriceMinor)}</s></span>
            <span className={styles.flashPrice}><small>FLASH PRICE</small><strong>{money(current.flashPriceMinor)}</strong></span>
          </div>
          <p>Δεξιά για να το κρατήσεις · αριστερά για το επόμενο.</p>
        </div>
      </div>
    </div>

    <div className={styles.swipeActions} aria-label="Επιλογή προϊόντος">
      <button className={styles.noButton} type="button" onClick={() => void decide("skipped")} disabled={busy}><span aria-hidden="true">←</span><strong>ΟΧΙ ΓΙΑ ΜΕΝΑ</strong></button>
      <button className={styles.yesButton} type="button" onClick={() => void decide("selected")} disabled={busy}><strong>ΤΟ ΘΕΛΩ</strong><span aria-hidden="true">→</span></button>
    </div>
    <p className={styles.liveStatus} aria-live="polite">{busy ? "Κλειδώνουμε την επιλογή σου…" : error}</p>
    {showHow ? <HowDialog onClose={() => setShowHow(false)} /> : null}
  </section>;
}

function HowDialog({ onClose }: { onClose: () => void }) {
  return <div className={styles.dialogBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={styles.howDialog} role="dialog" aria-modal="true" aria-labelledby="flash-how-title">
      <button className={styles.dialogClose} type="button" onClick={onClose} aria-label="Κλείσιμο">×</button>
      <span className={styles.kicker}>ΠΩΣ ΠΑΙΖΕΤΑΙ</span>
      <h2 id="flash-how-title">Το σημερινό Flash Sale σε 4 κινήσεις.</h2>
      <ol>
        <li><strong>10 τυχαία προϊόντα.</strong> Όλα €100–€500 και ήδη τουλάχιστον -60% από MSRP.</li>
        <li><strong>Swipe αριστερά</strong> αν δεν σε ενδιαφέρει. Δεν επιστρέφει σήμερα.</li>
        <li><strong>Swipe δεξιά</strong> για να το κρατήσεις. Μπαίνει στο καλάθι και ξεκλειδώνει extra -20% για 1 τεμάχιο.</li>
        <li><strong>Μέχρι τα μεσάνυχτα.</strong> Η Flash έκπτωση επιβεβαιώνεται ξανά με διαθεσιμότητα και ασφαλή τιμή στο checkout.</li>
      </ol>
      <p>Έχεις μία συμμετοχή ανά λογαριασμό κάθε ημέρα. Η επιλογή και η έκπτωση ελέγχονται από το ΚΟΝΤΑ ΜΟΥ — όχι από cookie του browser.</p>
      <button className={styles.primaryButton} type="button" onClick={onClose}>Το κατάλαβα</button>
    </section>
  </div>;
}
