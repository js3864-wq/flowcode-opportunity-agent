import { RunPanel } from "@/components/RunPanel";
import { pickRuntime } from "@/lib/runtime";

export const dynamic = "force-dynamic";

const COPY = {
  claude_code:
    "Runs on your Claude plan through Claude Code, with no API cost. Claude Code researches six lenses, writes dated signals and Flowcode plays, then the agent's code checks every cited page, scores and ranks. Expect several minutes.",
  api: "Runs on the Claude API. The agent identifies the company, searches six research lenses in parallel, extracts dated signals, matches them to Flowcode plays, fact-checks each claim and ranks the result. Expect a few minutes.",
  replay:
    "This deployment replays saved reports for the closest matching company. Try one of the three races. To research any company, run the app on a machine with Claude Code signed in.",
};

export default async function RunPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const { company } = await searchParams;
  const runtime = await pickRuntime();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="display text-4xl sm:text-5xl">Research a company</h1>
        <p className="prose-measure mt-4 text-lg leading-relaxed text-muted">{COPY[runtime]}</p>
      </div>
      <RunPanel initial={company ?? ""} autoStart={Boolean(company)} live={runtime !== "replay"} />
    </div>
  );
}
