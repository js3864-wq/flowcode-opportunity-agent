import { normalizeUrl } from "./evidence";
import { monthsBetween, parseLooseDate, scoreOpportunity } from "./score";
import type { Critique, Delta, Evidence, Opportunity, OpportunityDraft, Report, Signal } from "./types";

/** Drop signals with no valid evidence, strip unknown evidence ids, flag stale ones. */
export function cleanSignals(signals: Signal[], evidence: Evidence[], asOf: Date, staleAfterMonths: number) {
  const valid = new Set(evidence.map((e) => e.id));
  const kept: Signal[] = [];
  const dropped: { id: string; reason: string }[] = [];
  const stale: string[] = [];
  for (const s of signals) {
    const ids = s.evidenceIds.filter((id) => valid.has(id));
    if (!ids.length) {
      dropped.push({ id: s.id, reason: s.evidenceIds.length ? "cited evidence ids not in ledger" : "no evidence cited" });
      continue;
    }
    const d = parseLooseDate(s.date);
    if (d && !s.isUpcoming && monthsBetween(d, asOf) > staleAfterMonths) stale.push(s.id);
    kept.push({ ...s, evidenceIds: ids });
  }
  return { kept, dropped, stale };
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

export function similarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * Turn model drafts into ranked, verified opportunities.
 * Deterministic: same inputs, same ranking. Every opportunity that survives cites
 * at least one kept signal, and through it at least one ledger source.
 */
export function buildOpportunities(opts: {
  drafts: OpportunityDraft[];
  signals: Signal[];
  evidence: Evidence[];
  critique?: Critique;
  asOf: Date;
  staleAfterMonths: number;
}): { opportunities: Opportunity[]; dropped: { title: string; reason: string }[] } {
  const { drafts, signals, evidence, critique, asOf, staleAfterMonths } = opts;
  const byId = new Map(signals.map((s) => [s.id, s]));
  const dropped: { title: string; reason: string }[] = [];
  const scored: Opportunity[] = [];

  drafts.forEach((draft, index) => {
    const signalIds = draft.signalIds.filter((id) => byId.has(id));
    if (!signalIds.length) {
      dropped.push({ title: draft.title, reason: "no supporting signal after verification" });
      return;
    }
    const review = critique?.reviews.find((r) => Math.round(r.index) === index);
    if (review?.verdict === "unsupported") {
      dropped.push({ title: draft.title, reason: `fact check failed: ${review.issues.join("; ") || "core claim not in sources"}` });
      return;
    }
    const linked = signalIds.map((id) => byId.get(id)!);
    const evidenceIds = [...new Set(linked.flatMap((s) => s.evidenceIds))];
    scored.push({
      ...draft,
      signalIds,
      id: "",
      rank: 0,
      evidenceIds,
      score: scoreOpportunity({ ...draft, signalIds }, linked, evidence, asOf, staleAfterMonths),
      verification: review ? { verdict: review.verdict, issues: review.issues } : { verdict: "unchecked", issues: [] },
    });
  });

  scored.sort((a, b) => b.score.total - a.score.total);

  // Near-duplicate titles: keep the higher-ranked one.
  const unique: Opportunity[] = [];
  for (const o of scored) {
    const dup = unique.find((u) => similarity(u.title, o.title) >= 0.6);
    if (dup) dropped.push({ title: o.title, reason: `duplicate of "${dup.title}"` });
    else unique.push(o);
  }

  unique.forEach((o, i) => {
    o.rank = i + 1;
    o.id = `O${i + 1}`;
  });
  return { opportunities: unique, dropped };
}

/** What changed since the last run for the same company. Drives "new since last run" in the UI. */
export function computeDelta(prev: Report | null, next: Report): Delta | undefined {
  if (!prev) return undefined;
  const prevUrls = new Set(prev.evidence.map((e) => normalizeUrl(e.url)));
  const newEvidence = new Set(next.evidence.filter((e) => !prevUrls.has(normalizeUrl(e.url))).map((e) => e.id));
  const newSignalIds = next.signals.filter((s) => s.evidenceIds.some((id) => newEvidence.has(id))).map((s) => s.id);
  const newOpportunityIds = next.opportunities
    .filter((o) => !prev.opportunities.some((p) => similarity(p.title, o.title) >= 0.5))
    .map((o) => o.id);
  return { previousGeneratedAt: prev.generatedAt, newSignalIds, newOpportunityIds };
}
