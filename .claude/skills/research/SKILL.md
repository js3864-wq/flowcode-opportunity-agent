---
name: research
description: Research a company's current campaigns, events, products and partnerships, and write a ranked, sourced report of where Flowcode could help. Use when asked to research a company, brand, event or website for Flowcode opportunities, or given a targets file from data/targets.
argument-hint: <company name, website, or data/targets/*.json>
allowed-tools: WebSearch, WebFetch, Read, Write, Edit, Glob, Bash(npm run reports *), PowerShell(npm run reports *)
---

# Research a company for Flowcode opportunities

Input: `$ARGUMENTS`

This is the same pipeline as the API agent in `src/agent/`, run inside Claude Code on the user's Claude plan. You do the research and judgment. The repo's code does validation, the page check on every source, scoring and ranking.

If the input is a path to a targets file (for example `data/targets/us-f1.json`), read it and research each target in turn. Use a separate subagent per company when available, so each company starts with a clean context. Give each subagent this skill's instructions and one target.

## Before you start

Read these files. Do not skip them, they define the output.
- `data/reference/las-vegas-grand-prix.json`: a complete example of the exact output format. Match it field for field.
- `src/agent/types.ts`: the schemas (`EntitySchema`, `SignalSchema`, `OpportunityDraftSchema`, `FollowOnLeadSchema`) and the allowed values for `channels`, `products`, `urgency` and `lens`.
- `src/agent/flowcode.ts`: Flowcode's products and proof points. Use only these product ids and proof point ids.
- `src/agent/lenses.ts`: the six research lenses.

Today's date is the `asOf` date. Use it for "upcoming" and for how fresh each fact is.

## Step 1. Identify the company

One or two searches. Find the official website, who operates or owns it, what it does and how it makes money, its business units, upcoming key dates in the next 12 months for this organization's own events and milestones (not other companies' events, even in the same sport or venue), and its audiences.

## Step 2. Research the six lenses

For each lens in `src/agent/lenses.ts`, first write one line on its own: `Lens: <id>` (for example `Lens: experiences`). The web app reads these lines to show live progress. Then run 2 to 4 specific searches (company name plus the lens terms plus the current or next year). Prioritize the last 90 days and anything upcoming. Skip generic background.

Keep an evidence list as you go. Every fact you plan to use needs evidence:
- `url`: a page you actually saw in search results or opened with WebFetch. Never construct or guess a URL.
- `title`: the page title.
- `snippets`: one to three short quotes copied **exactly** from the page text, each under 150 characters. Copy them character for character. The build step downloads every page and drops any source whose quote is not on it. When you use WebFetch, ask it to return exact sentences verbatim, not a summary.
- `pageAge`: the publication date if you saw one (YYYY-MM-DD or YYYY-MM), else null.
- `lens`: the lens it came from.
Number evidence `E1`, `E2`, ... in the order you add it.

Prefer the company's own site and newsroom, then trade press and major outlets. Aim for 12 to 25 evidence items from at least 6 different sites.

## Step 3. Check for an existing Flowcode relationship

Search `site:flowcode.com <company name>` and the operator's name. Set `relationship.status` to `existing_customer`, `related_account` (a sibling brand, owner, venue or league appears) or `none_found`. When nothing turns up, the summary says "No public Flowcode case study found for ...".

## Step 4. Write signals

12 to 25 signals: discrete, dated facts about what the company is doing now. One fact per signal, duplicates merged. Each cites the evidence ids that support it. Keep numbers exactly as the sources state them. `isUpcoming` is true if it happens after `asOf`.

## Step 5. Write the plays

4 to 6 opportunities. What good looks like:
- Each starts from something specific the company is doing now and names the exact touchpoint and moment ("title-sponsor signage being reprinted for 2027"), not "add QR codes".
- `whyFlowcode` names the gap Flowcode closes and the products that close it, and cites one proof point id only when it truly fits the vertical.
- `play` is 3 or 4 concrete steps: touchpoint, routing, data captured, follow-up.
- Ratings are honest, 1 to 5 integers, each with a short `why`. timeliness is how soon the window opens or closes. scale is the audience or revenue at stake. fit is how directly Flowcode solves it. access is how reachable the buyer is.
- Use only facts in your signals. Put inferences, unknowns and incumbent vendors (for example an existing QR or loyalty program) in `caveats`.
- No two plays are the same pitch on different touchpoints.

Then `followOnLeads`: up to 8 partner or sponsor brands from the signals that are Flowcode prospects in their own right. Then `summary`: a one-sentence headline a seller could open a call with, and 3 bullets.

Writing style for every text field: plain sentences, no em dashes, no semicolons.

## Step 6. Save and build

1. Write the result to `data/reference/<slug>.json`, where slug is the company name in lowercase with hyphens (for example `miami-grand-prix`). If `data/reference` already has a file for this company (same name or one of its aliases, for example `united-states-grand-prix.json` for COTA), reuse that slug so the new run replaces the old one. Include `"producedBy": "claude-code"` and `"asOf": "<today>"`.
2. Run `npm run reports -- --only <slug> --check-sources`.
3. If it reports schema errors, fix the file and run it again. If it drops sources because their quotes were not found, either replace the quote with exact text from that page or remove the source, then run it again.
4. Reply with the top three plays, their scores, and how many sources passed the page check. The report is now at `data/reports/<slug>.md` and in the web app (`npm run dev`).
