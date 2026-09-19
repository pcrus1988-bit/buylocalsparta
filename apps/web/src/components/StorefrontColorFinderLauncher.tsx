"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { resolveColorFinderContext, type ColorFinderContext } from "../lib/color-finder-context";
import styles from "./StorefrontColorFinderLauncher.module.css";

type CategoryOption = Readonly<{ value: string; label: string; count: number }>;

type FinderContext = Readonly<{
  category: CategoryOption;
  presentation: ColorFinderContext;
  route: string;
}>;

const ICON_SRC = "data:image/webp;base64,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";

const HIDDEN_SESSION_KEY = "kontamou-color-finder-hidden";
const POSITION_SESSION_KEY = "kontamou-color-finder-position";
const DRAG_THRESHOLD_PX = 6;
const EDGE_MARGIN_PX = 10;

type FloatingPosition = Readonly<{ x: number; y: number }>;
type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
};

function clampPosition(position: FloatingPosition, width: number, height: number): FloatingPosition {
  const x = Math.min(Math.max(EDGE_MARGIN_PX, position.x), Math.max(EDGE_MARGIN_PX, window.innerWidth - width - EDGE_MARGIN_PX));
  const y = Math.min(Math.max(EDGE_MARGIN_PX, position.y), Math.max(EDGE_MARGIN_PX, window.innerHeight - height - EDGE_MARGIN_PX));
  return { x, y };
}

function readStoredPosition(): FloatingPosition | null {
  try {
    const raw = window.sessionStorage.getItem(POSITION_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FloatingPosition>;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return { x: Number(parsed.x), y: Number(parsed.y) };
  } catch {
    return null;
  }
}


const CONTEXT_PRIORITY: Readonly<Record<ColorFinderContext["key"], number>> = {
  nails: 0,
  lips: 1,
  eyes: 2,
  makeup: 3,
  footwear: 4,
  bags: 5,
  fashion: 6,
  home: 7,
  generic: 99
};

function buildFinderContext(category: CategoryOption, vendorId?: string): FinderContext {
  const presentation = resolveColorFinderContext(category.value, category.label);
  const params = new URLSearchParams({
    category: category.value,
    categoryLabel: category.label,
    source: "storefront"
  });
  if (vendorId) {
    params.set("vendor", vendorId);
    params.set("returnTo", "/vendor/" + encodeURIComponent(vendorId) + "#products");
  }
  return {
    category,
    presentation,
    route: "/color-finder?" + params.toString()
  };
}

function suitableCandidates(
  categories: readonly CategoryOption[],
  activeCategoryGroup: readonly string[],
  vendorId?: string
): readonly FinderContext[] {
  const group = activeCategoryGroup.length ? new Set(activeCategoryGroup) : undefined;
  return categories
    .filter((entry) => !group || group.has(entry.value))
    .map((entry) => buildFinderContext(entry, vendorId))
    .filter((entry) => entry.presentation.key !== "generic")
    .sort((left, right) =>
      CONTEXT_PRIORITY[left.presentation.key] - CONTEXT_PRIORITY[right.presentation.key]
      || right.category.count - left.category.count
      || left.category.label.localeCompare(right.category.label, "el")
    );
}

function activeFinderContext(
  categories: readonly CategoryOption[],
  activeCategory: string,
  activeCategoryGroup: readonly string[],
  vendorId: string | undefined,
  colorFacetCount: number
): FinderContext | null {
  const requestedValue = activeCategoryGroup.length === 1
    ? activeCategoryGroup[0]
    : activeCategoryGroup.length === 0 && activeCategory !== "all"
      ? activeCategory
      : undefined;
  if (!requestedValue) return null;

  const category = categories.find((entry) => entry.value === requestedValue);
  if (!category) return null;
  const context = buildFinderContext(category, vendorId);

  // Known color-led families remain eligible even while the generic storefront
  // color facet is temporarily incomplete. Unknown categories need real color
  // facet evidence before we surface Color Finder.
  return context.presentation.key !== "generic" || colorFacetCount >= 2 ? context : null;
}

export function StorefrontColorFinderLauncher({
  vendorId,
  categories,
  activeCategory,
  activeCategoryGroup,
  colorFacetCount
}: {
  vendorId?: string;
  categories: readonly CategoryOption[];
  activeCategory: string;
  activeCategoryGroup: readonly string[];
  colorFacetCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const floatingRef = useRef<HTMLDivElement | null>(null);
  const candidates = useMemo(
    () => suitableCandidates(categories, activeCategoryGroup, vendorId),
    [activeCategoryGroup, categories, vendorId]
  );
  const activeContext = useMemo(
    () => activeFinderContext(categories, activeCategory, activeCategoryGroup, vendorId, colorFacetCount),
    [activeCategory, activeCategoryGroup, categories, colorFacetCount, vendorId]
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const context = activeContext
    ?? candidates.find((entry) => entry.category.value === selectedCategory)
    ?? candidates[0]
    ?? null;

  useEffect(() => {
    try {
      setHidden(window.sessionStorage.getItem(HIDDEN_SESSION_KEY) === "1");
      setPosition(readStoredPosition());
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    const onResize = () => {
      const element = floatingRef.current;
      if (!element) return;
      setPosition((currentPosition) => {
        if (!currentPosition) return null;
        const next = clampPosition(currentPosition, element.offsetWidth, element.offsetHeight);
        try {
          window.sessionStorage.setItem(POSITION_SESSION_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (activeContext) setSelectedCategory(activeContext.category.value);
  }, [activeContext]);

  if (!context || !storageReady || hidden) return null;

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const element = floatingRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const element = floatingRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !element) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) drag.moved = true;
    if (!drag.moved) return;
    event.preventDefault();
    setPosition(clampPosition(
      { x: drag.originX + dx, y: drag.originY + dy },
      element.offsetWidth,
      element.offsetHeight
    ));
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    if (drag.moved) {
      event.preventDefault();
      const element = floatingRef.current;
      if (element) {
        const rect = element.getBoundingClientRect();
        const next = clampPosition({ x: rect.left, y: rect.top }, rect.width, rect.height);
        setPosition(next);
        try {
          window.sessionStorage.setItem(POSITION_SESSION_KEY, JSON.stringify(next));
        } catch {}
      }
      return;
    }
    setOpen(true);
  };

  const hideLauncher = () => {
    setOpen(false);
    setHidden(true);
    try {
      window.sessionStorage.setItem(HIDDEN_SESSION_KEY, "1");
    } catch {}
  };

  const showGateway = !activeContext && candidates.length > 1;
  const visibleCandidates = candidates.slice(0, 8);

  return (
    <>
      <div
        ref={floatingRef}
        className={position ? styles.floatingDockPositioned : styles.floatingDock}
        style={position ? { left: position.x, top: position.y } : undefined}
      >
        <button
          className={styles.floatingButton}
          type="button"
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={() => { dragRef.current = null; }}
          aria-label={showGateway
            ? "Άνοιγμα ή μετακίνηση ΚΟΝΤΑ ΜΟΥ Color Finder"
            : "Άνοιγμα ή μετακίνηση ΚΟΝΤΑ ΜΟΥ Color Finder · " + context.presentation.studioLabel}
          title={showGateway ? "KONTA MOY Color Finder · σύρε για μετακίνηση" : "Color Finder · " + context.presentation.studioLabel + " · σύρε για μετακίνηση"}
        >
          <img src={ICON_SRC} alt="" width={72} height={72} aria-hidden="true" draggable={false} />
          <span className={styles.pulse} aria-hidden="true" />
        </button>
        <button className={styles.hideButton} type="button" onClick={hideLauncher} aria-label="Απόκρυψη Color Finder">
          Hide
        </button>
      </div>

      {open ? (
        <div className={styles.layer} role="presentation">
          <button
            className={styles.backdrop}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Κλείσιμο Color Finder"
          />
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="storefront-color-finder-title">
            <button className={styles.close} type="button" onClick={() => setOpen(false)} aria-label="Κλείσιμο">×</button>
            <div className={styles.iconWrap}>
              <img src={ICON_SRC} alt="" width={96} height={96} aria-hidden="true" />
            </div>
            <div className={styles.eyebrow}>ΚΟΝΤΑ ΜΟΥ · COLOR FINDER{showGateway ? "" : " · " + context.presentation.studioLabel}</div>
            <h2 id="storefront-color-finder-title">
              {showGateway ? "Βρες πρώτα το χρώμα. Μετά το προϊόν." : context.presentation.shortcutTitle}
            </h2>
            <p>
              {showGateway
                ? "Αυτό το κατάστημα έχει κατηγορίες όπου το χρώμα είναι ουσιαστικό μέρος της επιλογής. Διάλεξε πού θέλεις να ψάξεις και το Color Finder θα ανοίξει ήδη περιορισμένο εκεί."
                : <><strong>{context.category.label}</strong> · {context.presentation.shortcutBody}</>}
            </p>

            {showGateway ? (
              <div className={styles.choices} role="group" aria-label="Επιλογή Color Finder κατηγορίας">
                {visibleCandidates.map((candidate) => {
                  const selected = candidate.category.value === context.category.value;
                  return (
                    <button
                      type="button"
                      className={selected ? styles.choiceActive : styles.choice}
                      onClick={() => setSelectedCategory(candidate.category.value)}
                      aria-pressed={selected}
                      key={candidate.category.value}
                    >
                      <span>{candidate.presentation.studioLabel}</span>
                      <strong>{candidate.category.label}</strong>
                      <small>{candidate.category.count} προϊόντα</small>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className={styles.info}>
              <span>{showGateway ? "Επιλεγμένο Color Finder" : "Προσαρμοσμένο στην κατηγορία"}</span>
              <strong>{context.presentation.studioLabel}</strong>
              <small>{context.presentation.photoTitle} Αντιστοιχίζουμε μόνο προϊόντα της επιλεγμένης κατηγορίας με αξιόπιστα χρωματικά δεδομένα και όριο 49% και πάνω.</small>
            </div>
            <div className={styles.actions}>
              <button className={styles.secondary} type="button" onClick={() => setOpen(false)}>Συνέχισε στο κατάστημα</button>
              <button className={styles.primary} type="button" onClick={() => window.location.assign(context.route)}>
                Άνοιγμα {context.presentation.studioLabel} →
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
