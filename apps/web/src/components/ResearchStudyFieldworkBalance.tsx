import type { ResearchFieldworkStratum } from "../lib/research-survey-runtime";

function percentage(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  return new Intl.NumberFormat("el-GR", { maximumFractionDigits: 1 }).format((numerator / denominator) * 100) + "%";
}

function dimensionLabel(dimensions: Record<string, unknown>): string {
  const region = typeof dimensions["regionCode"] === "string"
    ? dimensions["regionCode"]
    : typeof dimensions["region"] === "string"
      ? dimensions["region"]
      : "";
  const sector = typeof dimensions["sectorCode"] === "string"
    ? dimensions["sectorCode"]
    : typeof dimensions["sector"] === "string"
      ? dimensions["sector"]
      : "";
  return [region, sector].filter(Boolean).join(" · ");
}

function StratumRow({ item }: { item: ResearchFieldworkStratum }) {
  const gap = Math.max(0, item.targetCompleteCount - item.completed);
  const dimensions = dimensionLabel(item.dimensions);
  return <div className="workspace-action-bar">
    <span style={{ flex: 1, minWidth: 220 }}>
      <strong>{item.label || item.code}</strong><br />
      <small>{dimensions || item.code} · population {item.populationCount.toLocaleString("el-GR")}</small>
    </span>
    <span style={{ minWidth: 260 }}>
      <strong>{item.completed}/{item.targetCompleteCount} completes</strong>
      {gap > 0 ? <small> · gap {gap}</small> : <small> · target met</small>}<br />
      <small>
        selected {item.selected} · sent {item.sent} · delivered {item.delivered} · opened {item.opened} ·
        started {item.started} · sent→complete {percentage(item.completed, item.sent)}
        {item.withdrawn > 0 ? " · withdrawn " + item.withdrawn : ""}
      </small>
    </span>
  </div>;
}

export function ResearchStudyFieldworkBalance({
  strata
}: {
  strata: readonly ResearchFieldworkStratum[];
}) {
  if (!strata.length) return null;

  const ranked = [...strata]
    .filter((item) => item.selected > 0 || item.targetCompleteCount > 0)
    .sort((a, b) => {
      const aGap = Math.max(0, a.targetCompleteCount - a.completed);
      const bGap = Math.max(0, b.targetCompleteCount - b.completed);
      if (bGap !== aGap) return bGap - aGap;
      const aRate = a.sent > 0 ? a.completed / a.sent : 0;
      const bRate = b.sent > 0 ? b.completed / b.sent : 0;
      return aRate - bRate;
    });

  const primary = ranked.slice(0, 12);
  const remainder = ranked.slice(12);
  const belowTarget = ranked.filter((item) => item.completed < item.targetCompleteCount).length;
  const noCompletes = ranked.filter((item) => item.sent > 0 && item.completed === 0).length;

  return <div className="workspace-queue-card">
    <div className="workspace-action-bar">
      <span>
        <strong>Fieldwork balance · sampling strata</strong><br />
        Live non-response diagnostic using the same frozen strata as the probability sample.
      </span>
      <span>
        <strong>{belowTarget} below target</strong><br />
        <small>{noCompletes} contacted strata with no completes</small>
      </span>
    </div>
    {primary.map((item) => <StratumRow item={item} key={item.code} />)}
    {remainder.length > 0 && <details>
      <summary className="workspace-inline-note">
        Show {remainder.length} additional sampling strata
      </summary>
      {remainder.map((item) => <StratumRow item={item} key={item.code} />)}
    </details>}
  </div>;
}
