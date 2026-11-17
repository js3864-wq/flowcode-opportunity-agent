import type { Evidence, SourceCheck } from "./types";

/**
 * Checks that each cited snippet really appears on the cited page.
 *
 * Live API runs get this guarantee from the API's own citation objects. Runs researched by
 * Claude Code on a Claude plan do not, so this check fetches every page and looks for the
 * quoted text. It uses no model calls.
 *
 *   found        the snippet appears on the page (after normalizing case, quotes, spacing)
 *   close        most of the snippet's word pairs appear on the page (light paraphrase)
 *   not_found    the page loaded but the snippet is not there. The source is dropped.
 *   unreachable  the page could not be loaded (bot blocking, timeout). Kept, flagged.
 */

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&rdquo;": '"',
  "&ldquo;": '"',
  "&ndash;": "-",
  "&mdash;": "-",
  "&hellip;": "...",
};

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z]+;|&#\d+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? " ");
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/[®™©]/g, "")
    .replace(/[^a-z0-9$%'".,:\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(s: string): string[] {
  return normalize(s)
    .replace(/[^a-z0-9$% ]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** Share of the snippet's consecutive word pairs that also appear on the page. */
export function bigramCoverage(snippet: string, page: string): number {
  const sw = words(snippet);
  if (sw.length < 2) return words(page).includes(sw[0] ?? "") ? 1 : 0;
  const pw = words(page);
  const pageBigrams = new Set<string>();
  for (let i = 0; i < pw.length - 1; i++) pageBigrams.add(`${pw[i]} ${pw[i + 1]}`);
  let hit = 0;
  for (let i = 0; i < sw.length - 1; i++) if (pageBigrams.has(`${sw[i]} ${sw[i + 1]}`)) hit++;
  return hit / (sw.length - 1);
}

export function matchSnippet(snippet: string, pageText: string): "found" | "close" | "not_found" {
  const s = normalize(snippet).replace(/^[.\s]+|[.\s]+$/g, "");
  const p = normalize(pageText);
  if (s && p.includes(s)) return "found";
  return bigramCoverage(snippet, pageText) >= 0.75 ? "close" : "not_found";
}

export async function checkEvidence(
  evidence: Evidence[],
  opts: { fetcher?: Fetcher; timeoutMs?: number; concurrency?: number; onProgress?: (e: Evidence, c: SourceCheck) => void } = {},
): Promise<Evidence[]> {
  const fetcher = opts.fetcher ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 15000;
  const out = evidence.map((e) => ({ ...e }));
  const queue = [...out];

  async function checkOne(e: Evidence): Promise<SourceCheck> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetcher(e.url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        },
      });
      if (!res.ok) return { status: "unreachable", detail: `HTTP ${res.status}` };
      const body = await res.text();
      const text = /<html|<body|<div|<p[\s>]/i.test(body) ? htmlToText(body) : body;
      if (!e.snippets.length) return { status: "unreachable", detail: "no snippet to check" };
      const results = e.snippets.map((s) => matchSnippet(s, text));
      if (results.every((r) => r === "not_found")) {
        // A page with almost no text is usually rendered by JavaScript: we cannot judge it.
        if (normalize(text).length < 1500) return { status: "unreachable", detail: "page has too little static text to check" };
        return { status: "not_found", detail: "no snippet appears on the page" };
      }
      return results.includes("found") ? { status: "found" } : { status: "close" };
    } catch (err) {
      const msg = err instanceof Error ? (err.name === "AbortError" ? "timed out" : err.message) : String(err);
      return { status: "unreachable", detail: msg.slice(0, 120) };
    } finally {
      clearTimeout(timer);
    }
  }

  async function worker() {
    while (queue.length) {
      const e = queue.shift()!;
      e.check = await checkOne(e);
      opts.onProgress?.(e, e.check);
    }
  }
  await Promise.all(Array.from({ length: opts.concurrency ?? 6 }, worker));
  return out;
}
