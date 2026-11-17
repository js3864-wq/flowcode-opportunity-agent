import fs from "node:fs/promises";
import path from "node:path";
import { similarity } from "@/agent/verify";
import { slugify, toMarkdown } from "@/agent/render";
import type { ProgressEvent, Report } from "@/agent/types";

/**
 * File-backed report store: data/reports/<slug>.json (+ .md). Good enough for a demo and for
 * the CLI. In production this becomes a table keyed by company id with one row per run
 * (see README, "Running it across thousands of companies").
 */
const DIR = path.join(process.cwd(), "data", "reports");
const memory = new Map<string, Report>(); // fallback when the filesystem is read-only (e.g. serverless)

export async function listReports(): Promise<Report[]> {
  const out = new Map<string, Report>();
  try {
    for (const f of await fs.readdir(DIR)) {
      if (!f.endsWith(".json")) continue;
      const r = JSON.parse(await fs.readFile(path.join(DIR, f), "utf8")) as Report;
      out.set(r.slug, r);
    }
  } catch {
    /* no reports yet */
  }
  for (const [slug, r] of memory) out.set(slug, r);
  return [...out.values()].sort((a, b) => a.entity.name.localeCompare(b.entity.name));
}

export async function getReport(slug: string): Promise<Report | null> {
  if (memory.has(slug)) return memory.get(slug)!;
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, `${slug}.json`), "utf8")) as Report;
  } catch {
    return null;
  }
}

/** Find a saved report that matches free-text input ("vegas gp", a URL, an alias). */
export async function findReport(input: string): Promise<Report | null> {
  const all = await listReports();
  const q = slugify(input);
  const direct = all.find((r) => r.slug === q || slugify(r.input) === q);
  if (direct) return direct;
  let best: { r: Report; s: number } | null = null;
  for (const r of all) {
    const names = [r.entity.name, r.input, r.entity.website ?? "", ...r.entity.aliases];
    const s = Math.max(...names.map((n) => similarity(n.replace(/[-.]/g, " "), input.replace(/[-.]/g, " "))));
    if (!best || s > best.s) best = { r, s };
  }
  return best && best.s >= 0.25 ? best.r : null;
}

export async function saveReport(report: Report): Promise<{ persisted: boolean }> {
  memory.set(report.slug, report);
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(path.join(DIR, `${report.slug}.json`), JSON.stringify(report, null, 2));
    await fs.writeFile(path.join(DIR, `${report.slug}.md`), toMarkdown(report));
    return { persisted: true };
  } catch {
    return { persisted: false };
  }
}

/** Mock mode: replay a saved report with the same progress events a live run emits. */
export async function replay(report: Report, onEvent: (e: ProgressEvent) => void, delayMs = 450): Promise<Report> {
  const wait = () => new Promise((r) => setTimeout(r, delayMs));
  const checked = report.opportunities.filter((o) => o.verification.verdict !== "unchecked").length;
  const steps: [string, string, string][] = [
    ["resolve", `Identifying "${report.input}"`, `${report.entity.name}${report.entity.operator ? ` (${report.entity.operator})` : ""}`],
    ["research", "Researching six lenses in parallel", `${report.evidence.length} sources collected`],
    ["signals", "Extracting dated, cited signals", `${report.signals.length} signals kept`],
    ["synthesize", "Matching signals to Flowcode plays", `${report.opportunities.length} opportunities drafted`],
    [
      "factcheck",
      "Fact-checking every claim against its sources",
      checked ? `${checked} plays fact-checked against cited snippets` : "Fact-check not run for this saved reference report",
    ],
    ["rank", "Scoring and ranking", `Top score ${report.opportunities[0]?.score.total ?? "n/a"}`],
  ];
  for (const [step, label, log] of steps) {
    onEvent({ type: "step", step, label });
    if (step === "research") {
      // Replay the sources lens by lens so the live view fills in the way a real run does.
      for (const lens of ["campaigns", "experiences", "commerce", "partnerships", "customer", "strategy"]) {
        onEvent({ type: "activity", kind: "lens", lens, status: "active" });
        for (const e of report.evidence.filter((x) => x.lens === lens)) {
          onEvent({ type: "activity", kind: "read", url: e.url, domain: e.domain });
          await new Promise((r) => setTimeout(r, Math.round(delayMs / 4)));
        }
        await wait();
        onEvent({ type: "activity", kind: "lens", lens, status: "done" });
      }
    }
    await wait();
    onEvent({ type: "log", message: log });
  }
  onEvent({ type: "done", report });
  return report;
}
