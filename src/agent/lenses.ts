import type { LENSES } from "./types";

type LensId = (typeof LENSES)[number];

export interface LensSpec {
  id: LensId;
  label: string;
  /** What to look for. Generic on purpose: the same lenses run on any company. */
  focus: string;
  /** Flowcode channels this lens tends to surface, used to steer queries. */
  hint: string;
}

export const LENS_SPECS: LensSpec[] = [
  {
    id: "campaigns",
    label: "Campaigns and media",
    focus:
      "Current or recent marketing campaigns: TV and broadcast spots, streaming and CTV, out-of-home and billboards, social and creator campaigns, rebrands. Who made them, where they ran, any reach numbers.",
    hint: "broadcast, OOH, social, rebrand",
  },
  {
    id: "experiences",
    label: "Events and experiences",
    focus:
      "Live events, venues, tours, fan zones, pop-ups, activations and attractions. Dates (especially upcoming ones), locations, attendance, what fans can do on site, what is new this year.",
    hint: "events, venues, activations, attendance",
  },
  {
    id: "commerce",
    label: "Products, tickets and retail",
    focus:
      "Product launches, packaging changes, merchandise, retail partnerships, e-commerce, ticketing tiers and hospitality packages, pricing moves.",
    hint: "packaging, merch, tickets, hospitality, retail",
  },
  {
    id: "partnerships",
    label: "Sponsors and partners",
    focus:
      "New or renewed sponsorships and partnerships, title or presenting partners, co-marketing deals, media rights. Name every partner brand and what they get (signage, naming, activation).",
    hint: "sponsors, naming rights, partner activations",
  },
  {
    id: "customer",
    label: "Customer data and loyalty",
    focus:
      "Apps, memberships, loyalty programs, CRM or first-party data initiatives, personalization, any existing QR code or digital-to-physical programs (including vendors), and complaints about fan or customer experience.",
    hint: "loyalty, app, CRM, QR, membership",
  },
  {
    id: "strategy",
    label: "Strategy and leadership",
    focus:
      "Strategic moves and what leaders say: expansions, new properties, contract extensions, earnings or attendance results, leadership changes, legal or reputational risks.",
    hint: "expansion, results, leadership, risk",
  },
];
