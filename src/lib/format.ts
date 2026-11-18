import { parseLooseDate } from "@/agent/score";
import type { Channel, Report, Urgency } from "@/agent/types";

export const URGENCY_LABEL: Record<Urgency, string> = {
  now: "Act now",
  next_90_days: "Next 90 days",
  next_event_cycle: "Next event cycle",
  evergreen: "Any time",
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  tv_broadcast: "TV and broadcast",
  streaming_ctv: "Streaming and CTV",
  social: "Social",
  email_crm: "Email and CRM",
  live_events: "Live events",
  venue_signage: "Venue signage",
  ooh: "Out of home",
  packaging: "Packaging",
  retail: "Retail",
  ecommerce: "E-commerce",
  print_direct_mail: "Print and mail",
  hospitality: "Hospitality",
  merchandise: "Merchandise",
  ticketing: "Ticketing",
  app_digital: "App and digital",
  sponsorship: "Sponsorship",
};

export const COMPONENT_LABEL = {
  timeliness: "Timing",
  scale: "Scale",
  fit: "Fit",
  evidence: "Proof",
  access: "Access",
} as const;

export type Sector = "best" | "good" | "mid" | "low";
export function sector(score: number): Sector {
  if (score >= 5) return "best";
  if (score >= 4) return "good";
  if (score >= 3) return "mid";
  return "low";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-19" -> "Nov 19, 2026", "2026-09" -> "Sep 2026", "2027" -> "2027". */
export function formatLooseDate(s: string | null | undefined): string {
  if (!s) return "Undated";
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(s.trim());
  if (!m) return s;
  if (m[3]) return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
  if (m[2]) return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  return m[1];
}

export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / 864e5);
}

export function relativeDays(dateStr: string, now: Date): string | null {
  if (process.env.STATIC_DATES === "1") return null; // static export: a fixed page cannot say "tomorrow"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = daysBetween(now, new Date(`${dateStr}T00:00:00Z`));
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d > 1) return `in ${d} days`;
  if (d === -1) return "yesterday";
  return `${-d} days ago`;
}

/** The next upcoming key date for an account, for the watchlist. */
export function nextMoment(report: Report, now: Date): { label: string; when: string } | null {
  const upcoming = report.entity.keyDates
    .filter((k) => k.isUpcoming)
    .map((k) => ({ k, d: parseLooseDate(k.date) }))
    .filter((x) => x.d && daysBetween(now, x.d) >= -3)
    .sort((a, b) => a.d!.getTime() - b.d!.getTime());
  const first = upcoming[0];
  if (!first) return null;
  return { label: first.k.label, when: relativeDays(first.k.date, now) ?? formatLooseDate(first.k.date) };
}

export function formatGeneratedAt(iso: string): string {
  return formatLooseDate(iso.slice(0, 10));
}

export const MODE_LABEL: Record<Report["run"]["mode"], string> = {
  live: "Live API run",
  claude_code: "Claude Code run",
  reference: "Reference run",
  mock: "Replay",
};

export const CHECK_LABEL = {
  found: "quote found on page",
  close: "quote closely matches page",
  unreachable: "page could not be checked",
  not_found: "quote not on page",
} as const;
