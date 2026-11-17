/**
 * npm run agent -- "Las Vegas Grand Prix"            live run (needs ANTHROPIC_API_KEY)
 * npm run agent -- "Las Vegas Grand Prix" --mock     replay the saved report, no API calls
 * npm run agent -- "f1lasvegasgp.com" --as-of 2026-11-17
 * npm run agent -- "Las Vegas Grand Prix" --full     Sonnet + Opus profile (about $2 per company)
 */
import { loadConfig, maxSearches } from "../src/agent/config";
import { runAgent } from "../src/agent/pipeline";
import { toMarkdown } from "../src/agent/render";
import type { ProgressEvent } from "../src/agent/types";
import { findReport, replay, saveReport } from "../src/lib/store";
import { loadEnv } from "./env";

loadEnv();
const args = process.argv.slice(2);
if (args.includes("--full")) process.env.AGENT_PROFILE = "full";
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const input = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--as-of").join(" ").trim();

if (!input) {
  console.error('Usage: npm run agent -- "<company name or URL>" [--mock] [--as-of YYYY-MM-DD]');
  process.exit(1);
}

const t0 = Date.now();
const log = (e: ProgressEvent) => {
  const s = ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
  if (e.type === "step") console.log(`\n${s}s  > ${e.label}`);
  if (e.type === "log") console.log(`${s}s    ${e.message}`);
  if (e.type === "error") console.error(`${s}s  ! ${e.message}`);
};

async function main() {
  const config = loadConfig();
  if (flag("mock") || !config.apiKey) {
    if (!config.apiKey && !flag("mock")) console.log("No ANTHROPIC_API_KEY found: replaying a saved report instead.");
    const saved = await findReport(input);
    if (!saved) throw new Error(`No saved report matches "${input}". Set ANTHROPIC_API_KEY to run live.`);
    const r = await replay(saved, log, 150);
    console.log(`\n${toMarkdown(r).split("\n").slice(0, 40).join("\n")}\n...`);
    return;
  }

  console.log(`Profile ${config.profile}: up to ${maxSearches(config)} searches, spending cap $${config.maxCostUsd.toFixed(2)}.`);
  const previous = await findReport(input);
  const report = await runAgent({ input, asOf: value("as-of"), config, previous, onEvent: log });
  const { persisted } = await saveReport(report);
  console.log(`\nDone in ${(report.run.durationMs / 1000).toFixed(0)}s. ${report.opportunities.length} opportunities, ${report.evidence.length} sources, ${report.run.usage.searches} searches, est. $${report.run.estCostUsd.toFixed(2)}.`);
  if (persisted) console.log(`Saved data/reports/${report.slug}.json and .md`);
  if (report.delta) console.log(`New since ${report.delta.previousGeneratedAt.slice(0, 10)}: ${report.delta.newSignalIds.length} signals, ${report.delta.newOpportunityIds.length} opportunities`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
