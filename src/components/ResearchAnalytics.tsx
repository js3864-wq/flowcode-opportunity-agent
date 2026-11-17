import type { Report } from "@/agent/types";

/* Sources at the top of a report: how much evidence backs it and where it came from. */

export function ResearchAnalytics({ report: r }: { report: Report }) {
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
    <section aria-labelledby="sources-summary-title" className="min-w-0 rounded-xl border border-line bg-paper p-5 sm:p-6">
      <h2 id="sources-summary-title" className="subhead text-xl">
        Sources at a glance
      </h2>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
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
    </section>
  );
}
