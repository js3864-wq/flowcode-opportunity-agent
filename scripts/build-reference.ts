/**
 * Builds the reference reports in data/reports from the hand-assembled research in data/reference.
 *
 * The research inputs (evidence, signals, opportunity drafts) were gathered with web search and
 * written in the exact shapes the live agent produces. This script validates them against the
 * same zod schemas, then runs the agent's own deterministic stages (signal cleaning, scoring,
 * ranking, dedupe) so reference and live reports are scored the same way.
 *
 * npm run reference
 */
import fs from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";
import { loadConfig } from "../src/agent/config";
import { slugify } from "../src/agent/render";
import {
  EntitySchema,
  FollowOnLeadSchema,
  OpportunityDraftSchema,
  RelationshipSchema,
  SignalSchema,
  type Evidence,
  type Report,
} from "../src/agent/types";
import { buildOpportunities, cleanSignals } from "../src/agent/verify";
import { saveReport } from "../src/lib/store";

const ReferenceSchema = z.object({
  input: z.string(),
  asOf: z.string(),
  entity: EntitySchema,
  relationship: RelationshipSchema,
  summary: z.object({ headline: z.string(), bullets: z.array(z.string()) }),
  evidence: z.array(z.any()),
  signals: z.array(SignalSchema),
  opportunities: z.array(OpportunityDraftSchema),
  followOnLeads: z.array(FollowOnLeadSchema),
});

const NOTE =
  "Reference run. The research was gathered with live web search on Nov 17, 2026 and assembled into the agent's schema by hand. Scoring, ranking and verification ran through the agent's own code. Regenerate it end to end with: npm run batch -- data/targets/us-f1.json";

async function main() {
  const dir = path.join(process.cwd(), "data", "reference");
  const config = loadConfig();
  for (const file of (await fs.readdir(dir)).filter((f) => f.endsWith(".json"))) {
    const raw = JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));
    const ref = ReferenceSchema.parse(raw);
    const evidence = ref.evidence as Evidence[];
    const asOfDate = new Date(`${ref.asOf}T00:00:00Z`);

    const { kept, dropped, stale } = cleanSignals(ref.signals, evidence, asOfDate, config.staleAfterMonths);
    const { opportunities, dropped: oppDropped } = buildOpportunities({
      drafts: ref.opportunities,
      signals: kept,
      evidence,
      asOf: asOfDate,
      staleAfterMonths: config.staleAfterMonths,
    });

    const report: Report = {
      schemaVersion: 1,
      slug: slugify(file.replace(/\.json$/, "")),
      input: ref.input,
      generatedAt: `${ref.asOf}T20:00:00.000Z`,
      asOf: ref.asOf,
      run: {
        mode: "reference",
        models: config.models,
        startedAt: `${ref.asOf}T20:00:00.000Z`,
        durationMs: 0,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, searches: 0 },
        estCostUsd: 0,
        note: NOTE,
      },
      entity: ref.entity,
      relationship: ref.relationship,
      summary: ref.summary,
      signals: kept,
      opportunities,
      followOnLeads: ref.followOnLeads,
      evidence,
      quality: {
        evidenceCount: evidence.length,
        distinctDomains: new Set(evidence.map((e) => e.domain)).size,
        signalsKept: kept.length,
        signalsDropped: dropped,
        opportunitiesDropped: oppDropped,
        staleSignals: stale,
      },
    };
    await saveReport(report);
    console.log(
      `${report.slug}: ${opportunities.length} opportunities (${oppDropped.length} dropped), ${kept.length} signals, ${evidence.length} sources. Top: ${opportunities[0]?.score.total} "${opportunities[0]?.title}"`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
