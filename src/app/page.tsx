import Link from "next/link";
import type { Report } from "@/agent/types";
import { RunForm } from "@/components/RunForm";
import { Sectors } from "@/components/Sectors";
import { MODE_LABEL, formatGeneratedAt, nextMoment } from "@/lib/format";
import { listReports } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Brands named as partners in more than one account: leads that compound across the watchlist. */
function crossAccountLeads(reports: Report[]) {
  const map = new Map<string, { brand: string; accounts: { name: string; slug: string; role: string }[] }>();
  for (const r of reports) {
    for (const l of r.followOnLeads) {
      const key = l.brand.toLowerCase().replace(/[^a-z0-9]/g, "");
      const entry = map.get(key) ?? { brand: l.brand, accounts: [] };
      entry.accounts.push({ name: r.entity.name, slug: r.slug, role: l.role });
      map.set(key, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.accounts.length - a.accounts.length || a.brand.localeCompare(b.brand));
}

export default async function Watchlist() {
  const reports = await listReports();
  const now = new Date();
  const ranked = [...reports].sort((a, b) => (b.opportunities[0]?.score.total ?? 0) - (a.opportunities[0]?.score.total ?? 0));
  const leads = crossAccountLeads(reports);
  const totalPlays = reports.reduce((n, r) => n + r.opportunities.length, 0);
  const totalSources = reports.reduce((n, r) => n + r.evidence.length, 0);

  return (
    <div className="space-y-14">
      <section>
        <h1 className="display max-w-[18ch] text-4xl sm:text-6xl">US Formula 1 race promoters</h1>
        <p className="prose-measure mt-5 text-lg leading-relaxed text-muted">
          {["No", "One", "Two", "Three", "Four", "Five"][reports.length] ?? reports.length} account{reports.length === 1 ? "" : "s"} on the watchlist, {totalPlays} ranked plays,{" "}
          {totalSources} sources. Each account is researched from scratch, matched to
          Flowcode products and proof points, and fact-checked before it gets here.
        </p>
      </section>

      <section aria-labelledby="accounts-title">
        <h2 id="accounts-title" className="subhead text-xl">
          Accounts, by their strongest play
        </h2>
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
          {ranked.map((r) => {
            const top = r.opportunities[0];
            const moment = nextMoment(r, now);
            return (
              <li key={r.slug}>
                <Link href={`/report/${r.slug}`} className="grid gap-4 p-5 no-underline hover:bg-concrete/50 sm:grid-cols-[1fr_1.4fr_auto] sm:items-center sm:gap-8 sm:p-6">
                  <div>
                    <p className="subhead text-lg leading-tight">{r.entity.name}</p>
                    <p className="mt-1 text-sm text-muted">{r.entity.operator}</p>
                    {moment ? (
                      <p className="mt-2 text-sm">
                        <span className="font-medium">{moment.label}</span> <span className="text-muted">{moment.when}</span>
                      </p>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted">Top play</p>
                    <p className="mt-0.5 font-medium leading-snug">{top?.title ?? "No plays yet"}</p>
                    <p className="mt-2 text-sm text-muted">
                      {r.opportunities.length} plays from {r.evidence.length} sources.{" "}
                      {MODE_LABEL[r.run.mode]}, {formatGeneratedAt(r.generatedAt)}.
                    </p>
                  </div>
                  {top ? (
                    <div className="flex items-center gap-4 sm:flex-col sm:items-end">
                      <p className="text-4xl font-semibold leading-none [font-stretch:75%]">{top.score.total}</p>
                      <Sectors score={top.score} size="sm" />
                    </div>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="leads-title" className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 id="leads-title" className="subhead text-xl">
            Brands that show up across accounts
          </h2>
          <p className="prose-measure mt-2 text-muted">
            Sponsors and partners found while researching each race. A brand that appears at several accounts is a warmer lead than one found
            once, and at scale this list is where new prospects come from.
          </p>
        </div>
        <ul className="divide-y divide-line rounded-xl border border-line bg-paper">
          {leads.slice(0, 10).map((l) => (
            <li key={l.brand} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-3">
              <span className="font-medium">{l.brand}</span>
              <span className="text-sm text-muted">
                {l.accounts.length > 1 ? `${l.accounts.length} accounts: ` : ""}
                {l.accounts.map((a, i) => (
                  <span key={a.slug}>
                    {i > 0 ? ", " : ""}
                    <Link href={`/report/${a.slug}`} className="underline">
                      {a.name.replace(/ \(.*\)$/, "")}
                    </Link>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="run-title" className="rounded-xl border border-line bg-paper p-6 sm:p-8">
        <h2 id="run-title" className="subhead text-xl">
          Research another company
        </h2>
        <p className="prose-measure mt-2 text-muted">
          Enter a company name or website. A live run takes a few minutes and about thirty searches.
        </p>
        <div className="mt-5">
          <RunForm />
        </div>
      </section>
    </div>
  );
}
