import { loadConfig } from "@/agent/config";
import { runAgent } from "@/agent/pipeline";
import type { ProgressEvent } from "@/agent/types";
import { findReport, replay, saveReport } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800; // a live run takes a few minutes

/**
 * POST { input: string, mock?: boolean }  ->  text/event-stream of ProgressEvent JSON lines.
 * Without an API key (or with mock: true) it replays the closest saved report.
 */
export async function POST(req: Request) {
  const { input, mock } = (await req.json().catch(() => ({}))) as { input?: string; mock?: boolean };
  if (!input?.trim()) return Response.json({ error: "input is required" }, { status: 400 });

  const config = loadConfig();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: ProgressEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        const previous = await findReport(input);
        if (mock || !config.apiKey) {
          if (!previous) {
            send({ type: "error", message: `No API key on this deployment and no saved report matches "${input}". Try one of the three races, or run locally with ANTHROPIC_API_KEY.` });
          } else {
            send({ type: "log", message: config.apiKey ? "Mock mode: replaying saved report" : "No API key on this deployment: replaying the saved report" });
            await replay(previous, send);
          }
        } else {
          const report = await runAgent({ input, config, previous, onEvent: send });
          await saveReport(report);
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
