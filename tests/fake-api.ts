import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesApi } from "../src/agent/llm";

/**
 * A fake Messages API that behaves like the real one closely enough to exercise the whole
 * pipeline: web search result blocks, citations, pause_turn, usage, structured outputs.
 */
export function fakeMessagesApi(opts: { pauseFirstLens?: boolean; unsupportedIndex?: number } = {}) {
  const calls: { kind: "create" | "parse"; system: string }[] = [];
  let createCount = 0;
  let paused = false;

  const usage = (searches = 0): Anthropic.Messages.Usage =>
    ({
      input_tokens: 1000,
      output_tokens: 200,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use: { web_search_requests: searches, web_fetch_requests: 0 },
    }) as unknown as Anthropic.Messages.Usage;

  const api: MessagesApi = {
    async create(params) {
      const system = String(params.system);
      calls.push({ kind: "create", system });
      createCount++;
      const prompt = String(params.messages[0].content);
      const isRelationship = system.includes("Flowcode's customer stories");
      const n = createCount;
      const url = isRelationship ? "https://www.flowcode.com/blog/nothing-here" : `https://news.example.com/story-${n}`;

      if (opts.pauseFirstLens && prompt.includes("Research lens: Campaigns") && !paused) {
        paused = true;
        return {
          id: `msg_${n}`,
          type: "message",
          role: "assistant",
          model: params.model,
          content: [{ type: "text", text: "Searching...", citations: null }],
          stop_reason: "pause_turn",
          stop_sequence: null,
          usage: usage(1),
        } as unknown as Anthropic.Messages.Message;
      }

      const content = [
        { type: "server_tool_use", id: `srv_${n}`, name: "web_search", input: { query: "q" } },
        {
          type: "web_search_tool_result",
          tool_use_id: `srv_${n}`,
          content: [{ type: "web_search_result", url, title: `Story ${n}`, encrypted_content: "x", page_age: "November 10, 2026" }],
        },
        {
          type: "text",
          text: `Fact number ${n} about the company.`,
          citations: [{ type: "web_search_result_location", url: `${url}?utm_source=feed`, title: `Story ${n}`, encrypted_index: "y", cited_text: `Cited text ${n}` }],
        },
      ];
      return {
        id: `msg_${n}`,
        type: "message",
        role: "assistant",
        model: params.model,
        content,
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: usage(2),
      } as unknown as Anthropic.Messages.Message;
    },

    async parse(params) {
      const sys = params.system as string | { text: string }[];
      const system = typeof sys === "string" ? sys : sys.map((b) => b.text).join("\n");
      calls.push({ kind: "parse", system });
      let parsed_output: unknown;

      if (system.includes("Extract a company profile")) {
        parsed_output = {
          name: "Test Grand Prix",
          website: "https://testgp.example.com",
          operator: "Test Promoter LLC",
          industry: "Live sports",
          summary: "A race.",
          businessUnits: ["Race weekend"],
          keyDates: [{ label: "Race", date: "2026-12-01", isUpcoming: true }],
          audiences: ["Fans"],
          aliases: ["TGP"],
          evidenceIds: ["E1", "E999"],
        };
      } else if (system.includes("Classify the relationship")) {
        parsed_output = { status: "none_found", summary: "No public Flowcode case study found.", evidenceIds: [] };
      } else if (system.includes("clean list of signals")) {
        parsed_output = {
          signals: [
            { id: "S1", lens: "experiences", title: "Race in December", summary: "Race on Dec 1.", date: "2026-12-01", isUpcoming: true, channels: ["live_events"], scale: "100,000 fans", sponsorBrands: ["Acme Cola"], evidenceIds: ["E2", "E3"] },
            { id: "S2", lens: "campaigns", title: "Billboard campaign", summary: "Billboards across town.", date: "2026-11-01", isUpcoming: false, channels: ["ooh"], scale: null, sponsorBrands: [], evidenceIds: ["E4"] },
            { id: "S3", lens: "strategy", title: "Hallucinated", summary: "Not in sources.", date: "2026-10-01", isUpcoming: false, channels: [], scale: null, sponsorBrands: [], evidenceIds: ["E404"] },
            { id: "S4", lens: "strategy", title: "Old news", summary: "From 2023.", date: "2023-01-01", isUpcoming: false, channels: [], scale: null, sponsorBrands: [], evidenceIds: ["E5"] },
          ],
        };
      } else if (system.includes("solutions strategist")) {
        const draft = (title: string, signalIds: string[], t = 4) => ({
          title,
          businessUnit: "Race weekend",
          whatsHappening: "Something is happening.",
          whyFlowcode: "Flowcode fits.",
          play: ["Step one", "Step two", "Step three"],
          products: ["flowcodes", "flowid"],
          proofPointId: "c3_presents",
          touchpoints: ["live_events"],
          kpis: ["Opt-ins"],
          timing: { urgency: "now", window: "Race week", keyDate: "2026-12-01" },
          buyer: "Marketing",
          signalIds,
          ratings: { timeliness: { score: t, why: "" }, scale: { score: 4, why: "" }, fit: { score: 5, why: "" }, access: { score: 3, why: "" } },
          caveats: [],
        });
        parsed_output = {
          headline: "Test headline",
          bullets: ["a", "b", "c"],
          opportunities: [
            draft("Fan zone capture during race week", ["S1"], 5),
            draft("Billboard attribution for the campaign", ["S2", "S3"]),
            draft("Idea resting only on a hallucinated signal", ["S3"]),
            draft("Idea on old news", ["S4"], 5),
            draft("Fan zone capture during the race week", ["S1"]),
            draft("Idea the fact checker rejects", ["S1"]),
          ],
          followOnLeads: [
            { brand: "Acme Cola", role: "Sponsor", why: "Packaging.", signalIds: ["S1"] },
            { brand: "Ghost Brand", role: "Unknown", why: "No signal.", signalIds: ["S3"] },
          ],
        };
      } else if (system.includes("fact checker")) {
        parsed_output = {
          reviews: [
            { index: 0, verdict: "supported", issues: [] },
            { index: 1, verdict: "partial", issues: ["Billboard count not in sources"] },
            { index: opts.unsupportedIndex ?? 5, verdict: "unsupported", issues: ["No source mentions this"] },
          ],
        };
      } else {
        throw new Error(`Unexpected structured call: ${system.slice(0, 80)}`);
      }
      return { parsed_output, usage: usage(0), stop_reason: "end_turn" };
    },
  };

  return { api, calls };
}
