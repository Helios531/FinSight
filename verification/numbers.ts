import type { EvidenceCitation, KeyMetric } from "@/lib/types";
import type { DocumentChunk } from "@/parsers/types";
import { evidenceToCitation, type RetrievedEvidence } from "@/retrieval/store";

type ExtractedNumber = {
  raw: string;
  value: number;
  unit: "percent" | "money" | "number";
};

export function extractKeyMetrics(evidence: RetrievedEvidence[]): KeyMetric[] {
  const metrics: KeyMetric[] = [];
  const seen = new Set<string>();

  for (const item of evidence) {
    const labels = inferMetricLabels(item.chunk);
    const numbers = extractNumbers(item.chunk.text);

    for (const label of labels.slice(0, 2)) {
      const number = numbers[0];
      if (!number) continue;
      const key = `${label}:${number.raw}:${item.chunk.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const citation = evidenceToCitation(item);
      metrics.push({
        id: crypto.randomUUID(),
        label,
        value: number.raw,
        period: inferPeriod(item.chunk.text),
        citations: [citation],
        verification: verifyMetric(item.chunk.text, citation)
      });
    }
  }

  return metrics.slice(0, 8);
}

export function verifyGrowthStatement(text: string) {
  const pattern =
    /(?<reported>-?\d+(?:\.\d+)?)\s*%\s+(?:increase|decrease|growth|decline|up|down).*?\bfrom\s+\$?(?<prior>-?\d+(?:\.\d+)?)\s*(?<priorUnit>billion|million|bn|m)?\s+to\s+\$?(?<current>-?\d+(?:\.\d+)?)\s*(?<currentUnit>billion|million|bn|m)?/i;
  const match = text.match(pattern);

  if (!match?.groups) return null;

  const reported = Number(match.groups.reported);
  const prior = scale(Number(match.groups.prior), match.groups.priorUnit);
  const current = scale(Number(match.groups.current), match.groups.currentUnit);

  if (prior === 0) {
    return {
      status: "conflict" as const,
      explanation: "Cannot verify growth rate because prior period value is zero."
    };
  }

  const computed = ((current - prior) / Math.abs(prior)) * 100;
  const delta = Math.abs(Math.abs(reported) - Math.abs(computed));

  return {
    status: delta <= 0.75 ? ("verified" as const) : ("conflict" as const),
    explanation:
      delta <= 0.75
        ? `Reported change matches computed ${computed.toFixed(1)}% within rounding tolerance.`
        : `Reported ${reported.toFixed(1)}% differs from computed ${computed.toFixed(1)}%.`,
    computedValue: `${computed.toFixed(1)}%`
  };
}

function verifyMetric(text: string, citation: EvidenceCitation): KeyMetric["verification"] {
  const growthCheck = verifyGrowthStatement(text);
  if (growthCheck) return growthCheck;

  return {
    status: /\d/.test(citation.excerpt) ? "unverified" : "conflict",
    explanation: /\d/.test(citation.excerpt)
      ? "Value is directly cited, but no complete prior/current pair was available for independent recalculation."
      : "Citation did not contain a verifiable numeric value."
  };
}

function inferMetricLabels(chunk: DocumentChunk) {
  const text = chunk.text.toLowerCase();
  const labels: string[] = [];
  if (text.includes("revenue")) labels.push("Revenue");
  if (text.includes("gross margin")) labels.push("Gross margin");
  if (text.includes("operating margin")) labels.push("Operating margin");
  if (text.includes("free cash flow")) labels.push("Free cash flow");
  if (text.includes("cash flow")) labels.push("Cash flow");
  if (text.includes("debt")) labels.push("Debt");
  if (text.includes("liquidity")) labels.push("Liquidity");
  if (text.includes("eps") || text.includes("earnings per share")) labels.push("EPS");
  return labels;
}

function extractNumbers(text: string): ExtractedNumber[] {
  const matches = text.matchAll(/\$?-?\d+(?:,\d{3})*(?:\.\d+)?\s*(?:%|billion|million|bn|m)?/gi);
  return Array.from(matches).map((match) => {
    const raw = match[0].trim();
    const value = Number.parseFloat(raw.replace(/[$,]/g, ""));
    const lower = raw.toLowerCase();
    return {
      raw,
      value,
      unit: lower.includes("%") ? "percent" : lower.includes("$") ? "money" : "number"
    };
  });
}

function inferPeriod(text: string) {
  return text.match(/\b(Q[1-4]\s+20\d{2}|FY\s?20\d{2}|20\d{2})\b/i)?.[0];
}

function scale(value: number, unit?: string) {
  const normalized = unit?.toLowerCase();
  if (normalized === "billion" || normalized === "bn") return value * 1_000_000_000;
  if (normalized === "million" || normalized === "m") return value * 1_000_000;
  return value;
}
