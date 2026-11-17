import { loadConfig } from "@/agent/config";
import { runAgent } from "@/agent/pipeline";
import type { ProgressEvent } from "@/agent/types";
import { runClaudeCode } from "@/lib/claude-code";
import { friendlyError, pickRuntime } from "@/lib/runtime";
import { findReport, getReport, replay, saveReport } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800; // a live run takes a few minutes

/**
 * POST { input: string, mock?: boolean }  ->  text/event-stream of ProgressEvent JSON lines.
 * Runs through Claude Code on the local Claude plan, the API, or replays a saved report,
 * depending on what this machine has (see lib/runtime.ts).
 */
export async function POST(req: Request) {
  const { input, mock } = (await req.json().catch(() => ({}))) as { input?: string; mock?: boolean };
  if (!input?.trim()) return Response.json({ error: "input is required" }, { status: 400 });

  const mode = mock ? "replay" : await pickRuntime();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: ProgressEvent) => {
        const out = e.type === "error" ? { ...e, message: friendlyError(e.message) } : e;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(out)}\n\n`));
      };
      try {
        const previous = await findReport(input);
        if (mode === "claude_code") {
          send({ type: "log", message: "Running on your Claude plan through Claude Code. This usually takes several minutes." });
          const { slug, ok } = await runClaudeCode({ input, cwd: process.cwd(), onEvent: send });
          const report = (slug && (await getReport(slug))) || (ok ? await findReport(input) : null);
          if (report) send({ type: "done", report });
          else if (ok) send({ type: "error", message: "Claude Code finished but no report was built. Check the terminal running npm run dev for details." });
        } else if (mode === "api") {
          const report = await runAgent({ input, config: loadConfig(), previous, onEvent: send });
          await saveReport(report);
        } else if (!previous) {
          send({ type: "error", message: `This deployment replays saved reports only, and none matches "${input}". Try one of the three races.` });
        } else {
          send({ type: "log", message: "Replaying the saved report" });
          await replay(previous, send);
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
