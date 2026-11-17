import * as z from "zod/v4";

/** Touchpoints Flowcode can sit on. Shared vocabulary for signals, opportunities and the UI. */
export const CHANNELS = [
  "tv_broadcast",
  "streaming_ctv",
  "social",
  "email_crm",
  "live_events",
  "venue_signage",
  "ooh",
  "packaging",
  "retail",
  "ecommerce",
  "print_direct_mail",
  "hospitality",
  "merchandise",
  "ticketing",
  "app_digital",
  "sponsorship",
] as const;
export const Channel = z.enum(CHANNELS);
export type Channel = z.infer<typeof Channel>;

/** Research lenses. Each one is a separate, parallel search pass. */
export const LENSES = ["campaigns", "experiences", "commerce", "partnerships", "customer", "strategy"] as const;
export const Lens = z.enum([...LENSES, "profile", "relationship"]);
export type Lens = z.infer<typeof Lens>;

export const PRODUCT_IDS = ["flowcodes", "flowurls", "flowhubs", "flowid", "analytics_integrations", "workspaces_api"] as const;
export const ProductId = z.enum(PRODUCT_IDS);
export type ProductId = z.infer<typeof ProductId>;

export const URGENCY = ["now", "next_90_days", "next_event_cycle", "evergreen"] as const;
export const Urgency = z.enum(URGENCY);
export type Urgency = z.infer<typeof Urgency>;

/* ------------------------------------------------------------------ */
/* Evidence: built in code from the API's own citation objects.        */
/* The model never writes a URL that ends up in a report.              */
/* ------------------------------------------------------------------ */

export interface Evidence {
  id: string; // E1, E2, ...
  url: string;
  title: string;
  domain: string;
  snippets: string[]; // cited_text from web_search_result_location citations (max 150 chars each)
  pageAge: string | null; // from the search result block, when the API provides it
  lens: Lens;
}

/* ------------------------------------------------------------------ */
/* LLM output schemas (structured outputs). Kept inside the supported  */
/* JSON Schema subset: no min/max, no recursive types.                 */
/* ------------------------------------------------------------------ */

export const EntitySchema = z.object({
  name: z.string().describe("Common name of the company, brand or event"),
  website: z.string().nullable(),
  operator: z.string().nullable().describe("Legal operator or parent company, if different"),
  industry: z.string(),
  summary: z.string().describe("Two sentences on what it is and how it makes money"),
  businessUnits: z.array(z.string()).describe("Distinct lines of business or properties worth separate outreach"),
  keyDates: z.array(
    z.object({
      label: z.string(),
      date: z.string().describe("ISO date (YYYY-MM-DD), month (YYYY-MM) or plain text if unknown"),
      isUpcoming: z.boolean(),
    }),
  ),
  audiences: z.array(z.string()),
  aliases: z.array(z.string()),
  evidenceIds: z.array(z.string()),
});
export type Entity = z.infer<typeof EntitySchema>;

export const RelationshipSchema = z.object({
  status: z.enum(["existing_customer", "related_account", "none_found"]),
  summary: z.string().describe("One sentence. Say 'No public Flowcode case study found' when nothing turned up."),
  evidenceIds: z.array(z.string()),
});
export type Relationship = z.infer<typeof RelationshipSchema>;

export const SignalSchema = z.object({
  id: z.string().describe("S1, S2, ..."),
  lens: z.enum(LENSES),
  title: z.string().describe("Short headline of the fact"),
  summary: z.string().describe("1-2 sentences: what is happening, where, when, how big"),
  date: z.string().nullable().describe("When it happened or will happen. YYYY-MM-DD or YYYY-MM. null if unknown"),
  isUpcoming: z.boolean(),
  channels: z.array(Channel),
  scale: z.string().nullable().describe("Audience or spend numbers stated in the sources, else null"),
  sponsorBrands: z.array(z.string()).describe("Third-party brands named as partners or sponsors"),
  evidenceIds: z.array(z.string()).describe("Evidence ids (E#) that directly support this signal"),
});
export const SignalsSchema = z.object({ signals: z.array(SignalSchema) });
export type Signal = z.infer<typeof SignalSchema>;

const Rating = z.object({
  score: z.number().describe("Integer from 1 (weak) to 5 (strong)"),
  why: z.string().describe("One short clause"),
});

export const OpportunityDraftSchema = z.object({
  title: z.string().describe("Action-oriented, specific. Not 'Add QR codes'"),
  businessUnit: z.string(),
  whatsHappening: z.string().describe("2-3 sentences of facts from the signals. No speculation."),
  whyFlowcode: z.string().describe("2-3 sentences tying the gap to specific Flowcode products and a proof point"),
  play: z.array(z.string()).describe("3-4 concrete steps: touchpoint, routing, data captured, follow-up"),
  products: z.array(ProductId),
  proofPointId: z.string().nullable(),
  touchpoints: z.array(Channel),
  kpis: z.array(z.string()),
  timing: z.object({
    urgency: Urgency,
    window: z.string().describe("Plain-language window, e.g. 'Race week, Nov 19-21' or 'Before 2027 signage production'"),
    keyDate: z.string().nullable(),
  }),
  buyer: z.string().describe("Likely team or role to pitch"),
  signalIds: z.array(z.string()),
  ratings: z.object({ timeliness: Rating, scale: Rating, fit: Rating, access: Rating }),
  caveats: z.array(z.string()).describe("Risks, incumbents, unknowns. Empty if none."),
});
export type OpportunityDraft = z.infer<typeof OpportunityDraftSchema>;

export const FollowOnLeadSchema = z.object({
  brand: z.string(),
  role: z.string().describe("How they show up, e.g. 'Title sponsor from 2027'"),
  why: z.string().describe("One sentence on the Flowcode angle for this brand"),
  signalIds: z.array(z.string()),
});
export type FollowOnLead = z.infer<typeof FollowOnLeadSchema>;

export const SynthesisSchema = z.object({
  headline: z.string().describe("One sentence a seller could open a call with"),
  bullets: z.array(z.string()).describe("3 bullets: the biggest current moves"),
  opportunities: z.array(OpportunityDraftSchema),
  followOnLeads: z.array(FollowOnLeadSchema),
});
export type Synthesis = z.infer<typeof SynthesisSchema>;

export const CritiqueSchema = z.object({
  reviews: z.array(
    z.object({
      index: z.number().describe("Item number from the prompt"),
      verdict: z.enum(["supported", "partial", "unsupported"]),
      issues: z.array(z.string()),
    }),
  ),
});
export type Critique = z.infer<typeof CritiqueSchema>;

/* ------------------------------------------------------------------ */
/* Final report                                                        */
/* ------------------------------------------------------------------ */

export interface ScoreBreakdown {
  total: number; // 0-100
  components: { timeliness: number; scale: number; fit: number; evidence: number; access: number }; // 1-5 each
  adjustments: string[];
}

export interface Opportunity extends OpportunityDraft {
  id: string; // O1, O2, ...
  rank: number;
  score: ScoreBreakdown;
  evidenceIds: string[]; // resolved through signals, verified to exist in the ledger
  verification: { verdict: "supported" | "partial" | "unsupported" | "unchecked"; issues: string[] };
}

export interface RunMeta {
  mode: "live" | "reference" | "mock";
  models: { research: string; synthesis: string; fast: string };
  startedAt: string;
  durationMs: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; searches: number };
  estCostUsd: number;
  note?: string;
}

export interface QualityReport {
  evidenceCount: number;
  distinctDomains: number;
  signalsKept: number;
  signalsDropped: { id: string; reason: string }[];
  opportunitiesDropped: { title: string; reason: string }[];
  staleSignals: string[];
}

export interface Delta {
  previousGeneratedAt: string;
  newSignalIds: string[];
  newOpportunityIds: string[];
}

export interface Report {
  schemaVersion: 1;
  slug: string;
  input: string;
  generatedAt: string; // ISO
  asOf: string; // YYYY-MM-DD used for timeliness math
  run: RunMeta;
  entity: Entity;
  relationship: Relationship;
  summary: { headline: string; bullets: string[] };
  signals: Signal[];
  opportunities: Opportunity[];
  followOnLeads: FollowOnLead[];
  evidence: Evidence[];
  quality: QualityReport;
  delta?: Delta;
}

export type ProgressEvent =
  | { type: "step"; step: string; label: string }
  | { type: "log"; message: string }
  | { type: "done"; report: Report }
  | { type: "error"; message: string };
