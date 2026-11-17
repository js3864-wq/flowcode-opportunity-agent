/**
 * Two cost profiles.
 *
 * lite (default): Haiku reads the search results, Sonnet writes the plays, 3 searches per lens.
 *                 Most of the cost of a run is the research model re-reading earlier search
 *                 results as a lens keeps searching, so a cheaper reader and fewer searches
 *                 per lens cut cost the most.
 * full:           Sonnet reads, Opus writes, 5 searches per lens. Measured at about $2 per
 *                 company on the first live runs (Nov 17, 2026), with 110-120 sources each.
 *
 * Every run also has a hard spending cap. The agent stops before the next model call once
 * the estimated spend for that company passes it.
 */
export type Profile = "lite" | "full";

const PROFILES: Record<Profile, { research: string; synthesis: string; fast: string; searchesPerLens: number; resolveSearches: number; maxCostUsd: number }> = {
  lite: { research: "claude-haiku-5-5", synthesis: "claude-sonnet-5-5", fast: "claude-haiku-5-5", searchesPerLens: 3, resolveSearches: 2, maxCostUsd: 0.75 },
  full: { research: "claude-sonnet-5-5", synthesis: "claude-opus-5-5", fast: "claude-haiku-5-5", searchesPerLens: 5, resolveSearches: 4, maxCostUsd: 3 },
};

export interface AgentConfig {
  apiKey: string | undefined;
  profile: Profile;
  models: { research: string; synthesis: string; fast: string };
  maxSearchesPerLens: number;
  resolveSearches: number;
  lensConcurrency: number;
  /** Hard cap per company. The run stops before the next model call once spend passes it. */
  maxCostUsd: number;
  /** Signals dated before this many months ago are flagged stale. */
  staleAfterMonths: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AgentConfig {
  const profile: Profile = env.AGENT_PROFILE === "full" ? "full" : "lite";
  const p = PROFILES[profile];
  return {
    apiKey: env.ANTHROPIC_API_KEY || undefined,
    profile,
    models: {
      research: env.AGENT_MODEL_RESEARCH || p.research,
      synthesis: env.AGENT_MODEL_SYNTHESIS || p.synthesis,
      fast: env.AGENT_MODEL_FAST || p.fast,
    },
    maxSearchesPerLens: Number(env.AGENT_MAX_SEARCHES_PER_LENS || p.searchesPerLens),
    resolveSearches: p.resolveSearches,
    lensConcurrency: Number(env.AGENT_LENS_CONCURRENCY || 3),
    maxCostUsd: Number(env.AGENT_MAX_COST_USD || p.maxCostUsd),
    staleAfterMonths: Number(env.AGENT_STALE_AFTER_MONTHS || 12),
  };
}

/** Upper bound on searches for one company: resolve + every lens + the relationship check. */
export function maxSearches(config: AgentConfig, lensCount = 6): number {
  return config.resolveSearches + lensCount * config.maxSearchesPerLens + 2;
}

/**
 * List prices per million tokens and per search, from platform.claude.com pricing
 * (checked Nov 2026). Used for the cost estimate printed on every report and for the cap.
 * Haiku 5.5 is listed "from" these prices, so treat its estimate as a floor.
 */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
export const PRICE_PER_SEARCH = 10 / 1000;
