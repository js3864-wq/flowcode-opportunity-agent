import type { Evidence, Lens } from "./types";

const MAX_SNIPPETS = 4;

/**
 * The search API can report page age as relative text ("194 days ago"). Store and show it as a
 * date instead, so a report read next week does not say the wrong thing.
 */
export function absolutePageAge(pageAge: string | null | undefined, asOf: Date): string | null {
  if (!pageAge) return null;
  const m = /^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/i.exec(pageAge.trim());
  if (!m) return pageAge;
  const n = Number(m[1]);
  const d = new Date(asOf);
  const unit = m[2].toLowerCase();
  if (unit === "day") d.setUTCDate(d.getUTCDate() - n);
  else if (unit === "week") d.setUTCDate(d.getUTCDate() - 7 * n);
  else if (unit === "month") d.setUTCMonth(d.getUTCMonth() - n);
  else if (unit === "year") d.setUTCFullYear(d.getUTCFullYear() - n);
  return d.toISOString().slice(0, 10);
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Normalize URLs so the same page cited twice (tracking params, trailing slash) is one source. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$)/i.test(key)) u.searchParams.delete(key);
    }
    u.hash = "";
    u.hostname = u.hostname.replace(/^www\./, "");
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return url;
  }
}

/**
 * The evidence ledger is the only place URLs enter a report. It is filled from
 * web_search_tool_result blocks and web_search_result_location citations returned by the
 * API, never from model-written text. Later steps refer to evidence by id (E1, E2...),
 * and the verifier drops any id that is not in the ledger.
 */
export class EvidenceLedger {
  private byUrl = new Map<string, Evidence>();
  private seenResults = new Map<string, { title: string; pageAge: string | null }>();
  private counter = 0;

  constructor(initial: Evidence[] = []) {
    for (const e of initial) {
      this.byUrl.set(normalizeUrl(e.url), e);
      const n = Number(e.id.replace(/^E/, ""));
      if (n > this.counter) this.counter = n;
    }
  }

  /** Remember search results (title, page age) so citations can be enriched with them. */
  addResult(url: string, title: string, pageAge: string | null) {
    this.seenResults.set(normalizeUrl(url), { title, pageAge: absolutePageAge(pageAge, new Date()) });
  }

  /** Register a citation and return its evidence id. */
  cite(url: string, title: string | null, citedText: string, lens: Lens): string {
    const key = normalizeUrl(url);
    let ev = this.byUrl.get(key);
    if (!ev) {
      const seen = this.seenResults.get(key);
      ev = {
        id: `E${++this.counter}`,
        url,
        title: title || seen?.title || domainOf(url),
        domain: domainOf(url),
        snippets: [],
        pageAge: seen?.pageAge ?? null,
        lens,
      };
      this.byUrl.set(key, ev);
    }
    const snippet = citedText.trim();
    if (snippet && !ev.snippets.includes(snippet) && ev.snippets.length < MAX_SNIPPETS) ev.snippets.push(snippet);
    return ev.id;
  }

  has(id: string): boolean {
    return this.all().some((e) => e.id === id);
  }

  get(id: string): Evidence | undefined {
    return this.all().find((e) => e.id === id);
  }

  all(): Evidence[] {
    return [...this.byUrl.values()].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  }

  /** Compact table handed to extraction and critique prompts. */
  table(ids?: string[]): string {
    const rows = (ids ? this.all().filter((e) => ids.includes(e.id)) : this.all()).map(
      (e) =>
        `${e.id} | ${e.domain} | ${e.title}${e.pageAge ? ` | ${e.pageAge}` : ""}\n   ${e.snippets.map((s) => `"${s}"`).join(" / ")}`,
    );
    return rows.join("\n");
  }
}
