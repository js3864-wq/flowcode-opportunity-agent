import type Anthropic from "@anthropic-ai/sdk";
import type { AgentConfig } from "../config";
import type { EvidenceLedger } from "../evidence";
import { catalogForPrompt } from "../flowcode";
import type { Llm } from "../llm";
import {
  CritiqueSchema,
  SynthesisSchema,
  type Critique,
  type Entity,
  type OpportunityDraft,
  type Relationship,
  type Signal,
  type Synthesis,
} from "../types";

const SYNTHESIS_RULES = `You are a Flowcode solutions strategist. You read verified signals about a company and propose where Flowcode can help.

What good looks like:
- Each opportunity starts from a specific thing the company is doing now (a campaign, event, launch, rebrand, partnership).
- It names the exact touchpoint and moment (e.g. "title-sponsor signage being reprinted for 2027", "fan-zone screens during race week"),
  the Flowcode products that fit, what data or revenue it produces, and who to pitch.
- "Why Flowcode" explains the gap Flowcode closes (no attribution on OOH, data owned by a third party, reprint cost, no identity at the venue...)
  and cites one proof point id when one genuinely matches the vertical.
- Prefer fewer, sharper ideas. 5-7 opportunities. No two opportunities should be the same pitch for different touchpoints.

Hard rules:
- Use only facts in the signals. Every opportunity lists the signal ids it rests on. If you infer something, say so in caveats.
- Do not claim the company lacks something unless a signal says so. Phrase gaps as questions to validate when unsure.
- If a signal shows an existing QR, loyalty or data vendor, mention it in caveats and position Flowcode around it.
- Ratings are 1-5 and honest. timeliness = how soon the window opens or closes. scale = audience or revenue at stake.
  fit = how directly Flowcode products solve it. access = how reachable the buyer is (owned touchpoint, existing relationship, clear owner).
- followOnLeads: third-party brands from the signals (sponsors, partners) that are Flowcode prospects in their own right. Max 8.`;

function systemBlocks(): Anthropic.Messages.TextBlockParam[] {
  // The catalog block is identical for every company, so it is cached across a batch run.
  return [
    { type: "text", text: SYNTHESIS_RULES },
    { type: "text", text: catalogForPrompt(), cache_control: { type: "ephemeral" } },
  ];
}

export async function synthesize(opts: {
  llm: Llm;
  config: AgentConfig;
  entity: Entity;
  relationship: Relationship;
  signals: Signal[];
  asOf: string;
}): Promise<Synthesis> {
  const { llm, config, entity, relationship, signals, asOf } = opts;
  const compactSignals = signals.map((s) => ({
    id: s.id,
    lens: s.lens,
    title: s.title,
    summary: s.summary,
    date: s.date,
    upcoming: s.isUpcoming,
    channels: s.channels,
    scale: s.scale,
    sponsors: s.sponsorBrands,
  }));
  return llm.structured({
    model: config.models.synthesis,
    schema: SynthesisSchema,
    system: systemBlocks(),
    prompt: `Today: ${asOf}
COMPANY
${JSON.stringify({ name: entity.name, operator: entity.operator, industry: entity.industry, summary: entity.summary, businessUnits: entity.businessUnits, keyDates: entity.keyDates, audiences: entity.audiences })}

EXISTING FLOWCODE RELATIONSHIP
${relationship.status}: ${relationship.summary}

SIGNALS
${JSON.stringify(compactSignals)}

Return the headline, 3 bullets, 5-7 opportunities and follow-on leads.`,
    maxTokens: 32000,
  });
}

/**
 * Second opinion from a cheaper model: does the evidence actually say what each
 * "what's happening" paragraph claims? Catches drift between sources and synthesis.
 */
export async function critique(opts: {
  llm: Llm;
  config: AgentConfig;
  ledger: EvidenceLedger;
  drafts: OpportunityDraft[];
  signals: Signal[];
}): Promise<Critique> {
  const { llm, config, ledger, drafts, signals } = opts;
  const items = drafts.map((d, index) => {
    const linked = signals.filter((s) => d.signalIds.includes(s.id));
    const evIds = [...new Set(linked.flatMap((s) => s.evidenceIds))];
    return `#${index} ${d.title}\nCLAIM: ${d.whatsHappening}\nSIGNALS: ${linked.map((s) => `${s.id}: ${s.summary}`).join(" | ")}\nEVIDENCE:\n${ledger.table(evIds)}`;
  });
  return llm.structured({
    model: config.models.fast,
    schema: CritiqueSchema,
    system: `You are a fact checker. For each item, compare CLAIM against EVIDENCE snippets and SIGNALS.
supported = every factual statement is backed. partial = mostly backed, list the unbacked statements. unsupported = the core claim is not backed.
Judge facts only (numbers, dates, names, events), not the sales idea.`,
    prompt: items.join("\n\n---\n\n"),
    maxTokens: 8000,
  });
}
