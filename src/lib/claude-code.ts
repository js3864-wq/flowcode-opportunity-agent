import { spawn } from "node:child_process";
import type { ProgressEvent } from "@/agent/types";

/**
 * Runs the /research skill through the Claude Code CLI in headless mode, so research from the
 * web app uses the signed-in Claude plan instead of API billing. Local use only: a hosted
 * deployment has no Claude Code install and falls back to the API or to replay.
 */

const isWindows = process.platform === "win32";

// Tools the skill needs. Everything else is refused because of --permission-mode dontAsk.
export const ALLOWED_TOOLS = ["WebSearch", "WebFetch", "Read", "Glob", "Grep", "Write", "Edit", "Task", "Bash(npm run reports *)", "PowerShell(npm run reports *)"];

/** Company names and URLs only. Strips shell metacharacters before the text reaches a shell. */
export function sanitizeInput(input: string): string {
  return input
    .replace(/&/g, " and ")
    .replace(/[^A-Za-z0-9 .,'\-/:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function quote(arg: string): string {
  return isWindows && /[\s()*,]/.test(arg) ? `"${arg}"` : arg;
}

/** Claude Code bills the API whenever ANTHROPIC_API_KEY is set, so the child never sees it. */
function planOnlyEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

let available: Promise<boolean> | null = null;
export function claudeCodeAvailable(): Promise<boolean> {
  available ??= new Promise((resolve) => {
    try {
      const child = spawn("claude", ["--version"], { shell: isWindows, env: planOnlyEnv(), stdio: "ignore" });
      const timer = setTimeout(() => {
        child.kill();
        resolve(false);
      }, 10000);
      child.on("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
    } catch {
      resolve(false);
    }
  });
  return available;
}

export interface StreamState {
  steps: Set<string>;
  searches: number;
  slug: string | null;
  readSchema: boolean;
}

export const newStreamState = (): StreamState => ({ steps: new Set(), searches: 0, slug: null, readSchema: false });

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Turns one line of Claude Code's stream-json output into the agent's progress events. */
export function interpretLine(line: string, state: StreamState): ProgressEvent[] {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(line);
  } catch {
    return [];
  }
  const out: ProgressEvent[] = [];
  const step = (id: string, label: string) => {
    if (state.steps.has(id)) return;
    state.steps.add(id);
    out.push({ type: "step", step: id, label });
  };

  if (msg.type === "system" && msg.subtype === "init") {
    step("resolve", "Starting Claude Code on your Claude plan");
  }

  if (msg.type === "assistant") {
    const content = ((msg.message as { content?: unknown[] })?.content ?? []) as { type: string; name?: string; input?: Record<string, string> }[];
    for (const block of content) {
      if (block.type !== "tool_use") continue;
      const input = block.input ?? {};
      switch (block.name) {
        case "WebSearch":
          state.searches++;
          if (state.searches === 3) step("research", "Searching the six research lenses");
          out.push({ type: "log", message: `Search: ${input.query ?? ""}` });
          break;
        case "WebFetch":
          out.push({ type: "log", message: `Reading ${domain(input.url ?? "")}` });
          break;
        case "Read":
          if (!state.readSchema && /src[\\/]agent|data[\\/]reference/.test(input.file_path ?? "")) {
            state.readSchema = true;
            out.push({ type: "log", message: "Loaded the agent's schema and Flowcode's products" });
          }
          break;
        case "Write":
        case "Edit": {
          const m = /data[\\/]+reference[\\/]+([^\\/]+)\.json$/.exec(input.file_path ?? "");
          if (m) {
            state.slug = m[1];
            step("signals", "Writing dated signals with sources");
            step("synthesize", "Writing ranked Flowcode plays");
          }
          break;
        }
        case "Bash":
        case "PowerShell":
          if (/npm run reports/.test(input.command ?? "")) step("factcheck", "Checking every cited page, then scoring and ranking");
          break;
        case "Task":
        case "Agent":
          out.push({ type: "log", message: "Started a subagent for one company" });
          break;
      }
    }
  }

  if (msg.type === "result") {
    const denials = (msg.permission_denials as unknown[] | undefined)?.length ?? 0;
    if (denials) out.push({ type: "log", message: `${denials} tool calls were refused by the permission settings` });
    if (msg.is_error) out.push({ type: "error", message: String(msg.result ?? "Claude Code stopped with an error").slice(0, 600) });
    else step("rank", "Report built");
  }
  return out;
}

export function runClaudeCode(opts: {
  input: string;
  cwd: string;
  onEvent: (e: ProgressEvent) => void;
  timeoutMs?: number;
}): Promise<{ slug: string | null; ok: boolean }> {
  const company = sanitizeInput(opts.input);
  const args = ["-p", `/research ${company}`, "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk", "--allowedTools", ...ALLOWED_TOOLS];
  const state = newStreamState();

  return new Promise((resolve) => {
    const child = spawn("claude", args.map(quote), { cwd: opts.cwd, shell: isWindows, env: planOnlyEnv() });
    let buffer = "";
    let errored = false;
    const timer = setTimeout(() => {
      opts.onEvent({ type: "error", message: "Claude Code took longer than the time limit and was stopped." });
      errored = true;
      child.kill();
    }, opts.timeoutMs ?? 25 * 60 * 1000);

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        for (const e of interpretLine(line, state)) {
          if (e.type === "error") errored = true;
          opts.onEvent(e);
        }
      }
    });
    let stderr = "";
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
    child.on("error", (err) => {
      clearTimeout(timer);
      opts.onEvent({ type: "error", message: `Could not start Claude Code: ${err.message}. Install it and sign in with your Claude account.` });
      resolve({ slug: null, ok: false });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (buffer.trim()) for (const e of interpretLine(buffer, state)) opts.onEvent(e);
      if (code !== 0 && !errored) {
        opts.onEvent({ type: "error", message: `Claude Code exited with code ${code}. ${stderr.trim().slice(0, 400)}` });
        errored = true;
      }
      resolve({ slug: state.slug, ok: !errored });
    });
  });
}
