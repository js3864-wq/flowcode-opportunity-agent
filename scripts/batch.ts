/**
 * Run the agent over a list of companies.
 *
 * npm run batch -- data/targets/us-f1.json
 * npm run batch -- data/targets/us-f1.json --concurrency 2 --skip-fresh-days 7
 * npm run batch -- data/targets/us-f1.json --mock
 * npm run batch -- data/targets/us-f1.json --only "Circuit"    run just the matching targets
 * npm run batch -- data/targets/us-f1.json --full              Sonnet + Opus profile (about $2 per company)
 *
 * --skip-fresh-days N  skips companies whose last live report is newer than N days. This is the
 *                      freshness policy in miniature: refresh on a schedule, not on every run.
 */
import fs from "node:fs/promises";
import { loadConfig, maxSearches } from "../src/agent/config";
import { runAgent } from "../src/agent/pipeline";
import type { Report } from "../src/agent/types";
import { findReport, replay, saveReport } from "../src/lib/store";
import { loadEnv } from "./env";

loadEnv();

interface TargetsFile {
  name: string;
  asOf?: string;
  targets: { input: string; note?: string }[];
}

const args = process.argv.slice(2);
const valueOf = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const num = (name: string, fallback: number) => Number(valueOf(name) ?? fallback);
const file = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && !["--mock", "--full"].includes(args[i - 1])));
const mock = args.includes("--mock");
if (args.includes("--full")) process.env.AGENT_PROFILE = "full";
const only = valueOf("only")?.toLowerCase();

async function main() {
  if (!file) throw new Error("Usage: npm run batch -- <targets.json> [--concurrency N] [--skip-fresh-days N] [--mock]");
  const spec = JSON.parse(await fs.readFile(file, "utf8")) as TargetsFile;
  if (only) spec.targets = spec.targets.filter((t) => t.input.toLowerCase().includes(only));
  const config = loadConfig();
  const concurrency = num("concurrency", 2);
  const skipFreshDays = num("skip-fresh-days", 0);
  const useMock = mock || !config.apiKey;
  if (useMock && !mock) console.log("No ANTHROPIC_API_KEY found: replaying saved reports.");

  console.log(`${spec.name}: ${spec.targets.length} companies, concurrency ${concurrency}${useMock ? ", mock" : ""}`);
  if (!useMock) {
    console.log(
      `Profile ${config.profile}: research ${config.models.research}, plays ${config.models.synthesis}, up to ${maxSearches(config)} searches per company.` +
        `\nSpending cap $${config.maxCostUsd.toFixed(2)} per company, so at most about $${(config.maxCostUsd * spec.targets.length).toFixed(2)} for this batch.`,
    );
  }
  console.log("");
  const queue = [...spec.targets];
  const rows: { input: string; status: string; report?: Report }[] = [];

  async function worker() {
    while (queue.length) {
      const t = queue.shift()!;
      const previous = await findReport(t.input);
      const ageDays = previous ? (Date.now() - new Date(previous.generatedAt).getTime()) / 864e5 : Infinity;
      if (!useMock && skipFreshDays && previous?.run.mode === "live" && ageDays < skipFreshDays) {
        rows.push({ input: t.input, status: `skipped (fresh, ${ageDays.toFixed(1)}d old)`, report: previous });
        continue;
      }
      try {
        if (useMock && !previous) throw new Error("no saved report to replay");
        const report = useMock
          ? await replay(previous!, () => {}, 0)
          : await runAgent({
              input: t.input,
              asOf: spec.asOf,
              config,
              previous,
              onEvent: (e) => e.type === "step" && console.log(`[${t.input}] ${e.label}`),
            });
        if (!useMock) await saveReport(report);
        rows.push({ input: t.input, status: "ok", report });
      } catch (err) {
        rows.push({ input: t.input, status: `failed: ${err instanceof Error ? err.message : err}` });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  console.log("\nCompany".padEnd(34) + "Status".padEnd(12) + "Opps  Top  Sources  Searches  Cost");
  let cost = 0;
  for (const r of rows) {
    const rep = r.report;
    cost += rep && r.status === "ok" && !useMock ? rep.run.estCostUsd : 0;
    console.log(
      r.input.slice(0, 32).padEnd(34) +
        r.status.slice(0, 10).padEnd(12) +
        String(rep?.opportunities.length ?? "-").padEnd(6) +
        String(rep?.opportunities[0]?.score.total ?? "-").padEnd(5) +
        String(rep?.evidence.length ?? "-").padEnd(9) +
        String(rep?.run.usage.searches ?? "-").padEnd(10) +
        (rep ? `$${rep.run.estCostUsd.toFixed(2)}` : "-"),
    );
  }
  if (!useMock) console.log(`\nTotal estimated cost this batch: $${cost.toFixed(2)}`);
  for (const r of rows.filter((r) => r.status.startsWith("failed"))) console.log(`\n${r.input}\n  ${r.status}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
