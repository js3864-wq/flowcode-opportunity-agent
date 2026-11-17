import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ProgressEvent } from "../src/agent/types";
import { interpretLine, newStreamState, runClaudeCode, sanitizeInput } from "../src/lib/claude-code";
import { friendlyError } from "../src/lib/runtime";

const line = (o: unknown) => JSON.stringify(o);
const toolUse = (name: string, input: Record<string, string>) => line({ type: "assistant", message: { content: [{ type: "tool_use", name, input }] } });

describe("Claude Code stream", () => {
  it("maps tool calls to the same six steps as the API agent", () => {
    const state = newStreamState();
    const events: ProgressEvent[] = [];
    const feed = [
      line({ type: "system", subtype: "init" }),
      toolUse("Read", { file_path: "C:\\Users\\me\\flowcode-opportunity-agent\\src\\agent\\types.ts" }),
      toolUse("WebSearch", { query: "Heineken 2026 campaign" }),
      toolUse("WebSearch", { query: "Heineken sponsorship" }),
      toolUse("WebSearch", { query: "Heineken packaging" }),
      toolUse("WebFetch", { url: "https://www.theheinekencompany.com/newsroom" }),
      toolUse("Write", { file_path: "C:\\Users\\me\\flowcode-opportunity-agent\\data\\reference\\heineken.json" }),
      toolUse("Bash", { command: "npm run reports -- --only heineken --check-sources" }),
      line({ type: "result", subtype: "success", is_error: false, result: "done", permission_denials: [] }),
      "not json at all",
    ];
    for (const l of feed) events.push(...interpretLine(l, state));
    expect(events.filter((e) => e.type === "step").map((e) => (e as { step: string }).step)).toEqual([
      "resolve",
      "research",
      "signals",
      "synthesize",
      "factcheck",
      "rank",
    ]);
    expect(state.slug).toBe("heineken");
    expect(events.some((e) => e.type === "activity" && e.kind === "read" && e.domain === "theheinekencompany.com")).toBe(true);
  });

  it("tracks lenses from the run's own markers", () => {
    const state = newStreamState();
    const text = (t: string) => line({ type: "assistant", message: { content: [{ type: "text", text: t }] } });
    const events = [text("Lens: campaigns"), toolUse("WebSearch", { query: "x" }), text("Now the next one.\nLens: experiences"), toolUse("Write", { file_path: "/r/data/reference/a.json" })].flatMap((l) =>
      interpretLine(l, state),
    );
    const lensEvents = events.filter((e) => e.type === "activity" && e.kind === "lens").map((e) => `${(e as { lens: string }).lens}:${(e as { status: string }).status}`);
    expect(lensEvents).toEqual(["campaigns:active", "campaigns:done", "experiences:active", "campaigns:done", "experiences:done"]);
    const search = events.find((e) => e.type === "activity" && e.kind === "search") as { lens?: string };
    expect(search.lens).toBe("campaigns");
  });

  it("surfaces Claude Code errors", () => {
    const events = interpretLine(line({ type: "result", is_error: true, result: "Not logged in · Please run /login" }), newStreamState());
    expect(events).toEqual([{ type: "error", message: "Not logged in · Please run /login" }]);
    expect(friendlyError("Not logged in · Please run /login")).toMatch(/sign in with your Claude account/);
    expect(friendlyError('400 {"message":"Your credit balance is too low to access the Anthropic API."}')).toMatch(/Claude plan/);
  });

  it("strips shell metacharacters from company input", () => {
    expect(sanitizeInput("Ben & Jerry's; rm -rf / | calc")).toBe("Ben and Jerry's rm -rf / calc");
    expect(sanitizeInput("https://www.f1lasvegasgp.com/tickets?x=1")).toBe("https://www.f1lasvegasgp.com/tickets x 1");
    expect(sanitizeInput('"$(whoami)" `id`')).toBe("whoami id");
  });

  it.skipIf(process.platform === "win32")("runs the CLI headless, streams progress and never passes the API key", async () => {
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), "fake-claude-"));
    const argsFile = path.join(bin, "args.txt");
    fs.writeFileSync(
      path.join(bin, "claude"),
      `#!/bin/sh
printf '%s\\n' "$@" > "${argsFile}"
echo "key=\${ANTHROPIC_API_KEY:-none}" >> "${argsFile}"
echo '${line({ type: "system", subtype: "init" })}'
echo '${toolUse("Write", { file_path: "/repo/data/reference/acme-co.json" })}'
echo '${line({ type: "result", is_error: false, result: "ok" })}'
`,
      { mode: 0o755 },
    );
    const oldPath = process.env.PATH;
    process.env.PATH = `${bin}${path.delimiter}${oldPath}`;
    process.env.ANTHROPIC_API_KEY = "sk-ant-should-not-leak";
    try {
      const events: ProgressEvent[] = [];
      const result = await runClaudeCode({ input: "Acme & Co", cwd: bin, onEvent: (e) => events.push(e) });
      expect(result).toEqual({ slug: "acme-co", ok: true });
      const args = fs.readFileSync(argsFile, "utf8");
      expect(args).toContain("/research Acme and Co");
      expect(args).toContain("stream-json");
      expect(args).toContain("--verbose");
      expect(args).toContain("dontAsk");
      expect(args).toContain("Bash(npm run reports *)");
      expect(args).toContain("key=none");
      expect(events.map((e) => e.type)).toContain("step");
    } finally {
      process.env.PATH = oldPath;
      delete process.env.ANTHROPIC_API_KEY;
    }
  });
});
