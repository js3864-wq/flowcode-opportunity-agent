import Link from "next/link";
import { notFound } from "next/navigation";
import { LENS_SPECS } from "@/agent/lenses";
import { OpportunityDetail } from "@/components/OpportunityDetail";
import { ResearchAnalytics } from "@/components/ResearchAnalytics";
import { TimingTower } from "@/components/TimingTower";
import { CHECK_LABEL, MODE_LABEL, formatGeneratedAt, formatLooseDate, relativeDays } from "@/lib/format";
import { absolutePageAge } from "@/agent/evidence";
import { displayRefs } from "@/agent/render";
import { getReport } from "@/lib/store";

export const dynamic = "force-dynamic";

const RELATIONSHIP: Record<string, string> = {
  existing_customer: "Existing Flowcode customer",
  related_account: "Related to a Flowcode account",
  none_found: "No Flowcode relationship found",
};

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getReport(slug);
  if (!r) notFound();
  const now = new Date();

  // Footnote numbers in order of first appearance across the ranked plays.
  const footnote = new Map<string, number>();
  for (const o of r.opportunities) for (const id of displayRefs(o.evidenceIds, r.evidence).shown) if (!footnote.has(id)) footnote.set(id, footnote.size + 1);
  for (const e of r.evidence) if (!footnote.has(e.id)) footnote.set(e.id, footnote.size + 1);
  const sources = [...r.evidence].sort((a, b) => footnote.get(a.id)! - footnote.get(b.id)!);
  const newOpps = new Set(r.delta?.newOpportunityIds ?? []);
  const newSignals = new Set(r.delta?.newSignalIds ?? []);
  const dated = [...r.signals].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return (
    <div className="space-y-12">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-ink">
          Back to watchlist
        </Link>
        <h1 className="display mt-4 max-w-[20ch] text-4xl sm:text-5xl">{r.entity.name}</h1>
        <p className="mt-3 text-muted">
          {r.entity.operator ? `${r.entity.operator}. ` : ""}
          {r.entity.website ? (
            <a href={r.entity.website} className="underline" target="_blank" rel="noreferrer">
              {r.entity.website.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          ) : null}
        </p>
        <p className="prose-measure mt-6 text-xl leading-snug sm:text-2xl">{r.summary.headline}</p>
        <ul className="prose-measure mt-4 list-disc space-y-1.5 pl-5 text-muted">
          {r.summary.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>

      <ResearchAnalytics report={r} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          <TimingTower opportunities={r.opportunities} />
          {r.opportunities.map((o) => (
            <OpportunityDetail key={o.id} o={o} signals={r.signals} evidence={r.evidence} footnote={footnote} isNew={newOpps.has(o.id)} />
          ))}
        </div>

        <aside className="space-y-6 text-sm lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-xl border border-line bg-paper p-5">
            <h2 className="font-semibold">Key dates</h2>
            <ul className="mt-2 space-y-2">
              {r.entity.keyDates.map((k) => {
                const rel = relativeDays(k.date, now);
                return (
                  <li key={k.label}>
                    {k.label}
                    <span className="block text-muted">
                      {formatLooseDate(k.date)}
                      {rel && k.isUpcoming ? `, ${rel}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-xl border border-line bg-paper p-5">
            <h2 className="font-semibold">{RELATIONSHIP[r.relationship.status]}</h2>
            <p className="mt-1 text-muted">{r.relationship.summary}</p>
          </section>

          {r.followOnLeads.length ? (
            <section className="rounded-xl border border-line bg-paper p-5">
              <h2 className="font-semibold">Follow-on leads</h2>
              <p className="mt-1 text-muted">Partner brands that are Flowcode prospects in their own right.</p>
              <ul className="mt-3 space-y-3">
                {r.followOnLeads.map((l) => (
                  <li key={l.brand}>
                    <p className="font-medium">{l.brand}</p>
                    <p className="text-muted">{l.role}</p>
                    <p className="mt-0.5">{l.why}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-xl border border-line bg-paper p-5">
            <h2 className="font-semibold">How this report was made</h2>
            <ul className="mt-2 space-y-1 text-muted">
              <li>
                {MODE_LABEL[r.run.mode]}, as of {formatLooseDate(r.asOf)}
              </li>
              <li>
                {r.quality.evidenceCount} sources from {r.quality.distinctDomains} sites
              </li>
              <li>
                {r.quality.signalsKept} signals kept, {r.quality.signalsDropped.length} dropped for missing sources
              </li>
              <li>{r.quality.opportunitiesDropped.length} plays dropped by verification</li>
              {r.quality.sourceCheck ? (
                <li>
                  Page check: {r.quality.sourceCheck.found + r.quality.sourceCheck.close} quotes confirmed on their pages, {r.quality.sourceCheck.unreachable} pages could
                  not be checked, {r.quality.sourceCheck.notFound} sources dropped
                </li>
              ) : null}
              {r.quality.staleSignals.length ? <li>{r.quality.staleSignals.length} signals older than 12 months</li> : null}
              {r.run.mode === "live" ? (
                <li>
                  {r.run.usage.searches} searches, {Math.round(r.run.durationMs / 1000)}s, about ${r.run.estCostUsd.toFixed(2)}
                </li>
              ) : null}
              {r.delta ? (
                <li>
                  Compared with the run on {formatGeneratedAt(r.delta.previousGeneratedAt)}: {r.delta.newSignalIds.length} new signals, {r.delta.newOpportunityIds.length} new plays
                </li>
              ) : null}
            </ul>
            {r.run.note ? <p className="mt-3 text-muted">{r.run.note}</p> : null}
            <p className="mt-4 flex gap-4">
              <a href={`/api/reports/${r.slug}?format=md`} className="font-medium underline">
                Download Markdown
              </a>
              <a href={`/api/reports/${r.slug}?format=download`} className="font-medium underline">
                Download JSON
              </a>
            </p>
          </section>
        </aside>
      </div>

      <section aria-labelledby="signals-title" className="rounded-xl border border-line bg-paper p-5 sm:p-7">
        <h2 id="signals-title" className="subhead text-xl">
          Everything the research found
        </h2>
        <p className="prose-measure mt-2 text-muted">
          {r.signals.length} dated signals across {LENS_SPECS.length} research lenses, newest first. The plays above are built only from these.
        </p>
        <ul className="mt-5 divide-y divide-line">
          {dated.map((s) => (
            <li key={s.id} className="grid gap-1 py-3 sm:grid-cols-[8rem_1fr] sm:gap-6">
              <span className="text-muted">{formatLooseDate(s.date)}</span>
              <span>
                {newSignals.has(s.id) ? (
                  <span className="mr-2 rounded bg-sector-good/15 px-1.5 py-0.5 text-xs font-medium text-sector-good-ink">New since last run</span>
                ) : null}
                <span className="font-medium">{s.title}.</span> <span className="text-muted">{s.summary}</span>
                {s.evidenceIds.map((id) => (
                  <a key={id} href={`#source-${id}`} className="ml-0.5 align-super text-[11px] font-semibold text-sector-best-ink no-underline hover:underline">
                    [{footnote.get(id)}]
                  </a>
                ))}
                <span className="block text-xs text-muted">{LENS_SPECS.find((l) => l.id === s.lens)?.label ?? s.lens}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sources-title">
        <h2 id="sources-title" className="subhead text-xl">
          Sources
        </h2>
        <ol className="mt-4 space-y-2 text-sm">
          {sources.map((e) => (
            <li key={e.id} id={`source-${e.id}`} className="scroll-mt-6 grid grid-cols-[2rem_1fr] gap-2 target:rounded target:bg-sector-best/10">
              <span className="text-muted">{footnote.get(e.id)}.</span>
              <span>
                <a href={e.url} target="_blank" rel="noreferrer" className="underline">
                  {e.title}
                </a>{" "}
                <span className="text-muted">
                  {e.domain}
                  {e.pageAge ? `, ${formatLooseDate(absolutePageAge(e.pageAge, new Date(`${r.asOf}T00:00:00Z`)))}` : ""}
                  {e.check ? `, ${CHECK_LABEL[e.check.status]}` : ""}
                </span>
                {e.snippets.length ? <span className="block text-muted">&ldquo;{e.snippets.join("” / “")}&rdquo;</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
