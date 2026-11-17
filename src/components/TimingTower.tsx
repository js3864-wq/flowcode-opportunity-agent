import type { Opportunity } from "@/agent/types";
import { URGENCY_LABEL } from "@/lib/format";
import { SectorLegend, Sectors } from "./Sectors";

/** Ranked plays as an F1 timing tower: position, play, gap to the leader, sectors. */
export function TimingTower({ opportunities }: { opportunities: Opportunity[] }) {
  const leader = opportunities[0]?.score.total ?? 0;
  return (
    <section aria-labelledby="tower-title" className="rounded-xl bg-asphalt p-4 text-on-asphalt sm:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tower-title" className="subhead text-lg">
          Ranked plays
        </h2>
        <p className="text-sm text-on-asphalt-muted">Score out of 100. Gap is points behind the top play.</p>
      </div>
      <ol className="divide-y divide-asphalt-line border-y border-asphalt-line">
        {opportunities.map((o) => (
          <li key={o.id} className="tower-row">
            <a
              href={`#${o.id}`}
              className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-x-3 gap-y-2 py-3 hover:bg-asphalt-line/40 sm:grid-cols-[2.5rem_1fr_7.5rem_3.5rem_3.5rem] sm:gap-x-4"
            >
              <span className="text-xl font-semibold [font-stretch:75%] text-on-asphalt-muted sm:text-2xl">P{o.rank}</span>
              <span className="min-w-0">
                <span className="block font-medium leading-snug">{o.title}</span>
                <span className="mt-0.5 block text-sm text-on-asphalt-muted">
                  {URGENCY_LABEL[o.timing.urgency]}. {o.businessUnit}
                </span>
              </span>
              <span className="col-start-2 sm:col-start-auto">
                <Sectors score={o.score} size="sm" />
              </span>
              <span className="hidden text-right text-sm text-on-asphalt-muted sm:block">
                {o.rank === 1 ? "Top" : `+${leader - o.score.total}`}
              </span>
              <span className="row-start-1 col-start-3 text-right text-2xl font-semibold [font-stretch:75%] sm:row-auto sm:col-auto">
                {o.score.total}
              </span>
            </a>
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <SectorLegend dark />
      </div>
    </section>
  );
}
