"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useFormStatus } from "react-dom";
import type { AttributeTrainerCard, AttributeTrainerTarget } from "../../../../lib/admin-catalogue-attribute-trainer";
import type { AttributeTrainerCategoryOption } from "../../../../lib/admin-catalogue-attribute-trainer-context";
import type { CatalogueProductTypeOption } from "../../../../lib/admin-catalogue-product-type-options";

type Action = (formData: FormData) => Promise<void>;
type SwipeDirection = "left" | "right" | "up" | "down";
type DragState = Readonly<{ x: number; y: number; dragging: boolean; settling: boolean }>;

const SWIPE_THRESHOLD = 64;
const RESTING_DRAG: DragState = { x: 0, y: 0, dragging: false, settling: false };

type Props = Readonly<{
  cards: readonly AttributeTrainerCard[];
  targets: readonly AttributeTrainerTarget[];
  productTypes: readonly CatalogueProductTypeOption[];
  categories: readonly AttributeTrainerCategoryOption[];
  canWrite: boolean;
  approveAction: Action;
  createAction: Action;
  rejectAction: Action;
}>;

export function AttributeTrainerDeckV2({
  cards,
  targets,
  productTypes,
  categories,
  canWrite,
  approveAction,
  createAction,
  rejectAction
}: Props) {
  const [index, setIndex] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [createProductTypeId, setCreateProductTypeId] = useState("");
  const [createName, setCreateName] = useState("");
  const [dataType, setDataType] = useState("multienum");
  const [valueLevel, setValueLevel] = useState("variant");
  const [drag, setDrag] = useState<DragState>(RESTING_DRAG);
  const start = useRef<{ x: number; y: number } | null>(null);
  const gestureLocked = useRef(false);
  const approveForm = useRef<HTMLFormElement>(null);
  const rejectForm = useRef<HTMLFormElement>(null);

  const card = cards[index];
  const primary = card?.suggestions[0];

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === categoryId),
    [categories, categoryId]
  );

  const filteredTargets = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("el-GR");
    return targets
      .filter((target) => !needle || [target.attributeCode, target.productTypeCode, target.productTypeName]
        .some((value) => value.toLocaleLowerCase("el-GR").includes(needle)))
      .slice(0, 30);
  }, [query, targets]);

  if (!card) {
    return <div className="workspace-queue-card" style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
      <strong>Batch complete</strong>
      <p>You have reviewed every card in this batch. Reload the page to pull the next highest-impact contexts.</p>
    </div>;
  }

  const canReject = canWrite && card.scopeKind !== "unscoped";
  const canDirectApprove = canWrite && card.actionable && Boolean(primary);
  const taxonomyNeedsCategory = card.scopeKind === "taxonomy_node";
  const manualCanSave = canWrite && card.scopeKind !== "unscoped" && (!taxonomyNeedsCategory || Boolean(categoryId));

  const resetDrag = () => setDrag(RESTING_DRAG);

  const initialCategoryId = () => {
    if (card.scopeKind !== "taxonomy_node") return "";
    return categories.find((category) => category.code === card.approvedCategoryCode)?.id ?? "";
  };

  const openManual = () => {
    setQuery(card.sourceAttributeKey);
    setCreateName(card.sourceAttributeKey);
    const nextCategoryId = initialCategoryId();
    setCategoryId(nextCategoryId);
    const preferredProductType = primary?.productTypeId
      ?? categories.find((category) => category.id === nextCategoryId)?.productTypeIds[0]
      ?? productTypes[0]?.id
      ?? "";
    setCreateProductTypeId(preferredProductType);
    setManualOpen(true);
  };

  const closeManual = () => {
    setManualOpen(false);
    setQuery("");
  };

  const skip = () => {
    closeManual();
    setIndex((value) => Math.min(value + 1, cards.length));
  };

  const animateThen = (direction: SwipeDirection, action: () => void) => {
    if (gestureLocked.current) return;
    gestureLocked.current = true;
    const target = direction === "left"
      ? { x: -520, y: drag.y }
      : direction === "right"
        ? { x: 520, y: drag.y }
        : direction === "up"
          ? { x: drag.x, y: -190 }
          : { x: drag.x, y: 190 };
    setDrag({ ...target, dragging: false, settling: true });
    window.setTimeout(() => {
      action();
      setDrag(RESTING_DRAG);
      gestureLocked.current = false;
    }, 150);
  };

  const swipeApprove = () => {
    if (!canWrite) { resetDrag(); return; }
    if (!canDirectApprove) {
      animateThen("up", openManual);
      return;
    }
    animateThen("left", () => approveForm.current?.requestSubmit());
  };

  const swipeReject = () => {
    if (!canReject) { resetDrag(); return; }
    animateThen("right", () => rejectForm.current?.requestSubmit());
  };

  const swipeManual = () => {
    if (!canWrite) { resetDrag(); return; }
    animateThen("up", openManual);
  };

  const swipeLater = () => animateThen("down", skip);

  const commitGesture = (dx: number, dy: number): boolean => {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return false;
    if (Math.abs(dx) > Math.abs(dy)) {
      dx < 0 ? swipeApprove() : swipeReject();
    } else {
      dy < 0 ? swipeManual() : swipeLater();
    }
    return true;
  };

  const releaseCapture = (event: ReactPointerEvent<HTMLElement>) => {
    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Some Android browsers release capture themselves after a fast fling.
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (manualOpen || gestureLocked.current) return;
    start.current = { x: event.clientX, y: event.clientY };
    setDrag({ x: 0, y: 0, dragging: true, settling: false });
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* capture is optional */ }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const origin = start.current;
    if (!origin || gestureLocked.current) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    setDrag({ x: dx, y: dy, dragging: true, settling: false });

    // Commit as soon as the threshold is crossed. Android/Chrome can stop sending
    // pointerup after a fast fling or after the element moves under the finger.
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_THRESHOLD) {
      start.current = null;
      releaseCapture(event);
      commitGesture(dx, dy);
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const origin = start.current;
    start.current = null;
    releaseCapture(event);
    if (!origin || gestureLocked.current) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (!commitGesture(dx, dy)) resetDrag();
  };

  const handlePointerCancel = () => {
    start.current = null;
    if (!gestureLocked.current) resetDrag();
  };

  const rotation = Math.max(-7, Math.min(7, drag.x / 34));
  const opacity = drag.settling && Math.abs(drag.x) > 300 ? 0.15 : 1;
  const transform = `translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${rotation}deg)`;
  const transition = drag.dragging ? "none" : "transform 150ms ease-out, opacity 150ms ease-out";

  return <>
    <div style={{ display: "grid", gap: "0.8rem", justifyItems: "center" }}>
      <div style={{ width: "100%", display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" }}>
        <span className="eyebrow">Card {Math.min(index + 1, cards.length)} / {cards.length}</span>
        <span style={{ fontSize: "0.86rem", opacity: 0.72 }}>{card.observationCount.toLocaleString("el-GR")} observations · {card.productCount.toLocaleString("el-GR")} products</span>
      </div>

      <article
        className="workspace-queue-card"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{
          width: "min(100%, 760px)",
          minHeight: "430px",
          padding: "1.25rem",
          touchAction: "none",
          userSelect: "none",
          cursor: drag.dragging ? "grabbing" : "grab",
          transform,
          opacity,
          transition,
          willChange: "transform, opacity",
          position: "relative",
          zIndex: 1
        }}
      >
        <div className="eyebrow">{card.sourceName} · {card.contextLabel}</div>
        <h2 style={{ marginTop: "0.45rem", overflowWrap: "anywhere" }}>{card.sourceAttributeKey}</h2>
        {card.approvedCategoryCode && <p><strong>Category:</strong> {card.approvedCategoryCode}</p>}
        {card.sourceUnits.length > 0 && <p><strong>Units:</strong> {card.sourceUnits.join(", ")}</p>}

        {card.blocker && <div className="workspace-inline-note" style={{ margin: "0.9rem 0" }}>
          <strong>Needs context</strong><br />{card.blocker}<br />
          <span style={{ fontSize: "0.9rem" }}>Swipe left or up to resolve it here.</span>
        </div>}

        {primary
          ? <div className="workspace-queue-primary" style={{ marginTop: "1rem" }}>
              <span><strong>Suggested</strong> {primary.productTypeName}</span>
              <span><strong>Attribute</strong> {primary.attributeCode}</span>
              <span><strong>Confidence</strong> {Math.round(primary.score * 100)}%</span>
            </div>
          : <div className="workspace-inline-note" style={{ marginTop: "1rem" }}>No safe canonical suggestion. Swipe up/left to choose or create one.</div>}

        <div style={{ marginTop: "1.15rem", display: "grid", gap: "0.6rem" }}>
          {card.samples.slice(0, 4).map((sample) => <div key={`${sample.productId}:${sample.productKey}`} style={{ borderTop: "1px solid rgba(20,35,45,.12)", paddingTop: "0.55rem" }}>
            <div style={{ fontSize: "0.86rem", opacity: 0.65 }}>{sample.productKey}</div>
            <strong>{sample.title}</strong>
            <div style={{ overflowWrap: "anywhere" }}>{displayValue(sample.rawValue)}{sample.sourceUnit ? ` ${sample.sourceUnit}` : ""}</div>
          </div>)}
        </div>

        <div style={{ marginTop: "1.25rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", fontSize: "0.88rem" }}>
          <button type="button" className="button button-secondary" onClick={swipeApprove} disabled={!canWrite}>← {canDirectApprove ? "Confirm" : "Resolve"}</button>
          <button type="button" className="button button-secondary" onClick={swipeReject} disabled={!canReject}>Not attribute →</button>
          <button type="button" className="button button-secondary" onClick={swipeManual} disabled={!canWrite}>↑ Edit / remap</button>
          <button type="button" className="button button-secondary" onClick={swipeLater}>↓ Later</button>
        </div>
      </article>
    </div>

    <form ref={approveForm} action={approveAction} style={{ display: "none" }}>
      <input name="sourceProductId" value={card.representativeProductId} readOnly />
      <input name="sourceAttributeKey" value={card.sourceAttributeKey} readOnly />
      <input name="productTypeId" value={primary?.productTypeId ?? ""} readOnly />
      <input name="attributeId" value={primary?.attributeId ?? ""} readOnly />
      <input name="reason" value="Confirmed from Attribute Matching trainer" readOnly />
    </form>
    <form ref={rejectForm} action={rejectAction} style={{ display: "none" }}>
      <input name="sourceProductId" value={card.representativeProductId} readOnly />
      <input name="sourceAttributeKey" value={card.sourceAttributeKey} readOnly />
      <input name="reason" value="Marked as not a product attribute in Attribute Matching trainer" readOnly />
    </form>

    {manualOpen && <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit attribute mapping"
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(12,25,34,.58)", display: "grid", placeItems: "center", padding: "max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom))" }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="workspace-queue-card" style={{ width: "min(100%, 720px)", maxHeight: "88dvh", overflowY: "auto", overscrollBehavior: "contain", padding: "1.15rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start" }}>
          <div>
            <div className="eyebrow">Edit / remap</div>
            <h2 style={{ margin: "0.35rem 0" }}>{card.sourceAttributeKey}</h2>
          </div>
          <button type="button" className="button button-secondary" onClick={closeManual}>Close</button>
        </div>

        {card.scopeKind === "unscoped" && <div className="workspace-inline-note" style={{ margin: "0.8rem 0" }}>
          This row has no stable supplier category/taxonomy context yet. It can be postponed, but reusable mapping cannot be saved until ingestion provides that context.
        </div>}

        {taxonomyNeedsCategory && <div style={{ margin: "0.9rem 0" }}>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <strong>KONTAMOU category</strong>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} style={fieldStyle}>
              <option value="">Choose category…</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name} · {category.code}</option>)}
            </select>
          </label>
          {selectedCategory && <div style={{ marginTop: "0.4rem", fontSize: "0.88rem", opacity: 0.7 }}>
            {selectedCategory.productTypeIds.length > 0
              ? `${selectedCategory.productTypeIds.length} Product Type contract(s) already attached.`
              : "No Product Type is attached yet. Saving below will attach the Product Type you choose."}
          </div>}
        </div>}

        <label style={{ display: "grid", gap: "0.35rem", marginTop: "0.8rem" }}>
          <strong>Find existing canonical attribute</strong>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Attribute or Product Type…" style={fieldStyle} />
        </label>

        <div style={{ display: "grid", gap: "0.55rem", marginTop: "0.8rem" }}>
          {filteredTargets.slice(0, 10).map((target) => <form key={`${target.productTypeId}:${target.attributeId}`} action={approveAction}>
            <input type="hidden" name="sourceProductId" value={card.representativeProductId} />
            <input type="hidden" name="sourceAttributeKey" value={card.sourceAttributeKey} />
            <input type="hidden" name="categoryId" value={categoryId} />
            <input type="hidden" name="productTypeId" value={target.productTypeId} />
            <input type="hidden" name="attributeId" value={target.attributeId} />
            <input type="hidden" name="reason" value="Manual remap from Attribute Matching trainer" />
            <button type="submit" className="button button-secondary" disabled={!manualCanSave} style={{ width: "100%", textAlign: "left", whiteSpace: "normal" }}>
              <strong>{target.attributeCode}</strong> · {target.productTypeName}{target.unit ? ` · ${target.unit}` : ""}
            </button>
          </form>)}
          {filteredTargets.length === 0 && <div className="workspace-inline-note">No existing canonical match. Create or reuse an attribute below.</div>}
        </div>

        <hr style={{ margin: "1.15rem 0", opacity: 0.18 }} />

        <form action={createAction} style={{ display: "grid", gap: "0.75rem" }}>
          <input type="hidden" name="sourceProductId" value={card.representativeProductId} />
          <input type="hidden" name="sourceAttributeKey" value={card.sourceAttributeKey} />
          <input type="hidden" name="categoryId" value={categoryId} />
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <strong>Attribute name</strong>
            <input name="labelEl" value={createName} onChange={(event) => setCreateName(event.target.value)} style={fieldStyle} />
          </label>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <strong>Product Type</strong>
            <select name="productTypeId" value={createProductTypeId} onChange={(event) => setCreateProductTypeId(event.target.value)} style={fieldStyle}>
              <option value="">Choose Product Type…</option>
              {productTypes.map((productType) => <option key={productType.id} value={productType.id}>{productType.name} · {productType.code}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <strong>Data type</strong>
            <select name="dataType" value={dataType} onChange={(event) => setDataType(event.target.value)} style={fieldStyle}>
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
              <option value="enum">One controlled value</option>
              <option value="multienum">Multiple controlled values</option>
              <option value="dimension">Dimension</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <strong>Store at</strong>
            <select name="valueLevel" value={valueLevel} onChange={(event) => setValueLevel(event.target.value)} style={fieldStyle}>
              <option value="family">Family level</option>
              <option value="variant">Variant level</option>
            </select>
          </label>

          {taxonomyNeedsCategory && !categoryId && <div className="workspace-inline-note">Choose the KONTAMOU category first. This resolves the taxonomy blocker instead of silently bypassing it.</div>}
          {selectedCategory && createProductTypeId && !selectedCategory.productTypeIds.includes(createProductTypeId) && <div className="workspace-inline-note">
            Saving will also attach the selected Product Type to <strong>{selectedCategory.name}</strong>, creating the missing governed category/Product Type contract.
          </div>}

          <CreateSubmit disabled={!manualCanSave || !createName.trim() || !createProductTypeId} label={createName.trim() || card.sourceAttributeKey} />
        </form>
      </div>
    </div>}
  </>;
}

function CreateSubmit({ disabled, label }: { disabled: boolean; label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="button" disabled={disabled || pending} style={{ justifySelf: "start" }}>
    {pending ? "Saving…" : `Create / use “${label}”`}
  </button>;
}

const fieldStyle = {
  width: "100%",
  minHeight: "48px",
  borderRadius: "14px",
  border: "1px solid rgba(30,45,55,.18)",
  background: "var(--surface, #fff)",
  padding: "0.72rem 0.85rem",
  font: "inherit"
} as const;

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}
