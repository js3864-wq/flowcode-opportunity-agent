import { RunPanel } from "@/components/RunPanel";
import { loadConfig } from "@/agent/config";

export const dynamic = "force-dynamic";

export default async function RunPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const { company } = await searchParams;
  const live = Boolean(loadConfig().apiKey);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="display text-4xl sm:text-5xl">Research a company</h1>
        <p className="prose-measure mt-4 text-lg leading-relaxed text-muted">
          {live
            ? "The agent identifies the company, searches six research lenses in parallel, extracts dated signals, matches them to Flowcode plays, fact-checks each claim and ranks the result. Expect a few minutes."
            : "This deployment has no API key, so runs replay the saved report for the closest matching company. Try one of the three races. To research any company live, run it locally with an Anthropic API key."}
        </p>
      </div>
      <RunPanel initial={company ?? ""} autoStart={Boolean(company)} live={live} />
    </div>
  );
}
