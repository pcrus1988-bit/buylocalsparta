"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useFormStatus } from "react-dom";
import type { AttributeTrainerCard, AttributeTrainerTarget } from "../../../../lib/admin-catalogue-attribute-trainer";
import type { CatalogueProductTypeOption } from "../../../../lib/admin-catalogue-product-type-options";

type Action = (formData: FormData) => Promise<void>;
type SwipeDirection = "left" | "right" | "up" | "down";
type DragState = Readonly<{ x: number; y: number; dragging: boolean; settling: boolean }>;

const SWIPE_THRESHOLD = 72;
const RESTING_DRAG: DragState = { x: 0, y: 0, dragging: false, settling: false };

type Props = Readonly<{
  cards: readonly AttributeTrainerCard[];
  targets: readonly AttributeTrainerTarget[];
  productTypes: readonly CatalogueProductTypeOption[];
  canWrite: boolean;
  approveAction: Action;
  createAction: Action;
  rejectAction: Action;
}>;

export function AttributeTrainerDeck({ cards, targets, productTypes, canWrite, approveAction, createAction, rejectAction }: Props) {
  const [index, setIndex] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [drag, setDrag] = useState<DragState>(RESTING_DRAG);
  const start = useRef<{ x: number; y: number } | null>(null);
  const gestureLocked = useRef(false);
  const approveForm = useRef<HTMLFormElement>(null);
  const rejectForm = useRef<HTMLFormElement>(null);

  const card = cards[index];
  const primary = card?.suggestions[0];
  const eligibleTargets = useMemo(() => {
    if (!card || card.scopeKind !== "taxonomy_node") return targets;
    const allowed = new Set(card.allowedProductTypeIds);
    return targets.filter((target) => allowed.has(target.productTypeId));
  }, [card, targets]);
  const eligibleProductTypes = useMemo(() => {
    if (!card || card.scopeKind !== "taxonomy_node") return productTypes;
    const allowed = new Set(card.allowedProductTypeIds);
    return productTypes.filter((productType) => allowed.has(productType.id));
  }, [card, productTypes]);
  const filteredTargets = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("el-GR");
    const source = needle
      ? eligibleTargets.filter((target) => `${target.productTypeName} ${target.productTypeCode} ${target.attributeCode} ${target.groupCode ?? ""}`.toLocaleLowerCase("el-GR").includes(needle))
      : eligibleTargets;
    return source.slice(0, 80);
  }, [eligibleTargets, query]);

  if (!card) {
    return <div className="workspace-queue-card" style={{ textAlign: "center", padding: "2rem" }}>
      <strong>Queue cleared for this batch.</strong>
      <p>Reload the trainer to fetch the next highest-impact attribute contexts.</p>
      <button className="button button-primary" type="button" onClick={() => window.location.reload()}>Load next batch</button>
    </div>;
  }

  const canApprove = canWrite && card.actionable && Boolean(primary);
  const canReject = canWrite && card.scopeKind !== "unscoped";
  const canManual = canWrite && card.actionable;

  const submitApprove = () => {
    if (!canApprove) return;
    approveForm.current?.requestSubmit();
  };
  const submitReject = () => {
    if (!canReject) return;
    rejectForm.current?.requestSubmit();
  };
  const openManual = () => {
    if (!canManual) return;
    setQuery(card.sourceAttributeKey);
    setManualOpen(true);
  };
  const skip = () => {
    setManualOpen(false);
    setQuery("");
    setIndex((value) => Math.min(value + 1, cards.length));
  };

  const animateThen = (direction: SwipeDirection, action: () => void) => {
    if (gestureLocked.current) return;
    gestureLocked.current = true;
    const width = typeof window === "undefined" ? 960 : Math.max(window.innerWidth, 720);
    const height = typeof window === "undefined" ? 720 : Math.max(window.innerHeight, 560);
    const destination: Record<SwipeDirection, Pick<DragState, "x" | "y">> = {
      left: { x: -width * 1.08, y: Math.min(24, Math.max(-24, drag.y)) },
      right: { x: width * 1.08, y: Math.min(24, Math.max(-24, drag.y)) },
      up: { x: Math.min(18, Math.max(-18, drag.x)), y: -Math.min(height * 0.22, 180) },
      down: { x: Math.min(18, Math.max(-18, drag.x)), y: Math.min(height * 0.18, 150) }
    };
    setDrag({ ...destination[direction], dragging: false, settling: true });
    window.setTimeout(() => {
      action();
      if (direction === "up" || direction === "down") {
        setDrag(RESTING_DRAG);
        gestureLocked.current = false;
        return;
      }
      window.setTimeout(() => {
        setDrag(RESTING_DRAG);
        gestureLocked.current = false;
      }, 320);
    }, 180);
  };

  const swipeApprove = () => {
    if (!canApprove) { setDrag(RESTING_DRAG); return; }
    animateThen("left", submitApprove);
  };
  const swipeReject = () => {
    if (!canReject) { setDrag(RESTING_DRAG); return; }
    animateThen("right", submitReject);
  };
  const swipeManual = () => {
    if (!canManual) { setDrag(RESTING_DRAG); return; }
    animateThen("up", openManual);
  };
  const swipeLater = () => animateThen("down", skip);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gestureLocked.current || manualOpen) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, form")) return;
    start.current = { x: event.clientX, y: event.clientY };
    setDrag({ x: 0, y: 0, dragging: true, settling: false });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = start.current;
    if (!origin || gestureLocked.current) return;
    setDrag({ x: event.clientX - origin.x, y: event.clientY - origin.y, dragging: true, settling: false });
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = start.current;
    start.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) {
      setDrag(RESTING_DRAG);
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) swipeApprove();
      else swipeReject();
      return;
    }
    if (dy < 0) swipeManual();
    else swipeLater();
  };
  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    start.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!gestureLocked.current) setDrag(RESTING_DRAG);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); swipeApprove(); }
    else if (event.key === "ArrowRight") { event.preventDefault(); swipeReject(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); swipeManual(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); swipeLater(); }
  };

  const createName = query.trim();
  const defaultProductTypeId = primary?.productTypeId && eligibleProductTypes.some((item) => item.id === primary.productTypeId)
    ? primary.productTypeId
    : eligibleProductTypes[0]?.id ?? "";
  const horizontalDominant = Math.abs(drag.x) >= Math.abs(drag.y);
  const verticalDominant = Math.abs(drag.y) > Math.abs(drag.x);
  const confirmProgress = horizontalDominant && drag.x < 0 ? progress(-drag.x) : 0;
  const rejectProgress = horizontalDominant && drag.x > 0 ? progress(drag.x) : 0;
  const editProgress = verticalDominant && drag.y < 0 ? progress(-drag.y) : 0;
  const laterProgress = verticalDominant && drag.y > 0 ? progress(drag.y) : 0;
  const rotation = Math.max(-7, Math.min(7, drag.x / 38));

  return <>
    <div className="workspace-action-bar" style={{ marginBottom: "1rem" }}>
      <span>Card {Math.min(index + 1, cards.length)} / {cards.length} · swipe / keyboard: ← confirm · → not attribute · ↑ edit / remap · ↓ later</span>
    </div>

    <div style={{ position: "relative", maxWidth: "780px", margin: "0 auto", isolation: "isolate" }}>
      <GestureCue edge="right" label="← Confirm" opacity={confirmProgress} tone="positive" />
      <GestureCue edge="left" label="Not an attribute →" opacity={rejectProgress} tone="negative" />
      <GestureCue edge="bottom" label="↑ Edit / remap" opacity={editProgress} tone="edit" />
      <GestureCue edge="top" label="Later ↓" opacity={laterProgress} tone="neutral" />

      <div
        className="workspace-queue-card"
        role="group"
        aria-label={`Attribute matching card for ${card.sourceAttributeKey}`}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDown}
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "760px",
          margin: "0 auto",
          padding: "1.35rem",
          touchAction: "none",
          userSelect: drag.dragging ? "none" : undefined,
          cursor: drag.dragging ? "grabbing" : "grab",
          transform: `translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${rotation}deg) scale(${drag.dragging ? 1.012 : 1})`,
          transition: drag.dragging ? "none" : "transform 180ms cubic-bezier(.2,.78,.25,1), box-shadow 180ms ease",
          boxShadow: drag.dragging ? "0 20px 55px rgba(16,24,40,.18)" : undefined,
          willChange: "transform"
        }}
      >
        <div className="workspace-queue-head">
          <div>
            <small>{card.sourceName} · {card.contextLabel}</small>
            <strong style={{ display: "block", fontSize: "1.55rem", marginTop: ".35rem" }}>{card.sourceAttributeKey}</strong>
          </div>
          <span className="status-pill">{card.observationCount.toLocaleString("el-GR")} observations</span>
        </div>

        <div className="workspace-queue-primary" style={{ marginTop: "1rem" }}>
          <span><strong>{card.productCount.toLocaleString("el-GR")}</strong> products</span>
          <span><strong>{card.approvedCategoryCode ?? "—"}</strong> category</span>
          <span><strong>{card.sourceUnits.join(" · ") || "—"}</strong> units</span>
        </div>

        <div className="workspace-compact-list" style={{ marginTop: "1rem" }}>
          {card.samples.map((sample) => <div className="workspace-compact-row" key={`${sample.productId}:${JSON.stringify(sample.rawValue)}`}>
            <strong>{compact(sample.rawValue)}</strong>
            <span>{sample.title}</span>
          </div>)}
        </div>

        {card.blocker && <div className="workspace-inline-note" style={{ marginTop: "1rem" }}>{card.blocker}</div>}

        <div className="workspace-queue-card" style={{ marginTop: "1rem" }}>
          <div className="workspace-queue-head">
            <div>
              <small>Best canonical suggestion</small>
              <strong>{primary ? `${primary.productTypeName} · ${primary.attributeCode}` : "No safe suggestion yet"}</strong>
            </div>
            {primary && <span className="status-pill">{Math.round(primary.score * 100)}%</span>}
          </div>
          {primary && <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Group</strong><span>{primary.groupCode ?? "—"}</span></div>
            <div className="workspace-compact-row"><strong>Type / unit</strong><span>{primary.dataType}{primary.unit ? ` · ${primary.unit}` : ""}</span></div>
            <div className="workspace-compact-row"><strong>Why</strong><span>{primary.reasons.join(" · ") || "Semantic candidate"}</span></div>
          </div>}
        </div>

        <div className="workspace-action-bar" style={{ marginTop: "1rem", justifyContent: "center", gap: ".6rem", flexWrap: "wrap" }}>
          <button className="button button-primary" type="button" disabled={!canApprove || drag.settling} onClick={swipeApprove}>← Confirm</button>
          <button className="button button-secondary" type="button" disabled={!canReject || drag.settling} onClick={swipeReject}>Not an attribute →</button>
          <button className="button button-secondary" type="button" disabled={!canManual || drag.settling} onClick={swipeManual}>↑ Edit / remap</button>
          <button className="button button-secondary" type="button" disabled={drag.settling} onClick={swipeLater}>Later ↓</button>
        </div>
      </div>
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

    {manualOpen && <div role="dialog" aria-modal="true" aria-label="Edit or remap canonical attribute" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.48)", display: "grid", placeItems: "center", padding: "1rem" }} onMouseDown={(event) => { if (event.currentTarget === event.target) setManualOpen(false); }}>
      <div className="workspace-queue-card" style={{ width: "min(920px, 100%)", maxHeight: "88vh", overflow: "auto", padding: "1.25rem" }}>
        <div className="workspace-queue-head">
          <div><small>Edit / remap canonical attribute</small><strong>{card.sourceAttributeKey}</strong></div>
          <button className="button button-secondary" type="button" onClick={() => setManualOpen(false)}>Close</button>
        </div>
        <label style={{ display: "block", marginTop: "1rem" }}>
          <span>Search Product Type, canonical attribute or type a new attribute name</span>
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. χρώμα, battery capacity, dimensions…" style={{ width: "100%" }} />
        </label>

        <div className="workspace-queue-list" style={{ marginTop: "1rem" }}>
          {filteredTargets.map((target) => <form action={approveAction} className="workspace-queue-card" key={`${target.productTypeId}:${target.attributeId}`}>
            <input type="hidden" name="sourceProductId" value={card.representativeProductId} />
            <input type="hidden" name="sourceAttributeKey" value={card.sourceAttributeKey} />
            <input type="hidden" name="productTypeId" value={target.productTypeId} />
            <input type="hidden" name="attributeId" value={target.attributeId} />
            <input type="hidden" name="reason" value="Manually remapped from Attribute Matching trainer" />
            <div className="workspace-queue-head">
              <div><strong>{target.productTypeName} · {target.attributeCode}</strong><small>{target.groupCode ?? "Ungrouped"} · {target.dataType}{target.unit ? ` · ${target.unit}` : ""}</small></div>
              <button className="button button-primary" type="submit">Use this</button>
            </div>
          </form>)}
        </div>

        {createName && <form
          key={`${card.id}:${createName}`}
          action={createAction}
          onSubmit={(event) => {
            if (!window.confirm(`Create or reuse canonical attribute “${createName}” and immediately learn this supplier mapping?`)) {
              event.preventDefault();
            }
          }}
          className="workspace-queue-card"
          style={{ marginTop: "1rem" }}
        >
          <input type="hidden" name="sourceProductId" value={card.representativeProductId} />
          <input type="hidden" name="sourceAttributeKey" value={card.sourceAttributeKey} />
          <input type="hidden" name="labelEl" value={createName} />
          <div className="workspace-queue-head">
            <div>
              <small>No suitable canonical match?</small>
              <strong>Create or reuse “{createName}”</strong>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: ".75rem", marginTop: ".9rem" }}>
            <label>
              <span>Product Type</span>
              <select name="productTypeId" defaultValue={defaultProductTypeId} required style={{ width: "100%" }}>
                {eligibleProductTypes.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.code}</option>)}
              </select>
            </label>
            <label>
              <span>Data type</span>
              <select name="dataType" defaultValue="text" required style={{ width: "100%" }}>
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Yes / no</option>
                <option value="dimension">Dimension</option>
                <option value="enum">Single controlled value</option>
                <option value="multienum">Multiple controlled values</option>
              </select>
            </label>
            <label>
              <span>Store at</span>
              <select name="valueLevel" defaultValue="variant" required style={{ width: "100%" }}>
                <option value="variant">Variant level</option>
                <option value="family">Product family level</option>
              </select>
            </label>
          </div>
          <div className="workspace-inline-note" style={{ marginTop: ".9rem" }}>
            New attributes start optional, customer-visible, non-filterable and non-searchable. Existing exact label/code matches are reused instead of duplicated.
          </div>
          <div className="workspace-action-bar" style={{ marginTop: ".9rem" }}>
            <CreateAttributeSubmit disabled={!canWrite || !card.actionable || eligibleProductTypes.length === 0} label={createName} />
          </div>
        </form>}

        {filteredTargets.length === 0 && !createName && <div className="workspace-inline-note" style={{ marginTop: "1rem" }}>No existing canonical attribute matches this search. Type the canonical attribute name above to create it here.</div>}
        {eligibleProductTypes.length === 0 && createName && <div className="workspace-inline-note" style={{ marginTop: "1rem" }}>No eligible active Product Type is available in this context. Resolve the Product Type/category contract first.</div>}
      </div>
    </div>}
  </>;
}

function GestureCue({ edge, label, opacity, tone }: { edge: "left" | "right" | "top" | "bottom"; label: string; opacity: number; tone: "positive" | "negative" | "edit" | "neutral" }) {
  const palette = {
    positive: { border: "rgba(22, 135, 82, .42)", text: "rgb(17, 105, 64)", background: "rgba(232, 249, 239, .96)" },
    negative: { border: "rgba(190, 58, 58, .38)", text: "rgb(155, 43, 43)", background: "rgba(255, 238, 238, .96)" },
    edit: { border: "rgba(49, 91, 168, .36)", text: "rgb(39, 75, 142)", background: "rgba(238, 244, 255, .96)" },
    neutral: { border: "rgba(91, 91, 91, .28)", text: "rgb(72, 72, 72)", background: "rgba(246, 246, 246, .96)" }
  }[tone];
  const placement = edge === "left"
    ? { left: ".5rem", top: "50%", transform: "translateY(-50%)" }
    : edge === "right"
      ? { right: ".5rem", top: "50%", transform: "translateY(-50%)" }
      : edge === "top"
        ? { left: "50%", top: ".55rem", transform: "translateX(-50%)" }
        : { left: "50%", bottom: ".55rem", transform: "translateX(-50%)" };
  return <div aria-hidden style={{
    position: "absolute",
    zIndex: 0,
    pointerEvents: "none",
    opacity,
    ...placement,
    border: `1px solid ${palette.border}`,
    color: palette.text,
    background: palette.background,
    borderRadius: "999px",
    padding: ".45rem .75rem",
    fontSize: ".78rem",
    fontWeight: 700,
    letterSpacing: ".03em",
    boxShadow: "0 8px 24px rgba(16,24,40,.08)",
    transition: dragTransition(opacity)
  }}>{label}</div>;
}

function CreateAttributeSubmit({ disabled, label }: { disabled: boolean; label: string }) {
  const { pending } = useFormStatus();
  return <button className="button button-primary" type="submit" disabled={disabled || pending}>
    {pending ? "Creating and learning…" : `Create / use “${label}”`}
  </button>;
}

function progress(distance: number): number {
  return Math.max(0, Math.min(1, distance / SWIPE_THRESHOLD));
}

function dragTransition(opacity: number): string {
  return opacity > 0 ? "opacity 60ms linear" : "opacity 140ms ease";
}

function compact(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length > 90 ? `${value.slice(0, 87)}…` : value;
  try {
    const text = JSON.stringify(value);
    return text.length > 90 ? `${text.slice(0, 87)}…` : text;
  } catch {
    return String(value);
  }
}
