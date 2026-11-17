import { describe, expect, it } from "vitest";
import { checkEvidence, htmlToText, matchSnippet } from "../src/agent/source-check";
import type { Evidence } from "../src/agent/types";

const filler = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(40);
const page = `<html><head><script>var x = "hidden quote";</script></head><body>
<h1>Miami GP changes title sponsor</h1>
<p>The Formula 1 Miami Grand Prix will from 2027 be sponsored by Hard Rock, which has held the naming rights to the NFL&rsquo;s Miami Dolphins stadium since 2016.</p>
<p>${filler}</p></body></html>`;

const ev = (id: string, url: string, snippets: string[]): Evidence => ({ id, url, title: id, domain: "x.com", snippets, pageAge: null, lens: "partnerships" });

function fakeFetch(map: Record<string, { status: number; body: string }>) {
  return async (url: string) => {
    const r = map[url];
    if (!r) throw new Error("getaddrinfo ENOTFOUND");
    return new Response(r.body, { status: r.status });
  };
}

describe("page check", () => {
  it("strips scripts and decodes entities", () => {
    const text = htmlToText(page);
    expect(text).not.toContain("hidden quote");
    expect(text).toContain("NFL'");
  });

  it("matches exact quotes across curly quotes and spacing", () => {
    const text = htmlToText(page);
    expect(matchSnippet("held the naming rights to the NFL’s Miami Dolphins stadium since 2016", text)).toBe("found");
    expect(matchSnippet("will from 2027 be   sponsored by Hard Rock.", text)).toBe("found");
  });

  it("accepts a light paraphrase and rejects an invented quote", () => {
    const text = htmlToText(page);
    expect(matchSnippet("The Miami Grand Prix will from 2027 be sponsored by Hard Rock", text)).toBe("close");
    expect(matchSnippet("Hard Rock paid $50 million for ten years of title rights", text)).toBe("not_found");
  });

  it("classifies each source and never drops pages it could not load", async () => {
    const out = await checkEvidence(
      [
        ev("E1", "https://a.com/real", ["will from 2027 be sponsored by Hard Rock"]),
        ev("E2", "https://a.com/real", ["Hard Rock paid $50 million for ten years of title rights"]),
        ev("E3", "https://b.com/blocked", ["anything"]),
        ev("E4", "https://c.com/js-app", ["anything"]),
        ev("E5", "https://nowhere.example/x", ["anything"]),
      ],
      {
        fetcher: fakeFetch({
          "https://a.com/real": { status: 200, body: page },
          "https://b.com/blocked": { status: 403, body: "Forbidden" },
          "https://c.com/js-app": { status: 200, body: "<html><body><div id=root></div></body></html>" },
        }) as never,
      },
    );
    expect(out.map((e) => e.check?.status)).toEqual(["found", "not_found", "unreachable", "unreachable", "unreachable"]);
    expect(out[2].check?.detail).toBe("HTTP 403");
  });
});
