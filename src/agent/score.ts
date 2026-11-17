import type { Evidence, OpportunityDraft, ScoreBreakdown, Signal } from "./types";

/**
 * Ranking is deliberately simple and inspectable. The model rates four judgment calls
 * (timeliness, scale, fit, access). Code computes evidence strength and applies a few
 * guardrails. Weights live here so a sales team can tune them without touching prompts.
 */
export const WEIGHTS = { timeliness: 0.25, fit: 0.25, scale: 0.2, evidence: 0.15, access: 0.15 } as const;

const clamp = (n: number, lo = 1, hi = 5) => Math.max(lo, Math.min(hi, Math.round(n)));

/** Parse YYYY, YYYY-MM or YYYY-MM-DD (or anything Date understands). */
export function parseLooseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(s.trim());
  if (m) return new Date(Date.UTC(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, m[3] ? Number(m[3]) : 1));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function monthsBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

/** Evidence strength from 1-5: how many independent sources, and how fresh the newest signal is. */
export function evidenceStrength(signals: Signal[], evidence: Evidence[], asOf: Date): { score: number; why: string } {
  const evIds = new Set(signals.flatMap((s) => s.evidenceIds));
  const domains = new Set(evidence.filter((e) => evIds.has(e.id)).map((e) => e.domain));
  const dated = signals.map((s) => parseLooseDate(s.date)).filter((d): d is Date => !!d);
  // Upcoming dates count as fresh: they are announced plans.
  const newestAge = dated.length ? Math.min(...dated.map((d) => Math.max(0, monthsBetween(d, asOf)))) : null;

  let score = 1 + Math.min(3, domains.size); // 1 source -> 2, 3+ sources -> 4
  if (newestAge !== null && newestAge <= 3) score += 1;
  if (newestAge === null) score -= 1;
  score = clamp(score);
  const age = newestAge === null ? "undated" : newestAge <= 3 ? "fresh" : `${Math.round(newestAge)} mo old`;
  return { score, why: `${domains.size} source domain${domains.size === 1 ? "" : "s"}, newest signal ${age}` };
}

export function scoreOpportunity(
  draft: OpportunityDraft,
  linkedSignals: Signal[],
  evidence: Evidence[],
  asOf: Date,
  staleAfterMonths: number,
): ScoreBreakdown {
  const adjustments: string[] = [];
  const ev = evidenceStrength(linkedSignals, evidence, asOf);
  let timeliness = clamp(draft.ratings.timeliness.score);

  // Guardrail: an idea that rests only on stale facts cannot be "timely".
  const dates = linkedSignals.map((s) => parseLooseDate(s.date)).filter((d): d is Date => !!d);
  const allStale = dates.length > 0 && dates.every((d) => monthsBetween(d, asOf) > staleAfterMonths);
  if (allStale && timeliness > 2) {
    timeliness = 2;
    adjustments.push(`Timeliness capped at 2: every linked signal is older than ${staleAfterMonths} months`);
  }

  // Guardrail: urgency "now" with a key date already past is a contradiction.
  const key = parseLooseDate(draft.timing.keyDate);
  if (draft.timing.urgency === "now" && key && monthsBetween(key, asOf) > 1) {
    timeliness = Math.min(timeliness, 3);
    adjustments.push("Timeliness capped at 3: key date has passed");
  }

  // Guardrail: a single-source idea is flagged, not dropped.
  if (ev.score <= 2) adjustments.push("Thin evidence: confirm before outreach");

  const components = {
    timeliness,
    scale: clamp(draft.ratings.scale.score),
    fit: clamp(draft.ratings.fit.score),
    evidence: ev.score,
    access: clamp(draft.ratings.access.score),
  };
  const weighted =
    components.timeliness * WEIGHTS.timeliness +
    components.fit * WEIGHTS.fit +
    components.scale * WEIGHTS.scale +
    components.evidence * WEIGHTS.evidence +
    components.access * WEIGHTS.access;
  // Map 1-5 onto 0-100.
  const total = Math.round(((weighted - 1) / 4) * 100);
  return { total, components, adjustments: [ev.why, ...adjustments] };
}
