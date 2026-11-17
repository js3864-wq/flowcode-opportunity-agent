/**
 * Turns research files in data/reference/<slug>.json into scored, ranked reports in data/reports.
 *
 * Research files come from two places:
 *   - the /research skill in Claude Code, which researches on your Claude plan with no API key
 *     (producedBy: "claude-code")
 *   - research assembled by hand (producedBy: "manual"), like the first three F1 reports
 *
 * Either way this script validates the file against the agent's zod schemas, optionally checks
 * that every quoted snippet appears on its page, then runs the agent's own deterministic stages
 * (signal cleaning, scoring, ranking, dedupe), so every report is scored the same way.
 *
 * npm run reports                                   build every research file
 * npm run reports -- --only las-vegas-grand-prix    build one
 * npm run reports -- --check-sources                fetch each cited page and confirm the quote
 * npm run reports -- --force                        overwrite reports from live API runs too
 */
import fs from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";
import { loadConfig } from "../src/agent/config";
import { domainOf } from "../src/agent/evidence";
import { slugify } from "../src/agent/render";
import { checkEvidence } from "../src/agent/source-check";
import {
  EntitySchema,
  FollowOnLeadSchema,
  Lens,
  OpportunityDraftSchema,
  RelationshipSchema,
  SignalSchema,
  type Evidence,
  type Report,
} from "../src/agent/types";
import { buildOpportunities, cleanSignals } from "../src/agent/verify";
import { getReport, saveReport } from "../src/lib/store";

const EvidenceSchema = z.object({
  id: z.string().regex(/^E\d+$/),
  url: z.string().url(),
  title: z.string(),
  domain: z.string().optional(),
  snippets: z.array(z.string()),
  pageAge: z.string().nullable().optional(),
  lens: Lens,
});

const ResearchSchema = z.object({
  input: z.string(),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  producedBy: z.enum(["claude-code", "manual"]).optional(),
  entity: EntitySchema,
  relationship: RelationshipSchema,
  summary: z.object({ headline: z.string(), bullets: z.array(z.string()) }),
  evidence: z.array(EvidenceSchema),
  signals: z.array(SignalSchema),
  opportunities: z.array(OpportunityDraftSchema),
  followOnLeads: z.array(FollowOnLeadSchema),
});

const NOTES = {
  manual:
    "Reference run. The research was gathered with live web search on the date shown and assembled into the agent's schema by hand. Scoring, ranking and verification ran through the agent's own code.",
  "claude-code":
    "Claude Code run. Researched by Claude Code on a Claude plan with its own web search, then validated, scored and ranked by the agent's code.",
};

const args = process.argv.slice(2);
const only = (() => {
  const i = args.indexOf("--only");
  return i >= 0 ? slugify(args[i + 1] ?? "") : undefined;
})();
const checkSources = args.includes("--check-sources");
const force = args.includes("--force");

async function main() {
  const dir = path.join(process.cwd(), "data", "reference");
  const config = loadConfig();
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json") && (!only || slugify(f.replace(/\.json$/, "")) === only));
  if (!files.length) throw new Error(only ? `No research file data/reference/${only}.json` : "No research files in data/reference");

  let failed = 0;
  for (const file of files) {
    const slug = slugify(file.replace(/\.json$/, ""));
    const parsed = ResearchSchema.safeParse(JSON.parse(await fs.readFile(path.join(dir, file), "utf8")));
    if (!parsed.success) {
      failed++;
      console.error(`\n${file} does not match the schema:`);
      for (const issue of parsed.error.issues.slice(0, 15)) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
      continue;
    }
    const ref = parsed.data;

    const existing = await getReport(slug);
    if (existing?.run.mode === "live" && !force) {
      console.log(`${slug}: skipped. A live API report already exists (use --force to overwrite it).`);
      continue;
    }

    let evidence: Evidence[] = ref.evidence.map((e) => ({ ...e, domain: e.domain || domainOf(e.url), pageAge: e.pageAge ?? null }));
    const ids = new Set(evidence.map((e) => e.id));
    if (ids.size !== evidence.length) console.warn(`${slug}: duplicate evidence ids found`);

    let sourceCheck: Report["quality"]["sourceCheck"];
    if (checkSources) {
      console.log(`${slug}: checking ${evidence.length} sources...`);
      evidence = await checkEvidence(evidence, {
        onProgress: (e, c) => console.log(`  ${c.status.padEnd(11)} ${e.id} ${e.domain}${c.detail ? ` (${c.detail})` : ""}`),
      });
      const dropped = evidence.filter((e) => e.check?.status === "not_found").map((e) => e.id);
      sourceCheck = {
        found: evidence.filter((e) => e.check?.status === "found").length,
        close: evidence.filter((e) => e.check?.status === "close").length,
        notFound: dropped.length,
        unreachable: evidence.filter((e) => e.check?.status === "unreachable").length,
        dropped,
      };
      // A quote that is not on its page is treated like an invented source.
      evidence = evidence.filter((e) => e.check?.status !== "not_found");
    }

    const asOfDate = new Date(`${ref.asOf}T00:00:00Z`);
    const { kept, dropped, stale } = cleanSignals(ref.signals, evidence, asOfDate, config.staleAfterMonths);
    const { opportunities, dropped: oppDropped } = buildOpportunities({
      drafts: ref.opportunities,
      signals: kept,
      evidence,
      asOf: asOfDate,
      staleAfterMonths: config.staleAfterMonths,
    });
    const keptIds = new Set(kept.map((s) => s.id));
    const producedBy = ref.producedBy ?? "manual";

    const report: Report = {
      schemaVersion: 1,
      slug,
      input: ref.input,
      generatedAt: new Date().toISOString(),
      asOf: ref.asOf,
      run: {
        mode: producedBy === "claude-code" ? "claude_code" : "reference",
        models: { research: "Claude Code session", synthesis: "Claude Code session", fast: "none" },
        startedAt: new Date().toISOString(),
        durationMs: 0,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, searches: 0 },
        estCostUsd: 0,
        note: NOTES[producedBy],
      },
      entity: { ...ref.entity, evidenceIds: ref.entity.evidenceIds.filter((id) => evidence.some((e) => e.id === id)) },
      relationship: ref.relationship,
      summary: ref.summary,
      signals: kept,
      opportunities,
      followOnLeads: ref.followOnLeads.map((l) => ({ ...l, signalIds: l.signalIds.filter((id) => keptIds.has(id)) })).filter((l) => l.signalIds.length),
      evidence,
      quality: {
        evidenceCount: evidence.length,
        distinctDomains: new Set(evidence.map((e) => e.domain)).size,
        signalsKept: kept.length,
        signalsDropped: dropped,
        opportunitiesDropped: oppDropped,
        staleSignals: stale,
        sourceCheck,
      },
    };
    await saveReport(report);
    const sc = sourceCheck ? ` Sources: ${sourceCheck.found} found, ${sourceCheck.close} close, ${sourceCheck.unreachable} unchecked, ${sourceCheck.notFound} dropped.` : "";
    console.log(
      `${slug}: ${opportunities.length} plays (${oppDropped.length} dropped), ${kept.length} signals (${dropped.length} dropped), ${evidence.length} sources.${sc} Top: ${opportunities[0]?.score.total ?? "-"} "${opportunities[0]?.title ?? ""}"`,
    );
    for (const d of [...dropped.map((d) => `signal ${d.id}: ${d.reason}`), ...oppDropped.map((d) => `play "${d.title}": ${d.reason}`)]) console.log(`  dropped ${d}`);
  }
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
