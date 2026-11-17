import { productName, proofPoint } from "@/agent/flowcode";
import { displayRefs } from "@/agent/render";
import type { Evidence, Opportunity, Signal } from "@/agent/types";
import { CHANNEL_LABEL, COMPONENT_LABEL, URGENCY_LABEL, formatLooseDate } from "@/lib/format";
import { Sectors } from "./Sectors";

function SourceRefs({ ids, footnote, evidence }: { ids: string[]; footnote: Map<string, number>; evidence: Evidence[] }) {
  const { shown, hidden } = displayRefs(ids, evidence);
  return (
    <span className="whitespace-nowrap">
      {shown.map((id) => (
        <a
          key={id}
          href={`#source-${id}`}
          className="ml-0.5 align-super text-[11px] font-semibold text-sector-best-ink no-underline hover:underline"
          aria-label={`Source ${footnote.get(id)}`}
        >
          [{footnote.get(id)}]
        </a>
      ))}
      {hidden ? <span className="ml-1 text-xs text-muted">+{hidden} more</span> : null}
    </span>
  );
}

const VERDICT: Record<Opportunity["verification"]["verdict"], string> = {
  supported: "Fact-check passed",
  partial: "Fact-check: partly supported",
  unsupported: "Fact-check failed",
  unchecked: "No model fact-check on this run",
};

export function OpportunityDetail({
  o,
  signals,
  evidence,
  footnote,
  isNew,
}: {
  o: Opportunity;
  signals: Signal[];
  evidence: Evidence[];
  footnote: Map<string, number>;
  isNew?: boolean;
}) {
  const proof = proofPoint(o.proofPointId);
  const linked = signals.filter((s) => o.signalIds.includes(s.id));
  const c = o.score.components;
  return (
    <article id={o.id} className="scroll-mt-6 rounded-xl border border-line bg-paper p-5 sm:p-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-[60ch]">
          <p className="text-sm text-muted">
            P{o.rank}. {o.businessUnit}
            {isNew ? <span className="ml-2 rounded bg-sector-good/15 px-1.5 py-0.5 text-xs font-medium text-sector-good-ink">New since last run</span> : null}
          </p>
          <h3 className="subhead mt-1 text-xl leading-tight sm:text-2xl">{o.title}</h3>
        </div>
        <div className="text-right">
          <p className="text-4xl font-semibold leading-none [font-stretch:75%]">{o.score.total}</p>
          <p className="mt-1 text-xs text-muted">of 100</p>
        </div>
      </header>

      <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">When</dt>
          <dd className="mt-0.5">
            <span className={o.timing.urgency === "now" ? "font-semibold text-flag" : "font-medium"}>{URGENCY_LABEL[o.timing.urgency]}</span>
            <span className="block text-muted">{o.timing.window}</span>
          </dd>
        </div>
        <div>
          <dt className="text-muted">Pitch to</dt>
          <dd className="mt-0.5">{o.buyer}</dd>
        </div>
        <div>
          <dt className="text-muted">Touchpoints</dt>
          <dd className="mt-0.5">{o.touchpoints.map((t) => CHANNEL_LABEL[t]).join(", ")}</dd>
        </div>
      </dl>

      <div className="prose-measure mt-6 space-y-5 leading-relaxed">
        <section>
          <h4 className="font-semibold">What&apos;s happening</h4>
          <p className="mt-1">
            {o.whatsHappening}
            <SourceRefs ids={o.evidenceIds} footnote={footnote} evidence={evidence} />
          </p>
        </section>
        <section>
          <h4 className="font-semibold">Why Flowcode fits</h4>
          <p className="mt-1">{o.whyFlowcode}</p>
          {proof ? (
            <p className="mt-2 text-sm text-muted">
              Proof point: {proof.customer}, {proof.result}.{" "}
              <a href={proof.source} className="underline" target="_blank" rel="noreferrer">
                Case study
              </a>
            </p>
          ) : null}
        </section>
        <section>
          <h4 className="font-semibold">The play</h4>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {o.play.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      </div>

      <div className="mt-6 grid gap-6 border-t border-line pt-5 text-sm sm:grid-cols-2">
        <div>
          <p className="text-muted">Flowcode products</p>
          <p className="mt-1">{o.products.map(productName).join(", ")}</p>
          <p className="mt-3 text-muted">Measure it by</p>
          <ul className="mt-1 space-y-0.5">
            {o.kpis.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-muted">Why it ranks here</p>
          <div className="mt-2">
            <Sectors score={o.score} showLabels />
          </div>
          <ul className="mt-3 space-y-1 text-muted">
            <li>
              {COMPONENT_LABEL.timeliness}: {o.ratings.timeliness.why}. {COMPONENT_LABEL.scale}: {o.ratings.scale.why}. {COMPONENT_LABEL.fit}: {o.ratings.fit.why}.{" "}
              {COMPONENT_LABEL.access}: {o.ratings.access.why}.
            </li>
            {o.score.adjustments.map((a) => (
              <li key={a}>{a}.</li>
            ))}
            {c.timeliness !== o.ratings.timeliness.score ? <li>Model rated timing {o.ratings.timeliness.score}, guardrail applied.</li> : null}
          </ul>
        </div>
      </div>

      {o.caveats.length || o.verification.issues.length ? (
        <div className="mt-5 rounded-lg bg-sector-mid/15 p-4 text-sm">
          <p className="font-semibold text-sector-mid-ink">Check before outreach</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {[...o.caveats, ...o.verification.issues].map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="group mt-5 text-sm">
        <summary className="inline-flex items-center gap-2 font-medium text-muted hover:text-ink">
          <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
            ›
          </span>
          Evidence trail: {linked.length} signal{linked.length === 1 ? "" : "s"}, {o.evidenceIds.length} source{o.evidenceIds.length === 1 ? "" : "s"}. {VERDICT[o.verification.verdict]}
        </summary>
        <ul className="mt-3 space-y-3 border-l-2 border-line pl-4">
          {linked.map((s) => (
            <li key={s.id}>
              <p>
                <span className="font-medium">{s.title}</span> <span className="text-muted">({formatLooseDate(s.date)})</span>
              </p>
              <p className="text-muted">{s.summary}</p>
              <ul className="mt-1 space-y-1">
                {s.evidenceIds.map((id) => {
                  const e = evidence.find((x) => x.id === id);
                  if (!e) return null;
                  return (
                    <li key={id}>
                      <a href={e.url} target="_blank" rel="noreferrer" className="underline">
                        {e.domain}
                      </a>
                      {e.snippets[0] ? <span className="text-muted"> &ldquo;{e.snippets[0]}&rdquo;</span> : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}
