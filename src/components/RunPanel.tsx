"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProgressEvent, Report } from "@/agent/types";

const STEPS: { id: string; label: string }[] = [
  { id: "resolve", label: "Identify the company" },
  { id: "research", label: "Search six research lenses" },
  { id: "signals", label: "Extract dated, cited signals" },
  { id: "synthesize", label: "Match signals to Flowcode plays" },
  { id: "factcheck", label: "Fact-check every claim" },
  { id: "rank", label: "Score and rank" },
];

export function RunPanel({ initial, autoStart, live }: { initial: string; autoStart: boolean; live: boolean }) {
  const [input, setInput] = useState(initial);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const start = useCallback(async (company: string) => {
    setRunning(true);
    setReport(null);
    setError(null);
    setLog([]);
    setCurrent(null);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: company }),
      });
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
          if (!line) continue;
          const e = JSON.parse(line) as ProgressEvent;
          if (e.type === "step") setCurrent(e.step);
          if (e.type === "log") setLog((l) => [...l, e.message]);
          if (e.type === "done") {
            setCurrent("done");
            setReport(e.report);
          }
          if (e.type === "error") setError(e.message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    if (autoStart && initial && !started.current) {
      started.current = true;
      void start(initial);
    }
  }, [autoStart, initial, start]);

  const stepIndex = current === "done" ? STEPS.length : STEPS.findIndex((s) => s.id === current);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
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
            placeholder="Company name or website"
            className="min-w-0 flex-1 rounded-md border border-line bg-paper px-4 py-2.5 text-base focus:border-ink focus:outline-none"
            autoComplete="off"
          />
          <button type="submit" disabled={running || !input.trim()} className="rounded-md bg-ink px-5 py-2.5 font-medium text-paper hover:bg-ink/85 disabled:opacity-50">
            {running ? "Researching" : "Start research"}
          </button>
        </form>

        {!live ? (
          <p className="flex flex-wrap gap-2 text-sm">
            {["Las Vegas Grand Prix", "Miami Grand Prix", "Circuit of The Americas"].map((s) => (
              <button
                key={s}
                type="button"
                disabled={running}
                onClick={() => {
                  setInput(s);
                  void start(s);
                }}
                className="rounded-md border border-line bg-paper px-3 py-1.5 hover:border-ink disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </p>
        ) : null}

        {error ? (
          <div role="alert" className="rounded-lg border border-flag/40 bg-flag/5 p-4 text-sm">
            <p className="font-semibold text-flag">Research stopped</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : null}

        {report ? (
          <div className="rounded-xl border border-line bg-paper p-6">
            <p className="text-sm text-muted">Research complete</p>
            <p className="subhead mt-1 text-xl">{report.entity.name}</p>
            <p className="mt-2 text-muted">
              {report.opportunities.length} ranked plays from {report.evidence.length} sources. Top play scores {report.opportunities[0]?.score.total}.
            </p>
            <Link href={`/report/${report.slug}`} className="mt-4 inline-block rounded-md bg-ink px-4 py-2 font-medium text-paper no-underline hover:bg-ink/85">
              Open the report
            </Link>
          </div>
        ) : null}

        {log.length ? (
          <div className="rounded-xl border border-line bg-paper p-5">
            <p className="text-sm font-semibold">Activity</p>
            <ul className="mt-2 space-y-1 text-sm text-muted" aria-live="polite">
              {log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <ol className="space-y-3 self-start rounded-xl bg-asphalt p-5 text-on-asphalt">
        {STEPS.map((s, i) => {
          const state = stepIndex > i ? "done" : stepIndex === i && running ? "active" : "pending";
          return (
            <li key={s.id} className="flex items-center gap-3">
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  state === "done" ? "bg-sector-good text-asphalt" : state === "active" ? "bg-sector-best text-paper" : "border border-asphalt-line text-on-asphalt-muted"
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
    </div>
  );
}
