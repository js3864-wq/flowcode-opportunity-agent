"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LENS_SPECS } from "@/agent/lenses";
import type { ProgressEvent, Report } from "@/agent/types";
import { SiteIcon } from "./SiteIcon";

const STEPS: { id: string; label: string }[] = [
  { id: "resolve", label: "Identify the company" },
  { id: "research", label: "Search six research lenses" },
  { id: "signals", label: "Extract dated, cited signals" },
  { id: "synthesize", label: "Match signals to Flowcode plays" },
  { id: "factcheck", label: "Check every source" },
  { id: "rank", label: "Score and rank" },
];

const LENS_SHORT: Record<string, string> = {
  campaigns: "Campaigns",
  experiences: "Events",
  commerce: "Tickets and retail",
  partnerships: "Sponsors",
  customer: "Customer data",
  strategy: "Strategy",
};

type LensState = "pending" | "active" | "done";
type FeedItem = { id: number; kind: "search" | "read" | "note"; text: string; domain?: string; lens?: string };

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function RunPanel({ initial, autoStart, live }: { initial: string; autoStart: boolean; live: boolean }) {
  const router = useRouter();
  const [input, setInput] = useState(initial);
  const [company, setCompany] = useState("");
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [lenses, setLenses] = useState<Record<string, LensState>>({});
  const [searches, setSearches] = useState(0);
  const [domains, setDomains] = useState<string[]>([]);
  const [reads, setReads] = useState(0);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const feedId = useRef(0);

  const push = (item: Omit<FeedItem, "id">) => setFeed((f) => [{ ...item, id: ++feedId.current }, ...f].slice(0, 40));

  const handle = useCallback((e: ProgressEvent) => {
    if (e.type === "step") {
      setCurrent(e.step);
      // Research is over once signals start: close any lens still open.
      if (["signals", "synthesize", "factcheck", "rank"].includes(e.step)) {
        setLenses((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v === "active" ? "done" : v])));
      }
    }
    if (e.type === "log") push({ kind: "note", text: e.message });
    if (e.type === "activity") {
      if (e.kind === "lens") setLenses((l) => ({ ...l, [e.lens]: l[e.lens] === "done" && e.status === "active" ? "done" : e.status }));
      if (e.kind === "search") {
        setSearches((n) => n + 1);
        push({ kind: "search", text: e.text, lens: e.lens });
      }
      if (e.kind === "read") {
        setReads((n) => n + 1);
        setDomains((d) => (e.domain && !d.includes(e.domain) ? [...d, e.domain] : d));
        push({ kind: "read", text: e.domain, domain: e.domain });
      }
    }
    if (e.type === "done") {
      setCurrent("done");
      setReport(e.report);
    }
    if (e.type === "error") setError(e.message);
  }, []);

  const start = useCallback(
    async (name: string) => {
      setRunning(true);
      setCompany(name);
      setReport(null);
      setError(null);
      setFeed([]);
      setLenses({});
      setSearches(0);
      setReads(0);
      setDomains([]);
      setCurrent(null);
      setStartedAt(Date.now());
      setNow(Date.now());
      try {
        const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: name }) });
        if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.replace(/^data: /, "").trim();
            if (line) handle(JSON.parse(line) as ProgressEvent);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setNow(Date.now());
        setRunning(false);
      }
    },
    [handle],
  );

  useEffect(() => {
    if (autoStart && initial && !started.current) {
      started.current = true;
      void start(initial);
    }
  }, [autoStart, initial, start]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Open the finished report on its own: the reveal is the payoff of the run.
  useEffect(() => {
    if (!report) return;
    const t = setTimeout(() => router.push(`/report/${report.slug}`), 2500);
    return () => clearTimeout(t);
  }, [report, router]);

  const stepIndex = current === "done" ? STEPS.length : STEPS.findIndex((s) => s.id === current);
  const elapsed = startedAt ? now - startedAt : 0;
  const hasRun = Boolean(startedAt);

  return (
    <div className="space-y-6">
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !running) void start(input.trim());
        }}
      >
        <label htmlFor="run-company" className="sr-only">
          Company name or website
        </label>
        <input
          id="run-company"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Company name or website, e.g. Mexico City Grand Prix"
          className="min-w-0 flex-1 rounded-md border border-line bg-paper px-4 py-2.5 text-base focus:border-ink focus:outline-none"
          autoComplete="off"
        />
        <button type="submit" disabled={running || !input.trim()} className="rounded-md bg-ink px-5 py-2.5 font-medium text-paper hover:bg-ink/85 disabled:opacity-50">
          {running ? "Researching" : "Start research"}
        </button>
      </form>

      {!live && !hasRun ? (
        <p className="flex flex-wrap gap-2 text-sm">
          {["Las Vegas Grand Prix", "Miami Grand Prix", "Circuit of The Americas"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setInput(s);
                void start(s);
              }}
              className="rounded-md border border-line bg-paper px-3 py-1.5 hover:border-ink"
            >
              {s}
            </button>
          ))}
        </p>
      ) : null}

      {hasRun ? (
        <section aria-label="Live research" className="rounded-xl bg-asphalt p-5 text-on-asphalt sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-on-asphalt-muted">{report ? "Research complete" : error ? "Research stopped" : "Researching"}</p>
              <p className="subhead mt-1 truncate text-2xl sm:text-3xl">{company}</p>
            </div>
            <p className="text-5xl font-semibold leading-none [font-stretch:75%] tabular-nums" aria-label="Elapsed time">
              {clock(elapsed)}
            </p>
          </div>

          <dl className="mt-6 grid grid-cols-3 gap-4 border-y border-asphalt-line py-4">
            {[
              ["Searches", searches],
              ["Pages and sources", reads],
              ["Distinct sites", domains.length],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-sm text-on-asphalt-muted">{label}</dt>
                <dd className="mt-1 text-4xl font-semibold leading-none [font-stretch:75%] tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5">
            <p className="text-sm text-on-asphalt-muted">Research lenses</p>
            <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {LENS_SPECS.map((l) => {
                const st = lenses[l.id] ?? "pending";
                return (
                  <li key={l.id} className="rounded-md border border-asphalt-line p-3">
                    <span
                      aria-hidden
                      className={`block h-1.5 rounded-full ${st === "done" ? "bg-sector-good" : st === "active" ? "bg-sector-mid motion-safe:animate-pulse" : "bg-asphalt-line"}`}
                    />
                    <span className="mt-2 block text-sm font-medium">{LENS_SHORT[l.id]}</span>
                    <span className="block text-xs text-on-asphalt-muted">{st === "done" ? "Done" : st === "active" ? "Searching" : "Waiting"}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-lg border border-flag/40 bg-flag/5 p-4 text-sm">
          <p className="font-semibold text-flag">Research stopped</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : null}

      {report ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-paper p-5">
          <p>
            <span className="font-semibold">{report.opportunities.length} ranked plays</span> from {report.evidence.length} sources. Top play scores{" "}
            {report.opportunities[0]?.score.total}. Opening the report.
          </p>
          <Link href={`/report/${report.slug}`} className="rounded-md bg-ink px-4 py-2 font-medium text-paper no-underline hover:bg-ink/85">
            Open the report
          </Link>
        </div>
      ) : null}

      {hasRun ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section aria-label="Activity" className="rounded-xl border border-line bg-paper p-5">
            <p className="font-semibold">What the agent is doing</p>
            <ol className="mt-3 space-y-2 text-sm" aria-live="polite">
              {feed.length === 0 ? <li className="text-muted">Starting up.</li> : null}
              {feed.map((f) => (
                <li key={f.id} className="flex items-start gap-3">
                  {f.kind === "read" && f.domain ? (
                    <SiteIcon domain={f.domain} />
                  ) : (
                    <span aria-hidden className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold ${f.kind === "search" ? "bg-ink text-paper" : "bg-concrete text-muted"}`}>
                      {f.kind === "search" ? "S" : "i"}
                    </span>
                  )}
                  <span className="min-w-0">
                    {f.kind === "search" ? <span className="text-muted">Searched </span> : f.kind === "read" ? <span className="text-muted">Read </span> : null}
                    <span className={f.kind === "note" ? "text-muted" : ""}>{f.text}</span>
                    {f.lens ? <span className="ml-2 text-xs text-muted">{LENS_SHORT[f.lens] ?? f.lens}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <div className="space-y-6">
            <ol className="space-y-3 rounded-xl bg-asphalt p-5 text-on-asphalt">
              {STEPS.map((s, i) => {
                const state = stepIndex > i ? "done" : stepIndex === i && running ? "active" : "pending";
                return (
                  <li key={s.id} className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        state === "done" ? "bg-sector-good text-asphalt" : state === "active" ? "bg-sector-mid text-asphalt" : "border border-asphalt-line text-on-asphalt-muted"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className={state === "pending" ? "text-on-asphalt-muted" : ""}>
                      {s.label}
                      <span className="sr-only">{state === "done" ? ", done" : state === "active" ? ", in progress" : ""}</span>
                    </span>
                  </li>
                );
              })}
            </ol>

            <section aria-label="Sources found" className="rounded-xl border border-line bg-paper p-5">
              <p className="font-semibold">Sites found ({domains.length})</p>
              {domains.length ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {domains.map((d) => (
                    <li key={d} className="inline-flex items-center gap-1.5 rounded-md bg-concrete px-2 py-1 text-xs">
                      <SiteIcon domain={d} size={14} />
                      {d}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">Sites appear here as the research reads them.</p>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
