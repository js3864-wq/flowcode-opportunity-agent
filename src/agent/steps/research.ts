import type { AgentConfig } from "../config";
import type { EvidenceLedger } from "../evidence";
import { LENS_SPECS, type LensSpec } from "../lenses";
import type { Llm } from "../llm";
import {
  EntitySchema,
  RelationshipSchema,
  SignalsSchema,
  type Entity,
  type Relationship,
  type Signal,
} from "../types";

const RESEARCH_SYSTEM = `You are a senior account researcher. You find what a company is doing right now, with sources.
Rules:
- Search the web. Prefer the company's own site and newsroom, then trade press and major outlets.
- Report concrete, dated facts: what, when, where, how big (numbers), which partner brands, which touchpoints.
- Prioritize the last 90 days and anything upcoming in the next 12 months. Older facts only when still in force.
- No background filler, no opinions, no recommendations. If you find nothing recent, say so plainly.
- Write short factual paragraphs. Every factual sentence must be supported by a search result.`;

export async function resolveEntity(opts: {
  llm: Llm;
  config: AgentConfig;
  ledger: EvidenceLedger;
  input: string;
  asOf: string;
}): Promise<{ entity: Entity; notes: string }> {
  const { llm, config, ledger, input, asOf } = opts;
  const notes = await llm.searchNotes({
    model: config.models.research,
    system: RESEARCH_SYSTEM,
    lens: "profile",
    ledger,
    maxUses: 4,
    prompt: `Today is ${asOf}. Identify the organization behind this input: "${input}".
Find: official website, who operates or owns it, what it does and how it makes money, its distinct business units or properties,
upcoming key dates in the next 12 months (events, launches, seasons, earnings), and its main audiences.`,
  });

  const entity = await llm.structured({
    model: config.models.fast,
    schema: EntitySchema,
    system: "Extract a company profile from research notes. Use only facts in the notes. Evidence ids appear in square brackets.",
    prompt: `Input: "${input}"\nToday: ${asOf}\n\nNOTES\n${notes}\n\nReturn the profile. evidenceIds must be ids that appear in the notes.`,
    maxTokens: 6000,
  });
  return { entity, notes };
}

export function lensPrompt(entity: Entity, lens: LensSpec, asOf: string): string {
  const units = entity.businessUnits.length ? `Business units: ${entity.businessUnits.join("; ")}.` : "";
  const dates = entity.keyDates.length ? `Known key dates: ${entity.keyDates.map((d) => `${d.label} (${d.date})`).join("; ")}.` : "";
  return `Today is ${asOf}.
Company: ${entity.name}${entity.operator ? ` (operated by ${entity.operator})` : ""}${entity.website ? `, ${entity.website}` : ""}.
${entity.summary} ${units} ${dates}

Research lens: ${lens.label}.
Find: ${lens.focus}
Search with specific queries (company name plus terms like: ${lens.hint}, and the current or next year).`;
}

export async function runLenses(opts: {
  llm: Llm;
  config: AgentConfig;
  ledger: EvidenceLedger;
  entity: Entity;
  asOf: string;
  onLens?: (lens: LensSpec, status: "start" | "done" | "failed", detail?: string) => void;
}): Promise<{ lens: LensSpec; notes: string }[]> {
  const { llm, config, ledger, entity, asOf, onLens } = opts;
  const results: { lens: LensSpec; notes: string }[] = [];
  const queue = [...LENS_SPECS];

  async function worker() {
    while (queue.length) {
      const lens = queue.shift()!;
      onLens?.(lens, "start");
      try {
        const notes = await llm.searchNotes({
          model: config.models.research,
          system: RESEARCH_SYSTEM,
          lens: lens.id,
          ledger,
          maxUses: config.maxSearchesPerLens,
          prompt: lensPrompt(entity, lens, asOf),
        });
        results.push({ lens, notes });
        onLens?.(lens, "done");
      } catch (err) {
        // One failed lens should not sink the report. The quality section shows the gap.
        results.push({ lens, notes: "" });
        onLens?.(lens, "failed", err instanceof Error ? err.message : String(err));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, config.lensConcurrency) }, worker));
  return LENS_SPECS.map((l) => results.find((r) => r.lens.id === l.id)!).filter(Boolean);
}

export async function checkRelationship(opts: {
  llm: Llm;
  config: AgentConfig;
  ledger: EvidenceLedger;
  entity: Entity;
}): Promise<Relationship> {
  const { llm, config, ledger, entity } = opts;
  const names = [entity.name, entity.operator, ...entity.aliases].filter(Boolean).slice(0, 4);
  const notes = await llm.searchNotes({
    model: config.models.fast,
    system: "You check whether a company already appears in Flowcode's customer stories, case studies, partner pages or blog. Report only what the search results show.",
    lens: "relationship",
    ledger,
    maxUses: 2,
    allowedDomains: ["flowcode.com"],
    prompt: `Does Flowcode mention any of these as a customer, partner or case study: ${names.map((n) => `"${n}"`).join(", ")}? Also note any closely related account (same owner, same venue, same league).`,
    maxTokens: 4000,
  });
  if (!notes) return { status: "none_found", summary: "No public Flowcode case study found.", evidenceIds: [] };
  return llm.structured({
    model: config.models.fast,
    schema: RelationshipSchema,
    system: "Classify the relationship using only the notes. 'related_account' means a sibling brand, owner, venue or league appears, not the company itself.",
    prompt: `Company: ${entity.name}\n\nNOTES\n${notes}`,
    maxTokens: 2000,
  });
}

export async function extractSignals(opts: {
  llm: Llm;
  config: AgentConfig;
  ledger: EvidenceLedger;
  entity: Entity;
  lensNotes: { lens: LensSpec; notes: string }[];
  asOf: string;
}): Promise<Signal[]> {
  const { llm, config, ledger, entity, lensNotes, asOf } = opts;
  const body = lensNotes
    .filter((l) => l.notes)
    .map((l) => `### LENS: ${l.lens.id} (${l.lens.label})\n${l.notes}`)
    .join("\n\n");
  const { signals } = await llm.structured({
    model: config.models.research,
    schema: SignalsSchema,
    system: `You turn research notes into a clean list of signals: discrete, dated facts about what a company is doing.
Rules:
- One signal per distinct fact. Merge duplicates found by different lenses.
- Every signal cites the evidence ids printed next to the supporting text. Never invent ids.
- Keep numbers exactly as written in the notes. If the notes hedge, the signal hedges.
- Skip generic background that is not a current initiative, campaign, product, event, partnership or strategic move.
- Dates: YYYY-MM-DD or YYYY-MM when known. isUpcoming is true if it happens after ${asOf}.`,
    prompt: `Company: ${entity.name}\nToday: ${asOf}\n\n${body}\n\nEVIDENCE TABLE\n${ledger.table()}\n\nReturn 12-30 signals, ids S1, S2, ...`,
    maxTokens: 24000,
  });
  return signals;
}
