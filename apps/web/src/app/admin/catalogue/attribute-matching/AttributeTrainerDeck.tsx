"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { AttributeTrainerCard, AttributeTrainerTarget } from "../../../../lib/admin-catalogue-attribute-trainer";

type Action = (formData: FormData) => Promise<void>;

type Props = Readonly<{
  cards: readonly AttributeTrainerCard[];
  targets: readonly AttributeTrainerTarget[];
  canWrite: boolean;
  approveAction: Action;
  rejectAction: Action;
}>;

export function AttributeTrainerDeck({ cards, targets, canWrite, approveAction, rejectAction }: Props) {
  const [index, setIndex] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [query, setQuery] = useState("");
  const start = useRef<{ x: number; y: number } | null>(null);
  const approveForm = useRef<HTMLFormElement>(null);
  const rejectForm = useRef<HTMLFormElement>(null);

  const card = cards[index];
  const primary = card?.suggestions[0];
  const filteredTargets = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("el-GR");
    const source = needle
      ? targets.filter((target) => `${target.productTypeName} ${target.productTypeCode} ${target.attributeCode} ${target.groupCode ?? ""}`.toLocaleLowerCase("el-GR").includes(needle))
      : targets;
    return source.slice(0, 80);
  }, [query, targets]);

  if (!card) {
    return <div className="workspace-queue-card" style={{ textAlign: "center", padding: "2rem" }}>
      <strong>Queue cleared for this batch.</strong>
      <p>Reload the trainer to fetch the next highest-impact attribute contexts.</p>
      <button className="button button-primary" type="button" onClick={() => window.location.reload()}>Load next batch</button>
    </div>;
  }

  const submitApprove = () => {
    if (!canWrite || !card.actionable || !primary) return;
    approveForm.current?.requestSubmit();
  };
  const submitReject = () => {
    if (!canWrite || card.scopeKind === "unscoped") return;
    rejectForm.current?.requestSubmit();
  };
  const skip = () => {
    setManualOpen(false);
    setQuery("");
    setIndex((value) => Math.min(value + 1, cards.length));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    start.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = start.current;
    start.current = null;
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 65) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) submitApprove();
      else submitReject();
      return;
    }
    if (dy < 0) setManualOpen(true);
    else skip();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); submitApprove(); }
    else if (event.key === "ArrowRight") { event.preventDefault(); submitReject(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setManualOpen(true); }
    else if (event.key === "ArrowDown") { event.preventDefault(); skip(); }
  };

  return <>
    <div className="workspace-action-bar" style={{ marginBottom: "1rem" }}>
      <span>Card {Math.min(index + 1, cards.length)} / {cards.length} · keyboard: ← confirm · → not attribute · ↑ remap · ↓ later</span>
    </div>

    <div
      className="workspace-queue-card"
      role="group"
      aria-label={`Attribute matching card for ${card.sourceAttributeKey}`}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      style={{ maxWidth: "760px", margin: "0 auto", padding: "1.35rem", touchAction: "pan-y" }}
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
        <button className="button button-primary" type="button" disabled={!canWrite || !card.actionable || !primary} onClick={submitApprove}>← Confirm</button>
        <button className="button button-secondary" type="button" disabled={!canWrite || card.scopeKind === "unscoped"} onClick={submitReject}>Not an attribute →</button>
        <button className="button button-secondary" type="button" disabled={!canWrite || !card.actionable} onClick={() => setManualOpen(true)}>↑ Search / remap</button>
        <button className="button button-secondary" type="button" onClick={skip}>Later ↓</button>
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

    {manualOpen && <div role="dialog" aria-modal="true" aria-label="Search canonical attribute" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.48)", display: "grid", placeItems: "center", padding: "1rem" }} onMouseDown={(event) => { if (event.currentTarget === event.target) setManualOpen(false); }}>
      <div className="workspace-queue-card" style={{ width: "min(920px, 100%)", maxHeight: "88vh", overflow: "auto", padding: "1.25rem" }}>
        <div className="workspace-queue-head">
          <div><small>Manual canonical match</small><strong>{card.sourceAttributeKey}</strong></div>
          <button className="button button-secondary" type="button" onClick={() => setManualOpen(false)}>Close</button>
        </div>
        <label style={{ display: "block", marginTop: "1rem" }}>
          <span>Search Product Type, canonical attribute or group</span>
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. colour, battery capacity, dimensions…" style={{ width: "100%" }} />
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
        {filteredTargets.length === 0 && <div className="workspace-inline-note" style={{ marginTop: "1rem" }}>No existing canonical attribute matches this search. Create or edit the canonical structure first, then return here; source evidence remains untouched.</div>}
      </div>
    </div>}
  </>;
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
