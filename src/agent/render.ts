import { productName, proofPoint } from "./flowcode";
import type { Report } from "./types";

const URGENCY_LABEL: Record<string, string> = {
  now: "Act now",
  next_90_days: "Next 90 days",
  next_event_cycle: "Next event cycle",
  evergreen: "Evergreen",
};

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Markdown version of a report: the artifact a seller can paste into an email or CRM note. */
export function toMarkdown(r: Report): string {
  const ev = new Map(r.evidence.map((e) => [e.id, e]));
  const footnotes = new Map<string, number>();
  const ref = (id: string) => {
    if (!footnotes.has(id)) footnotes.set(id, footnotes.size + 1);
    return `[${footnotes.get(id)}]`;
  };

  const lines: string[] = [];
  lines.push(`# ${r.entity.name}: where Flowcode can help`);
  lines.push("");
  lines.push(`_As of ${r.asOf}. ${r.entity.operator ? `Operated by ${r.entity.operator}. ` : ""}Run mode: ${r.run.mode}. ${r.evidence.length} sources, ${r.signals.length} signals._`);
  if (r.run.note) lines.push("", `> ${r.run.note}`);
  lines.push("", `**${r.summary.headline}**`, "");
  for (const b of r.summary.bullets) lines.push(`- ${b}`);
  lines.push("", `**Existing Flowcode relationship:** ${r.relationship.summary}`, "");

  lines.push("## Ranked opportunities", "");
  for (const o of r.opportunities) {
    const refs = o.evidenceIds.map(ref).join("");
    const proof = proofPoint(o.proofPointId);
    lines.push(`### ${o.rank}. ${o.title} (score ${o.score.total})`);
    lines.push("");
    lines.push(`**${URGENCY_LABEL[o.timing.urgency]}:** ${o.timing.window}. **Pitch to:** ${o.buyer}. **Unit:** ${o.businessUnit}.`);
    lines.push("");
    lines.push(`**What's happening.** ${o.whatsHappening} ${refs}`);
    lines.push("");
    lines.push(`**Why Flowcode.** ${o.whyFlowcode}${proof ? ` Proof: ${proof.customer}, ${proof.result} (${proof.source}).` : ""}`);
    lines.push("");
    lines.push("**The play.**");
    o.play.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
    lines.push("");
    lines.push(`**Products:** ${o.products.map(productName).join(", ")}. **KPIs:** ${o.kpis.join(", ")}.`);
    const c = o.score.components;
    lines.push(`**Score:** timeliness ${c.timeliness}, fit ${c.fit}, scale ${c.scale}, evidence ${c.evidence}, access ${c.access}.`);
    if (o.caveats.length) lines.push(`**Caveats:** ${o.caveats.join(" ")}`);
    if (o.verification.issues.length) lines.push(`**Fact-check notes:** ${o.verification.issues.join(" ")}`);
    lines.push("");
  }

  if (r.followOnLeads.length) {
    lines.push("## Follow-on leads", "");
    lines.push("| Brand | Role | Flowcode angle |", "| --- | --- | --- |");
    for (const l of r.followOnLeads) lines.push(`| ${l.brand} | ${l.role} | ${l.why} |`);
    lines.push("");
  }

  lines.push("## Sources", "");
  for (const [id, n] of [...footnotes.entries()].sort((a, b) => a[1] - b[1])) {
    const e = ev.get(id);
    if (e) lines.push(`${n}. [${e.title}](${e.url}) (${e.domain}${e.pageAge ? `, ${e.pageAge}` : ""})`);
  }
  lines.push("");
  return lines.join("\n");
}
