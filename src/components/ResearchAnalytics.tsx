"use client";

import { useRef, useState } from "react";
import { LENS_SPECS } from "@/agent/lenses";
import type { Report } from "@/agent/types";
import { CHANNEL_LABEL, formatLooseDate } from "@/lib/format";

/*
  Research at a glance. One ink color throughout: identity comes from rows, labels and
  position, never from color alone. Every mark has a hover and focus tooltip.
*/

type Tip = { x: number; y: number; title: string; lines: string[] } | null;

function useTooltip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip>(null);
  const show = (e: React.MouseEvent | React.FocusEvent, title: string, lines: string[]) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const target = (e.target as Element).getBoundingClientRect();
    const x = "clientX" in e ? e.clientX : target.left + target.width / 2;
    const y = "clientY" in e ? e.clientY : target.top;
    setTip({ x: x - box.left, y: y - box.top, title, lines });
  };
  const hide = () => setTip(null);
  const node = tip ? (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 max-w-[18rem] -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-md bg-asphalt px-3 py-2 text-xs text-on-asphalt shadow-lg"
      style={{ left: tip.x, top: tip.y }}
    >
      <p className="font-semibold leading-snug">{tip.title}</p>
      {tip.lines.map((l) => (
        <p key={l} className="mt-0.5 text-on-asphalt-muted">
          {l}
        </p>
      ))}
    </div>
  ) : null;
  return { ref, show, hide, node };
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-line bg-paper p-5 sm:p-6">
      <h3 className="font-semibold">{title}</h3>
      {note ? <p className="mt-1 text-sm text-muted">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* ---------------- Where to lead: size of the prize vs ease ---------------- */

// Offsets for plays that land in the same cell, so none hides behind another.
const CELL_LAYOUT: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-17, 0], [17, 0]],
  3: [[-17, -16], [17, -16], [0, 16]],
  4: [[-17, -16], [17, -16], [-17, 16], [17, 16]],
};

function PriorityMap({ r }: { r: Report }) {
  const t = useTooltip();
  const W = 420;
  const H = 350;
  const m = { l: 44, r: 16, t: 26, b: 40 };
  const sx = (v: number) => m.l + ((v - 0.5) / 5) * (W - m.l - m.r);
  const sy = (v: number) => H - m.b - ((v - 0.5) / 5) * (H - m.t - m.b);
  const cells = new Map<string, Report["opportunities"]>();
  for (const o of r.opportunities) {
    const key = `${o.score.components.access}:${o.score.components.scale}`;
    cells.set(key, [...(cells.get(key) ?? []), o]);
  }
  const offset = (o: Report["opportunities"][number]): [number, number] => {
    const group = cells.get(`${o.score.components.access}:${o.score.components.scale}`) ?? [o];
    const layout = CELL_LAYOUT[Math.min(group.length, 4)];
    return layout[Math.min(group.indexOf(o), layout.length - 1)];
  };

  return (
    <div ref={t.ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Plays plotted by size of the prize and ease of reaching the buyer">
        <rect x={sx(3.5)} y={sy(5.5)} width={sx(5.5) - sx(3.5)} height={sy(3.5) - sy(5.5)} rx={6} className="fill-sector-good/10" />
        {[1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line x1={sx(v)} x2={sx(v)} y1={sy(0.5)} y2={sy(5.5)} className="stroke-line" strokeWidth={1} />
            <line x1={sx(0.5)} x2={sx(5.5)} y1={sy(v)} y2={sy(v)} className="stroke-line" strokeWidth={1} />
            <text x={sx(v)} y={H - m.b + 16} textAnchor="middle" className="fill-muted text-[11px]">
              {v}
            </text>
            <text x={m.l - 10} y={sy(v) + 4} textAnchor="end" className="fill-muted text-[11px]">
              {v}
            </text>
          </g>
        ))}
        <text x={sx(4.5)} y={sy(5.5) - 8} textAnchor="middle" className="fill-sector-good-ink text-[11px] font-medium">
          Lead with these
        </text>
        <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle" className="fill-muted text-[11px]">
          Ease of reaching the buyer
        </text>
        <text transform={`translate(12 ${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle" className="fill-muted text-[11px]">
          Size of the prize
        </text>
        {r.opportunities.map((o) => {
          const [dx, dy] = offset(o);
          const cx = sx(o.score.components.access) + dx;
          const cy = sy(o.score.components.scale) + dy;
          const rad = Math.max(10, Math.min(16, 10 + ((o.score.total - 60) / 40) * 6));
          const lines = [
            `Score ${o.score.total}. Size ${o.score.components.scale}, ease ${o.score.components.access}, timing ${o.score.components.timeliness}, fit ${o.score.components.fit}`,
            o.timing.window,
          ];
          return (
            <a key={o.id} href={`#${o.id}`} aria-label={`P${o.rank}: ${o.title}. ${lines[0]}`}>
              <g
                tabIndex={0}
                onMouseMove={(e) => t.show(e, `P${o.rank}. ${o.title}`, lines)}
                onMouseLeave={t.hide}
                onFocus={(e) => t.show(e, `P${o.rank}. ${o.title}`, lines)}
                onBlur={t.hide}
                className="cursor-pointer outline-none"
              >
                <circle cx={cx} cy={cy} r={rad + 5} className="fill-transparent" />
                <circle cx={cx} cy={cy} r={rad} className="fill-ink stroke-paper" strokeWidth={2} />
                <text x={cx} y={cy + 4} textAnchor="middle" className="fill-paper text-[11px] font-semibold">
                  P{o.rank}
                </text>
              </g>
            </a>
          );
        })}
      </svg>
      <p className="mt-1 text-xs text-muted">Bigger bubbles score higher overall. Click a bubble to jump to the play.</p>
      {t.node}
    </div>
  );
}

/* ---------------- Touchpoints each play uses ---------------- */

function TouchpointGrid({ r }: { r: Report }) {
  const t = useTooltip();
  const channels = [...new Set(r.opportunities.flatMap((o) => o.touchpoints))].sort(
    (a, b) => r.opportunities.filter((o) => o.touchpoints.includes(b)).length - r.opportunities.filter((o) => o.touchpoints.includes(a)).length,
  );
  return (
    <div ref={t.ref} className="relative overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="text-left font-normal text-muted">Touchpoint</th>
            {r.opportunities.map((o) => (
              <th key={o.id} scope="col" className="w-9 text-center font-semibold">
                <a href={`#${o.id}`} title={o.title} className="no-underline hover:underline">
                  P{o.rank}
                </a>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {channels.map((c) => {
            const users = r.opportunities.filter((o) => o.touchpoints.includes(c));
            return (
              <tr key={c}>
                <th scope="row" className="whitespace-nowrap pr-2 text-left font-normal">
                  {CHANNEL_LABEL[c]}
                </th>
                {r.opportunities.map((o) => {
                  const on = o.touchpoints.includes(c);
                  const label = `P${o.rank} ${on ? "uses" : "does not use"} ${CHANNEL_LABEL[c].toLowerCase()}`;
                  return (
                    <td key={o.id} className="p-0">
                      <span
                        tabIndex={on ? 0 : -1}
                        aria-label={label}
                        onMouseMove={on ? (e) => t.show(e, `P${o.rank}. ${o.title}`, [`Uses ${CHANNEL_LABEL[c].toLowerCase()}`]) : undefined}
                        onMouseLeave={t.hide}
                        onFocus={on ? (e) => t.show(e, `P${o.rank}. ${o.title}`, [`Uses ${CHANNEL_LABEL[c].toLowerCase()}`]) : undefined}
                        onBlur={t.hide}
                        className={`mx-auto block h-7 w-7 rounded-[4px] outline-none ${on ? "bg-ink" : "bg-concrete"}`}
                      />
                    </td>
                  );
                })}
                <td className="pl-2 text-right text-muted">{users.length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {t.node}
    </div>
  );
}

/* ---------------- Signal timeline by lens ---------------- */

const LENS_SHORT: Record<string, string> = {
  campaigns: "Campaigns",
  experiences: "Events",
  commerce: "Tickets & retail",
  partnerships: "Sponsors",
  customer: "Customer data",
  strategy: "Strategy",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toMonthIndex(s: string | null): number | null {
  if (!s) return null;
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : 6) + (m[3] ? (Number(m[3]) - 1) / 31 : m[2] ? 0.5 : 0);
}

function SignalTimeline({ r }: { r: Report }) {
  const t = useTooltip();
  const today = toMonthIndex(r.asOf)!;
  const dated = r.signals.map((s) => ({ s, x: toMonthIndex(s.date) })).filter((d): d is { s: (typeof r.signals)[number]; x: number } => d.x !== null);
  const undated = r.signals.length - dated.length;
  const lo = Math.floor(Math.max(today - 24, Math.min(today - 6, ...dated.map((d) => d.x)) - 1));
  const hi = Math.ceil(Math.min(today + 18, Math.max(today + 3, ...dated.map((d) => d.x)) + 1));
  const W = 900;
  const rowH = 34;
  const m = { l: 140, r: 20, t: 26, b: 28 };
  const H = m.t + m.b + rowH * LENS_SPECS.length;
  const sx = (v: number) => m.l + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (W - m.l - m.r);
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / 3) * 3; v <= hi; v += 3) ticks.push(v);

  return (
    <div ref={t.ref} className="relative overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[640px]" style={{ minWidth: 640 }} role="img" aria-label="Signals over time, by research lens">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={sx(v)} x2={sx(v)} y1={m.t - 6} y2={H - m.b} className="stroke-line" strokeWidth={1} />
            <text x={sx(v)} y={H - 8} textAnchor="middle" className="fill-muted text-[11px]">
              {MONTHS[v % 12]} {Math.floor(v / 12)}
            </text>
          </g>
        ))}
        <line x1={sx(today)} x2={sx(today)} y1={m.t - 14} y2={H - m.b} className="stroke-ink" strokeWidth={2} />
        <text x={sx(today)} y={m.t - 16} textAnchor="middle" className="fill-ink text-[11px] font-semibold">
          Today
        </text>
        {LENS_SPECS.map((lens, i) => {
          const y = m.t + i * rowH + rowH / 2;
          const inLens = dated.filter((d) => d.s.lens === lens.id);
          const count = r.signals.filter((s) => s.lens === lens.id).length;
          return (
            <g key={lens.id}>
              <line x1={m.l} x2={W - m.r} y1={y} y2={y} className="stroke-concrete" strokeWidth={8} strokeLinecap="round" />
              <text x={m.l - 12} y={y + 4} textAnchor="end" className="fill-ink text-[12px]">
                {LENS_SHORT[lens.id] ?? lens.label} <tspan className="fill-muted">({count})</tspan>
              </text>
              {inLens.map(({ s, x }, j) => {
                const upcoming = s.isUpcoming || x > today;
                const lines = [formatLooseDate(s.date), s.summary.length > 140 ? `${s.summary.slice(0, 137)}...` : s.summary];
                return (
                  <g
                    key={s.id}
                    tabIndex={0}
                    aria-label={`${s.title}, ${formatLooseDate(s.date)}`}
                    onMouseMove={(e) => t.show(e, s.title, lines)}
                    onMouseLeave={t.hide}
                    onFocus={(e) => t.show(e, s.title, lines)}
                    onBlur={t.hide}
                    className="cursor-default outline-none"
                  >
                    <circle cx={sx(x)} cy={y + ((j % 2) * 2 - 1) * 3} r={12} className="fill-transparent" />
                    <circle
                      cx={sx(x)}
                      cy={y + ((j % 2) * 2 - 1) * 3}
                      r={6}
                      className={upcoming ? "fill-paper stroke-ink" : "fill-ink stroke-paper"}
                      strokeWidth={2}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-xs text-muted">
        Filled dots have happened, open dots are announced and upcoming. Counts include undated signals{undated ? ` (${undated} undated, not plotted)` : ""}.
      </p>
      {t.node}
    </div>
  );
}

/* ---------------- Sources ---------------- */

function SourceSummary({ r }: { r: Report }) {
  const byDomain = new Map<string, number>();
  for (const e of r.evidence) byDomain.set(e.domain, (byDomain.get(e.domain) ?? 0) + 1);
  const top = [...byDomain.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = top[0]?.[1] ?? 1;
  const sc = r.quality.sourceCheck;
  const proof =
    r.run.mode === "live"
      ? { value: "100%", label: "of sources taken from the API's own citations" }
      : sc
        ? { value: `${sc.found + sc.close} of ${sc.found + sc.close + sc.unreachable}`, label: "quotes confirmed on their pages" }
        : { value: "Manual", label: "sources gathered by hand for this reference run" };
  const tiles = [
    { value: String(r.evidence.length), label: "sources" },
    { value: String(byDomain.size), label: "distinct sites" },
    { value: String(r.signals.length), label: "dated signals" },
    proof,
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-2">
        {tiles.map((tile) => (
          <div key={tile.label}>
            <dd className="text-3xl font-semibold leading-none [font-stretch:75%]">{tile.value}</dd>
            <dt className="mt-1 text-sm text-muted">{tile.label}</dt>
          </div>
        ))}
      </dl>
      <div>
        <p className="text-sm text-muted">Most cited sites</p>
        <ul className="mt-2 space-y-1.5">
          {top.map(([d, n]) => (
            <li key={d} className="grid grid-cols-[minmax(0,9rem)_1fr_1.5rem] items-center gap-2 text-sm">
              <span className="truncate">{d}</span>
              <span className="h-2 rounded-r-[4px] bg-ink" style={{ width: `${(n / max) * 100}%` }} aria-hidden />
              <span className="text-right text-muted">{n}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ResearchAnalytics({ report }: { report: Report }) {
  return (
    <section aria-labelledby="analytics-title" className="min-w-0 space-y-4">
      <h2 id="analytics-title" className="subhead text-xl">
        Research at a glance
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Where to lead" note="Each play by the size of the prize and how reachable the buyer is.">
          <PriorityMap r={report} />
        </Panel>
        <Panel title="Touchpoints each play uses" note="Where the codes and links would live, across the ranked plays.">
          <TouchpointGrid r={report} />
        </Panel>
      </div>
      <Panel title="What the research found, over time" note="Every dated signal, by research lens, around today.">
        <SignalTimeline r={report} />
      </Panel>
      <Panel title="Sources">
        <SourceSummary r={report} />
      </Panel>
    </section>
  );
}
