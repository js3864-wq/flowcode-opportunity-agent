import { loadConfig } from "@/agent/config";
import { claudeCodeAvailable } from "./claude-code";

export type Runtime = "claude_code" | "api" | "replay";

/**
 * Which engine the web app uses for "Research a company".
 *
 * AGENT_RUNTIME=claude-code | api | replay forces one. Unset, it picks:
 *   1. Claude Code, if the CLI is installed (local machine, runs on your Claude plan)
 *   2. the API, if ANTHROPIC_API_KEY is set
 *   3. replay of saved reports (for example on a hosted demo)
 */
export async function pickRuntime(): Promise<Runtime> {
  const forced = process.env.AGENT_RUNTIME;
  if (forced === "claude-code") return "claude_code";
  if (forced === "api") return "api";
  if (forced === "replay") return "replay";
  if (await claudeCodeAvailable()) return "claude_code";
  return loadConfig().apiKey ? "api" : "replay";
}

/** Turns raw API errors into a next step the person can take. */
export function friendlyError(message: string): string {
  if (/credit balance is too low/i.test(message)) {
    return "Your Anthropic API credits ran out. Remove ANTHROPIC_API_KEY from .env.local and install Claude Code, and research will run on your Claude plan instead.";
  }
  if (/not logged in|authentication error|invalid api key|please run \/login/i.test(message)) {
    return "Claude Code is not signed in. Open a terminal, run claude, and sign in with your Claude account (not the Console).";
  }
  return message;
}
