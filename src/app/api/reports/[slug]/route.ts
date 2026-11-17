import { toMarkdown } from "@/agent/render";
import { getReport } from "@/lib/store";

export const runtime = "nodejs";

/** GET /api/reports/<slug> (JSON) or /api/reports/<slug>?format=md (Markdown download). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const report = await getReport(slug);
  if (!report) return Response.json({ error: "not found" }, { status: 404 });
  const format = new URL(req.url).searchParams.get("format");
  if (format === "md") {
    return new Response(toMarkdown(report), {
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}.md"` },
    });
  }
  return Response.json(report, {
    headers: format === "download" ? { "Content-Disposition": `attachment; filename="${slug}.json"` } : {},
  });
}
