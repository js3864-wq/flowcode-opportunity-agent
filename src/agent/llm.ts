import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type * as z from "zod/v4";
import { PRICES, PRICE_PER_SEARCH } from "./config";
import type { EvidenceLedger } from "./evidence";
import type { Lens } from "./types";

type ContentBlock = Anthropic.Messages.ContentBlock;
type MessageParam = Anthropic.Messages.MessageParam;

/** The two SDK methods the agent uses. Tests pass a fake with the same shape. */
export interface MessagesApi {
  create(params: Anthropic.Messages.MessageCreateParamsNonStreaming): Promise<Anthropic.Messages.Message>;
  parse(params: Record<string, unknown>): Promise<{ parsed_output: unknown; usage: Anthropic.Messages.Usage; stop_reason: string | null }>;
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  searches: number;
  costUsd: number;
}

const MAX_CONTINUATIONS = 6;

export class Llm {
  readonly usage: UsageTotals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, searches: 0, costUsd: 0 };

  constructor(private readonly messages: MessagesApi) {}

  static fromApiKey(apiKey: string): Llm {
    const client = new Anthropic({ apiKey, maxRetries: 3, timeout: 10 * 60 * 1000 });
    return new Llm(client.messages as unknown as MessagesApi);
  }

  private record(model: string, usage: Anthropic.Messages.Usage | undefined) {
    if (!usage) return;
    const price = PRICES[model] ?? PRICES["claude-sonnet-5-5"];
    const input = usage.input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheWrite = usage.cache_creation_input_tokens ?? 0;
    const searches = usage.server_tool_use?.web_search_requests ?? 0;
    this.usage.inputTokens += input + cacheWrite;
    this.usage.outputTokens += output;
    this.usage.cacheReadTokens += cacheRead;
    this.usage.searches += searches;
    this.usage.costUsd +=
      ((input + cacheWrite * 1.25) * price.input + output * price.output + cacheRead * price.cacheRead) / 1_000_000 +
      searches * PRICE_PER_SEARCH;
  }

  /**
   * Run a research turn with the server-side web search tool and return the model's notes
   * with [E#] markers placed after every cited sentence. Sources go into the ledger straight
   * from the API's citation objects. Handles pause_turn by sending the paused turn back.
   */
  async searchNotes(opts: {
    model: string;
    system: string;
    prompt: string;
    lens: Lens;
    ledger: EvidenceLedger;
    maxUses: number;
    allowedDomains?: string[];
    maxTokens?: number;
  }): Promise<string> {
    const tool: Anthropic.Messages.WebSearchTool20250305 = {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: opts.maxUses,
      ...(opts.allowedDomains ? { allowed_domains: opts.allowedDomains } : {}),
    };
    const messages: MessageParam[] = [{ role: "user", content: opts.prompt }];
    const blocks: ContentBlock[] = [];

    for (let i = 0; i < MAX_CONTINUATIONS; i++) {
      const res = await this.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 16000,
        system: opts.system,
        messages,
        tools: [tool],
      });
      this.record(opts.model, res.usage);
      blocks.push(...res.content);
      if (res.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: res.content as unknown as MessageParam["content"] });
    }

    return notesFromBlocks(blocks, opts.lens, opts.ledger);
  }

  /** Structured output call (no tools). Returns data validated against the zod schema. */
  async structured<T extends z.ZodType>(opts: {
    model: string;
    system: string | Anthropic.Messages.TextBlockParam[];
    prompt: string;
    schema: T;
    maxTokens?: number;
  }): Promise<z.infer<T>> {
    const res = await this.messages.parse({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 16000,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
      output_config: { format: zodOutputFormat(opts.schema) },
    });
    this.record(opts.model, res.usage);
    if (res.parsed_output == null) {
      throw new Error(`Structured output was empty (stop_reason: ${res.stop_reason}). Try raising max tokens.`);
    }
    return res.parsed_output as z.infer<T>;
  }
}

/** Exported for tests: turns API content blocks into cited notes and fills the ledger. */
export function notesFromBlocks(blocks: ContentBlock[], lens: Lens, ledger: EvidenceLedger): string {
  for (const b of blocks) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) ledger.addResult(r.url, r.title, r.page_age ?? null);
    }
  }
  let notes = "";
  for (const b of blocks) {
    if (b.type !== "text") continue;
    notes += b.text;
    const ids = new Set<string>();
    for (const c of b.citations ?? []) {
      if (c.type === "web_search_result_location") ids.add(ledger.cite(c.url, c.title, c.cited_text, lens));
    }
    if (ids.size) notes += ` [${[...ids].join(", ")}]`;
  }
  return notes.trim();
}
