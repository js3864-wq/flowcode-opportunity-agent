export interface AgentConfig {
  apiKey: string | undefined;
  models: { research: string; synthesis: string; fast: string };
  maxSearchesPerLens: number;
  lensConcurrency: number;
  /** Signals dated before this many months ago are flagged stale. */
  staleAfterMonths: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AgentConfig {
  return {
    apiKey: env.ANTHROPIC_API_KEY || undefined,
    models: {
      research: env.AGENT_MODEL_RESEARCH || "claude-sonnet-5-5",
      synthesis: env.AGENT_MODEL_SYNTHESIS || "claude-opus-5-5",
      fast: env.AGENT_MODEL_FAST || "claude-haiku-5-5",
    },
    maxSearchesPerLens: Number(env.AGENT_MAX_SEARCHES_PER_LENS || 5),
    lensConcurrency: Number(env.AGENT_LENS_CONCURRENCY || 3),
    staleAfterMonths: Number(env.AGENT_STALE_AFTER_MONTHS || 12),
  };
}

/**
 * List prices per million tokens and per search, from platform.claude.com pricing
 * (checked Nov 2026). Used for the cost estimate printed on every report.
 * Haiku 5.5 is listed "from" these prices, so treat its estimate as a floor.
 */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
export const PRICE_PER_SEARCH = 10 / 1000;
