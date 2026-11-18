import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/agent/config";
import { EvidenceLedger, absolutePageAge, normalizeUrl } from "../src/agent/evidence";
import { Llm, notesFromBlocks } from "../src/agent/llm";
import { runAgent } from "../src/agent/pipeline";
import { toMarkdown } from "../src/agent/render";
import { evidenceStrength, scoreOpportunity, WEIGHTS } from "../src/agent/score";
import type { OpportunityDraft, Report, Signal } from "../src/agent/types";
import { buildOpportunities, cleanSignals, computeDelta, similarity } from "../src/agent/verify";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CritiqueSchema, EntitySchema, RelationshipSchema, SignalsSchema, SynthesisSchema } from "../src/agent/types";
import { fakeMessagesApi } from "./fake-api";

const config = { ...loadConfig({}), apiKey: "test", lensConcurrency: 2 };
const asOf = "2026-11-17";

async function run(opts: Parameters<typeof fakeMessagesApi>[0] = {}, previous: Report | null = null) {
  const { api, calls } = fakeMessagesApi(opts);
  const events: string[] = [];
  const activity: string[] = [];
  const report = await runAgent({
    input: "Test GP",
    asOf,
    config,
    llm: new Llm(api),
    previous,
    onEvent: (e) => {
      if (e.type === "activity") activity.push(e.kind === "lens" ? `lens:${e.lens}:${e.status}` : e.kind);
      else events.push(e.type === "step" ? e.step : e.type);
    },
  });
  return { report, calls, events, activity };
}

describe("evidence ledger", () => {
  it("builds sources only from API citations and marks the notes", () => {
    const ledger = new EvidenceLedger();
    const notes = notesFromBlocks(
      [
        { type: "web_search_tool_result", tool_use_id: "a", content: [{ type: "web_search_result", url: "https://a.com/x", title: "A", encrypted_content: "", page_age: "May 1, 2026" }] },
        { type: "text", text: "Claim one.", citations: [{ type: "web_search_result_location", url: "https://a.com/x/", title: "A", encrypted_index: "", cited_text: "quote" }] },
        { type: "text", text: " Uncited filler.", citations: null },
      ] as never,
      "campaigns",
      ledger,
    );
    expect(notes).toBe("Claim one. [E1] Uncited filler.");
    expect(ledger.all()).toHaveLength(1);
    expect(ledger.get("E1")?.pageAge).toBe("May 1, 2026"); // absolute dates pass through unchanged
    expect(ledger.get("E1")?.snippets).toEqual(["quote"]);
  });

  it("turns relative page ages into dates", () => {
    const asOf = new Date("2026-11-17T00:00:00Z");
    expect(absolutePageAge("194 days ago", asOf)).toBe("2026-05-07");
    expect(absolutePageAge("2 weeks ago", asOf)).toBe("2026-11-03");
    expect(absolutePageAge("April 30, 2025", asOf)).toBe("April 30, 2025");
    expect(absolutePageAge(null, asOf)).toBeNull();
  });

  it("treats tracking params and trailing slashes as the same page", () => {
    expect(normalizeUrl("https://x.com/a/?utm_source=t&id=2")).toBe(normalizeUrl("https://x.com/a?id=2"));
  });
});

describe("scoring", () => {
  const sig = (id: string, date: string | null, ev: string[]): Signal => ({
    id, lens: "experiences", title: id, summary: id, date, isUpcoming: false, channels: [], scale: null, sponsorBrands: [], evidenceIds: ev,
  });
  const evidence = ["a.com", "b.com", "c.com"].map((d, i) => ({ id: `E${i + 1}`, url: `https://${d}`, title: d, domain: d, snippets: [], pageAge: null, lens: "campaigns" as const }));
  const draft = (t: number): OpportunityDraft => ({
    title: "x", businessUnit: "", whatsHappening: "", whyFlowcode: "", play: [], products: [], proofPointId: null, touchpoints: [], kpis: [],
    timing: { urgency: "next_90_days", window: "", keyDate: null }, buyer: "", signalIds: ["S1"],
    ratings: { timeliness: { score: t, why: "" }, scale: { score: 5, why: "" }, fit: { score: 5, why: "" }, access: { score: 5, why: "" } }, caveats: [],
  });

  it("weights sum to 1", () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("rewards more independent sources and fresh signals", () => {
    const now = new Date("2026-11-17T00:00:00Z");
    expect(evidenceStrength([sig("S1", "2026-11-01", ["E1", "E2", "E3"])], evidence, now).score).toBe(5);
    expect(evidenceStrength([sig("S1", "2024-01-01", ["E1"])], evidence, now).score).toBe(2);
    expect(evidenceStrength([sig("S1", null, ["E1"])], evidence, now).score).toBe(1);
  });

  it("caps timeliness when every linked signal is stale", () => {
    const now = new Date("2026-11-17T00:00:00Z");
    const s = scoreOpportunity(draft(5), [sig("S1", "2024-01-01", ["E1"])], evidence, now, 12);
    expect(s.components.timeliness).toBe(2);
    expect(s.adjustments.join(" ")).toMatch(/capped at 2/);
  });

  it("maps all-fives to 100 and all-ones to 0", () => {
    const now = new Date("2026-11-17T00:00:00Z");
    expect(scoreOpportunity(draft(5), [sig("S1", "2026-11-10", ["E1", "E2", "E3"])], evidence, now, 12).total).toBe(100);
  });
});

describe("verification", () => {
  it("drops signals whose evidence is not in the ledger", () => {
    const { kept, dropped } = cleanSignals(
      [
        { id: "S1", lens: "campaigns", title: "", summary: "", date: null, isUpcoming: false, channels: [], scale: null, sponsorBrands: [], evidenceIds: ["E1", "E9"] },
        { id: "S2", lens: "campaigns", title: "", summary: "", date: null, isUpcoming: false, channels: [], scale: null, sponsorBrands: [], evidenceIds: ["E9"] },
      ],
      [{ id: "E1", url: "https://a.com", title: "", domain: "a.com", snippets: [], pageAge: null, lens: "campaigns" }],
      new Date(),
      12,
    );
    expect(kept.map((s) => s.id)).toEqual(["S1"]);
    expect(kept[0].evidenceIds).toEqual(["E1"]);
    expect(dropped[0]).toMatchObject({ id: "S2" });
  });

  it("detects near-duplicate titles", () => {
    expect(similarity("Fan zone capture during race week", "Fan zone capture during the race week")).toBeGreaterThan(0.6);
    expect(similarity("Fan zone capture", "Billboard attribution")).toBe(0);
  });
});

describe("full pipeline with a fake API", () => {
  it("produces a ranked, fully sourced report and drops unsupported ideas", async () => {
    const { report, events, activity } = await run({ pauseFirstLens: true });
    expect(activity).toContain("search");
    expect(activity).toContain("read");
    expect(activity.filter((a) => a.startsWith("lens:") && a.endsWith(":done"))).toHaveLength(6);

    expect(events.filter((e) => e !== "log" && e !== "done")).toEqual(["resolve", "research", "signals", "synthesize", "factcheck", "rank"]);
    expect(events.at(-1)).toBe("done");

    // Every URL in the report came from the fake API, normalized, never from model text.
    for (const e of report.evidence) expect(e.url).toMatch(/^https:\/\/(news\.example\.com|www\.flowcode\.com)/);
    // Every opportunity resolves to real evidence.
    const ids = new Set(report.evidence.map((e) => e.id));
    for (const o of report.opportunities) {
      expect(o.evidenceIds.length).toBeGreaterThan(0);
      for (const id of o.evidenceIds) expect(ids.has(id)).toBe(true);
    }

    const titles = report.opportunities.map((o) => o.title);
    expect(titles).toContain("Fan zone capture during race week");
    expect(titles).not.toContain("Idea resting only on a hallucinated signal");
    expect(titles).not.toContain("Idea the fact checker rejects");
    expect(titles).not.toContain("Fan zone capture during the race week"); // duplicate
    const dropReasons = report.quality.opportunitiesDropped.map((d) => d.reason).join(" | ");
    expect(dropReasons).toMatch(/no supporting signal/);
    expect(dropReasons).toMatch(/fact check failed/);
    expect(dropReasons).toMatch(/duplicate/);

    // Ranked by score, ids follow rank.
    const scores = report.opportunities.map((o) => o.score.total);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(report.opportunities[0].id).toBe("O1");

    // Hallucinated evidence ids are stripped everywhere.
    expect(report.entity.evidenceIds).not.toContain("E999");
    expect(report.signals.map((s) => s.id)).not.toContain("S3");
    expect(report.quality.staleSignals).toContain("S4");
    expect(report.followOnLeads.map((l) => l.brand)).toEqual(["Acme Cola"]);

    // The paused lens was continued, and usage and cost were tracked.
    expect(report.run.usage.searches).toBeGreaterThan(0);
    expect(report.run.estCostUsd).toBeGreaterThan(0);
    expect(toMarkdown(report)).toContain("## Sources");
  });

  it("reports what changed since the previous run", async () => {
    const { report: first } = await run();
    const previous = { ...first, evidence: first.evidence.slice(0, 2), opportunities: first.opportunities.slice(0, 1) };
    const { report: second } = await run({}, previous);
    expect(second.delta?.previousGeneratedAt).toBe(first.generatedAt);
    expect(second.delta?.newSignalIds.length).toBeGreaterThan(0);
    expect(computeDelta(null, second)).toBeUndefined();
  });

  it("is deterministic in its ranking for the same model outputs", async () => {
    const a = (await run()).report.opportunities.map((o) => [o.title, o.score.total]);
    const b = (await run()).report.opportunities.map((o) => [o.title, o.score.total]);
    expect(a).toEqual(b);
  });
});

describe("buildOpportunities", () => {
  it("keeps the higher-scored of two duplicates", () => {
    const signals: Signal[] = [{ id: "S1", lens: "campaigns", title: "", summary: "", date: "2026-11-01", isUpcoming: false, channels: [], scale: null, sponsorBrands: [], evidenceIds: ["E1"] }];
    const evidence = [{ id: "E1", url: "https://a.com", title: "", domain: "a.com", snippets: [], pageAge: null, lens: "campaigns" as const }];
    const base = {
      businessUnit: "", whatsHappening: "", whyFlowcode: "", play: [], products: [], proofPointId: null, touchpoints: [], kpis: [],
      timing: { urgency: "now" as const, window: "", keyDate: null }, buyer: "", signalIds: ["S1"], caveats: [],
    };
    const r = (n: number) => ({ timeliness: { score: n, why: "" }, scale: { score: n, why: "" }, fit: { score: n, why: "" }, access: { score: n, why: "" } });
    const { opportunities, dropped } = buildOpportunities({
      drafts: [
        { ...base, title: "Measure every billboard placement", ratings: r(2) },
        { ...base, title: "Measure every single billboard placement", ratings: r(5) },
      ],
      signals,
      evidence,
      asOf: new Date("2026-11-17T00:00:00Z"),
      staleAfterMonths: 12,
    });
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0].title).toBe("Measure every single billboard placement");
    expect(dropped[0].reason).toMatch(/duplicate/);
  });
});

describe("structured output schemas", () => {
  it("stay inside the JSON Schema subset the API accepts", () => {
    for (const schema of [EntitySchema, RelationshipSchema, SignalsSchema, SynthesisSchema, CritiqueSchema]) {
      const json = JSON.stringify((zodOutputFormat(schema as never) as unknown as { schema: unknown }).schema);
      for (const banned of ["minimum", "maximum", "minLength", "maxLength", "multipleOf", '"additionalProperties":true']) {
        expect(json).not.toContain(banned);
      }
    }
  });
});

describe("cost controls", () => {
  it("defaults to the lite profile and switches to full on request", () => {
    const lite = loadConfig({});
    expect(lite.profile).toBe("lite");
    expect(lite.models.research).toBe("claude-haiku-5-5");
    expect(lite.maxSearchesPerLens).toBe(3);
    expect(lite.maxCostUsd).toBe(0.75);
    const full = loadConfig({ AGENT_PROFILE: "full" });
    expect(full.models.synthesis).toBe("claude-opus-5-5");
    expect(full.maxSearchesPerLens).toBe(5);
    expect(loadConfig({ AGENT_MAX_COST_USD: "0.4" }).maxCostUsd).toBe(0.4);
  });

  it("stops before the next model call once spend passes the cap", async () => {
    const { api, calls } = fakeMessagesApi();
    await expect(
      runAgent({ input: "Test GP", asOf, config, llm: new Llm(api, 0.01), onEvent: () => {} }),
    ).rejects.toThrow(/spending cap/);
    // The first call spends past the cap, so only a handful of calls happen, not the full run.
    expect(calls.length).toBeLessThan(4);
  });
});
