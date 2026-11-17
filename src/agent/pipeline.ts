import { loadConfig, type AgentConfig } from "./config";
import { EvidenceLedger } from "./evidence";
import { Llm } from "./llm";
import { slugify } from "./render";
import { checkRelationship, extractSignals, resolveEntity, runLenses } from "./steps/research";
import { critique, synthesize } from "./steps/synthesize";
import type { ProgressEvent, Report } from "./types";
import { buildOpportunities, cleanSignals, computeDelta } from "./verify";

export interface RunOptions {
  input: string;
  asOf?: string; // YYYY-MM-DD, defaults to today
  config?: AgentConfig;
  llm?: Llm; // injectable for tests
  previous?: Report | null; // last report for the same company, for change detection
  onEvent?: (e: ProgressEvent) => void;
}

/**
 * Company name or URL in, ranked and sourced opportunity report out.
 *
 *  1. resolve      who is this, what do they run, what dates matter          (1 search turn)
 *  2. research     6 lenses in parallel, server-side web search            (~30 searches)
 *  3. relationship is this already a Flowcode account? (flowcode.com only)  (1-2 searches)
 *  4. signals      notes -> discrete, dated, cited facts                     (structured)
 *  5. synthesize   signals + Flowcode catalog -> opportunities and leads     (structured)
 *  6. fact-check   cheaper model checks each claim against cited snippets   (structured)
 *  7. verify+rank  code drops unsupported items, scores, dedupes, diffs      (deterministic)
 */
export async function runAgent(opts: RunOptions): Promise<Report> {
  const config = opts.config ?? loadConfig();
  const emit = opts.onEvent ?? (() => {});
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);
  const asOfDate = new Date(`${asOf}T00:00:00Z`);
  const started = Date.now();

  let llm = opts.llm;
  if (!llm) {
    if (!config.apiKey) throw new Error("ANTHROPIC_API_KEY is not set. Set it, or replay a saved report in mock mode.");
    llm = Llm.fromApiKey(config.apiKey, config.maxCostUsd);
  }
  const ledger = new EvidenceLedger();

  emit({ type: "step", step: "resolve", label: `Identifying "${opts.input}"` });
  const { entity } = await resolveEntity({ llm, config, ledger, input: opts.input, asOf });
  emit({ type: "log", message: `${entity.name}${entity.operator ? ` (${entity.operator})` : ""}: ${entity.businessUnits.length} business units, ${entity.keyDates.length} key dates` });

  emit({ type: "step", step: "research", label: "Researching six lenses in parallel" });
  const [lensNotes, relationship] = await Promise.all([
    runLenses({
      llm,
      config,
      ledger,
      entity,
      asOf,
      onLens: (lens, status, detail) => {
        if (status === "failed") emit({ type: "log", message: `${lens.label}: failed (${detail})` });
        emit({ type: "activity", kind: "lens", lens: lens.id, status: status === "start" ? "active" : "done" });
      },
      onActivity: (a) => emit({ type: "activity", ...a }),
    }),
    checkRelationship({ llm, config, ledger, entity }).catch(() => ({
      status: "none_found" as const,
      summary: "Relationship check failed. Verify manually.",
      evidenceIds: [],
    })),
  ]);
  emit({ type: "log", message: `${ledger.all().length} sources collected. Flowcode relationship: ${relationship.status}` });

  emit({ type: "step", step: "signals", label: "Extracting dated, cited signals" });
  const rawSignals = await extractSignals({ llm, config, ledger, entity, lensNotes, asOf });
  const evidence = ledger.all();
  const { kept: signals, dropped: signalsDropped, stale } = cleanSignals(rawSignals, evidence, asOfDate, config.staleAfterMonths);
  emit({ type: "log", message: `${signals.length} signals kept, ${signalsDropped.length} dropped, ${stale.length} stale` });

  emit({ type: "step", step: "synthesize", label: "Matching signals to Flowcode plays" });
  const synthesis = await synthesize({ llm, config, entity, relationship, signals, asOf });

  emit({ type: "step", step: "factcheck", label: "Fact-checking every claim against its sources" });
  const review = await critique({ llm, config, ledger, drafts: synthesis.opportunities, signals }).catch((err) => {
    emit({ type: "log", message: `Fact-check skipped: ${err instanceof Error ? err.message : err}` });
    return undefined;
  });

  emit({ type: "step", step: "rank", label: "Scoring and ranking" });
  const { opportunities, dropped } = buildOpportunities({
    drafts: synthesis.opportunities,
    signals,
    evidence,
    critique: review,
    asOf: asOfDate,
    staleAfterMonths: config.staleAfterMonths,
  });
  const validSignalIds = new Set(signals.map((s) => s.id));

  const report: Report = {
    schemaVersion: 1,
    slug: slugify(entity.name || opts.input),
    input: opts.input,
    generatedAt: new Date().toISOString(),
    asOf,
    run: {
      mode: "live",
      profile: config.profile,
      models: config.models,
      startedAt: new Date(started).toISOString(),
      durationMs: Date.now() - started,
      usage: {
        inputTokens: llm.usage.inputTokens,
        outputTokens: llm.usage.outputTokens,
        cacheReadTokens: llm.usage.cacheReadTokens,
        searches: llm.usage.searches,
      },
      estCostUsd: Math.round(llm.usage.costUsd * 100) / 100,
    },
    entity: { ...entity, evidenceIds: entity.evidenceIds.filter((id) => ledger.has(id)) },
    relationship: { ...relationship, evidenceIds: relationship.evidenceIds.filter((id) => ledger.has(id)) },
    summary: { headline: synthesis.headline, bullets: synthesis.bullets },
    signals,
    opportunities,
    followOnLeads: synthesis.followOnLeads
      .map((l) => ({ ...l, signalIds: l.signalIds.filter((id) => validSignalIds.has(id)) }))
      .filter((l) => l.signalIds.length > 0),
    evidence,
    quality: {
      evidenceCount: evidence.length,
      distinctDomains: new Set(evidence.map((e) => e.domain)).size,
      signalsKept: signals.length,
      signalsDropped,
      opportunitiesDropped: dropped,
      staleSignals: stale,
    },
  };
  report.delta = computeDelta(opts.previous ?? null, report);
  emit({ type: "done", report });
  return report;
}
