import type { ProductId } from "./types";

/**
 * What the agent knows about Flowcode. Every line here is sourced from flowcode.com so the
 * "why Flowcode fits" half of each opportunity is grounded the same way the research half is.
 * Update this file (not the prompts) when the product or the proof points change.
 */

export interface Product {
  id: ProductId;
  name: string;
  does: string;
  source: string;
}

export interface ProofPoint {
  id: string;
  customer: string;
  vertical: string;
  result: string;
  source: string;
}

export const PRODUCTS: Product[] = [
  {
    id: "flowcodes",
    name: "Flowcodes",
    does: "Branded, dynamic QR codes that route, attribute and personalize. The destination can change after printing, so one physical asset can serve many campaigns.",
    source: "https://www.flowcode.com/llms.txt",
  },
  {
    id: "flowurls",
    name: "FlowURLs",
    does: "Short links that capture customer identity on each click. Used on screens, social, SMS and anywhere a code is not practical.",
    source: "https://www.flowcode.com/llms.txt",
  },
  {
    id: "flowhubs",
    name: "FlowHubs",
    does: "AI-personalized landing pages built for QR campaigns: offers, sweepstakes, sign-ups, shop links.",
    source: "https://www.flowcode.com/llms.txt",
  },
  {
    id: "flowid",
    name: "FlowID & Personalization",
    does: "First-party identity captured at real-world touchpoints. Links offline exposure to online conversion and personalizes the next scan.",
    source: "https://www.flowcode.com/llms.txt",
  },
  {
    id: "analytics_integrations",
    name: "Analytics & Integrations",
    does: "Real-time scan tracking, person-level attribution, location data and two-way sync with major CRMs and CDPs.",
    source: "https://www.flowcode.com/llms.txt",
  },
  {
    id: "workspaces_api",
    name: "Workspaces & API",
    does: "Enterprise governance (SSO, audit logs), shared workspaces across teams, brands and partners, and a programmable API.",
    source: "https://www.flowcode.com/llms.txt",
  },
];

export const PROOF_POINTS: ProofPoint[] = [
  {
    id: "c3_presents",
    customer: "C3 Presents (ACL, Lollapalooza, Bonnaroo)",
    vertical: "Festivals and live events",
    result: "1.3M+ audience scans across its 2024 festivals",
    source: "https://www.flowcode.com/customer-stories/c3-presents",
  },
  {
    id: "nfl_shop",
    customer: "NFL Shop",
    vertical: "Broadcast and e-commerce",
    result: "$250 revenue per scan and 10,000 engagements in 60 seconds from one broadcast spot",
    source: "https://www.flowcode.com/customer-stories/nfl-shop",
  },
  {
    id: "pittsburgh_penguins",
    customer: "Pittsburgh Penguins",
    vertical: "In-venue sports",
    result: "88% conversion rate and $8,000 in revenue in 30 minutes from in-arena live reads",
    source: "https://www.flowcode.com/customer-stories/pittsburgh-penguins",
  },
  {
    id: "ceremony_of_roses",
    customer: "Ceremony of Roses (Zach Bryan tour)",
    vertical: "Touring and merchandise",
    result: "$1.8M in incremental merch revenue while growing the artist's CRM",
    source: "https://www.flowcode.com/case-study/ceremony-of-roses",
  },
  {
    id: "clear",
    customer: "CLEAR",
    vertical: "Travel and airport touchpoints",
    result: "1.2M+ traveler connections across 7,000+ airport touchpoints",
    source: "https://www.flowcode.com/llms.txt",
  },
  {
    id: "sports_benchmark",
    customer: "Flowcode sports and entertainment benchmark",
    vertical: "Sports and entertainment",
    result: "75% higher than average conversion rate for first-party data collection",
    source: "https://www.flowcode.com/blog/winning-strategies-for-fan-engagement-in-sports-with-flowcode",
  },
];

export const POSITIONING = [
  "Flowcode turns physical touchpoints (TV, OOH, venues, packaging, retail, events) into measurable, addressable customer connections.",
  "The buyer outcome is first-party data the brand owns, attribution from offline exposure to online conversion, and revenue at the moment of attention.",
  "Flowcode's team does much of the build work for customers, so speed to launch is part of the pitch.",
  "Strongest verticals with public proof: sports and entertainment, live events and festivals, broadcast, retail and CPG packaging, travel.",
];

export function productName(id: ProductId): string {
  return PRODUCTS.find((p) => p.id === id)?.name ?? id;
}

export function proofPoint(id: string | null): ProofPoint | undefined {
  return id ? PROOF_POINTS.find((p) => p.id === id) : undefined;
}

/** Rendered once into the synthesis system prompt (and cached across companies). */
export function catalogForPrompt(): string {
  const products = PRODUCTS.map((p) => `- ${p.id}: ${p.name}. ${p.does}`).join("\n");
  const proofs = PROOF_POINTS.map((p) => `- ${p.id}: ${p.customer} (${p.vertical}). ${p.result}.`).join("\n");
  return `FLOWCODE POSITIONING\n${POSITIONING.map((l) => `- ${l}`).join("\n")}\n\nPRODUCTS (use these ids)\n${products}\n\nPROOF POINTS (use these ids, or null if none fits)\n${proofs}`;
}
