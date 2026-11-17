import type { ScoreBreakdown } from "@/agent/types";
import { COMPONENT_LABEL, sector, type Sector } from "@/lib/format";

const FILL: Record<Sector, string> = {
  best: "bg-sector-best",
  good: "bg-sector-good",
  mid: "bg-sector-mid",
  low: "bg-sector-low",
};

/** Five score components drawn as timing-screen sectors. */
export function Sectors({ score, size = "md", showLabels = false }: { score: ScoreBreakdown; size?: "sm" | "md"; showLabels?: boolean }) {
  const entries = Object.entries(score.components) as [keyof typeof COMPONENT_LABEL, number][];
  return (
    <div className={showLabels ? "grid max-w-sm grid-cols-5 gap-1.5" : "flex gap-1"} role="list" aria-label="Score by component">
      {entries.map(([key, value]) => (
        <div key={key} role="listitem" className="flex flex-col gap-1.5" title={`${COMPONENT_LABEL[key]}: ${value} of 5`}>
          <span
            className={`${FILL[sector(value)]} block rounded-[2px] ${showLabels ? "h-2.5 w-full" : size === "sm" ? "h-2 w-5" : "h-2.5 w-9"}`}
            aria-hidden
          />
          {showLabels ? (
            <span className="text-[11px] leading-none text-muted">
              {COMPONENT_LABEL[key]} <span className="text-ink">{value}</span>
            </span>
          ) : (
            <span className="sr-only">
              {COMPONENT_LABEL[key]} {value} of 5
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function SectorLegend({ dark = false }: { dark?: boolean }) {
  const text = dark ? "text-on-asphalt-muted" : "text-muted";
  return (
    <p className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${text}`}>
      <span>Sectors, as on an F1 timing screen:</span>
      {(
        [
          ["best", "5, best possible"],
          ["good", "4, strong"],
          ["mid", "3, middling"],
          ["low", "1 to 2, weak"],
        ] as [Sector, string][]
      ).map(([s, label]) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={`${FILL[s]} inline-block h-2 w-4 rounded-[2px]`} aria-hidden />
          {label}
        </span>
      ))}
    </p>
  );
}
