import { createHash } from "node:crypto";
import type { EvidenceCitation, KeyMetric } from "@/lib/types";
import { evidenceToCitation, type RetrievedEvidence } from "@/retrieval/store";
import { verifyGrowthStatement } from "@/verification/numbers";

export type FinancialStatementType = "income_statement" | "balance_sheet" | "cash_flow_statement";

export type NormalizedFinancialMetric = {
  id: string;
  statementType: FinancialStatementType | "guidance" | "risk_factor";
  label: string;
  normalizedLabel: string;
  rawValue: string;
  numericValue?: number;
  unit: "usd" | "percent" | "shares" | "ratio" | "count" | "unknown";
  scale: 1 | 1_000 | 1_000_000 | 1_000_000_000;
  period?: string;
  direction?: "increase" | "decrease" | "range" | "unknown";
  citations: EvidenceCitation[];
  verification: KeyMetric["verification"];
};

type MetricPattern = {
  label: string;
  normalizedLabel: string;
  statementType: NormalizedFinancialMetric["statementType"];
  aliases: string[];
};

const metricPatterns: MetricPattern[] = [
  {
    label: "Revenue",
    normalizedLabel: "revenue",
    statementType: "income_statement",
    aliases: ["revenue", "net revenue", "sales"]
  },
  {
    label: "Gross profit",
    normalizedLabel: "gross_profit",
    statementType: "income_statement",
    aliases: ["gross profit"]
  },
  {
    label: "Gross margin",
    normalizedLabel: "gross_margin",
    statementType: "income_statement",
    aliases: ["gross margin"]
  },
  {
    label: "Operating income",
    normalizedLabel: "operating_income",
    statementType: "income_statement",
    aliases: ["operating income", "income from operations"]
  },
  {
    label: "Operating margin",
    normalizedLabel: "operating_margin",
    statementType: "income_statement",
    aliases: ["operating margin"]
  },
  {
    label: "Net income",
    normalizedLabel: "net_income",
    statementType: "income_statement",
    aliases: ["net income", "net loss"]
  },
  {
    label: "EPS",
    normalizedLabel: "eps",
    statementType: "income_statement",
    aliases: ["eps", "earnings per share", "diluted earnings per share"]
  },
  {
    label: "Cash",
    normalizedLabel: "cash",
    statementType: "balance_sheet",
    aliases: ["cash and cash equivalents", "cash"]
  },
  {
    label: "Total assets",
    normalizedLabel: "total_assets",
    statementType: "balance_sheet",
    aliases: ["total assets"]
  },
  {
    label: "Total debt",
    normalizedLabel: "total_debt",
    statementType: "balance_sheet",
    aliases: ["total debt", "debt outstanding", "borrowings"]
  },
  {
    label: "Total liabilities",
    normalizedLabel: "total_liabilities",
    statementType: "balance_sheet",
    aliases: ["total liabilities"]
  },
  {
    label: "Operating cash flow",
    normalizedLabel: "operating_cash_flow",
    statementType: "cash_flow_statement",
    aliases: ["operating cash flow", "cash provided by operating activities", "net cash provided by operating activities"]
  },
  {
    label: "Free cash flow",
    normalizedLabel: "free_cash_flow",
    statementType: "cash_flow_statement",
    aliases: ["free cash flow"]
  },
  {
    label: "Capital expenditures",
    normalizedLabel: "capital_expenditures",
    statementType: "cash_flow_statement",
    aliases: ["capital expenditures", "capex", "capital expenditure"]
  }
];

const guidanceAliases = ["guidance", "outlook", "expect", "expects", "forecast", "project", "target"];
const riskAliases = ["risk factors", "risk", "uncertain", "liquidity", "debt", "concentration", "regulatory"];

export function extractStructuredFinancials(evidence: RetrievedEvidence[]): NormalizedFinancialMetric[] {
  const metrics = evidence.flatMap((item) => extractMetricsFromEvidence(item));
  return dedupeMetrics(metrics).slice(0, 24);
}

export function structuredMetricsToKeyMetrics(metrics: NormalizedFinancialMetric[]): KeyMetric[] {
  return metrics.map((metric) => ({
    id: metric.id,
    label: metric.label,
    value: metric.rawValue,
    period: metric.period,
    citations: metric.citations,
    verification: metric.verification
  }));
}

function extractMetricsFromEvidence(item: RetrievedEvidence): NormalizedFinancialMetric[] {
  const text = item.chunk.text;
  const lower = text.toLowerCase();
  const citations = [evidenceToCitation(item)];
  const extracted: NormalizedFinancialMetric[] = [];

  for (const pattern of metricPatterns) {
    if (!pattern.aliases.some((alias) => lower.includes(alias))) continue;
    const value = findNearestValue(text, pattern.aliases);
    if (!value) continue;

    extracted.push(toMetric(pattern, value, text, citations));
  }

  const guidance = extractGuidance(text, citations);
  if (guidance) extracted.push(guidance);

  const risk = extractRiskFactor(text, citations);
  if (risk) extracted.push(risk);

  return extracted;
}

function toMetric(
  pattern: MetricPattern,
  value: ExtractedFinancialValue,
  sourceText: string,
  citations: EvidenceCitation[]
): NormalizedFinancialMetric {
  const growthCheck = verifyGrowthStatement(sourceText);
  return {
    id: stableMetricId(pattern.normalizedLabel, value.raw, citations),
    statementType: pattern.statementType,
    label: pattern.label,
    normalizedLabel: pattern.normalizedLabel,
    rawValue: value.raw,
    numericValue: value.numericValue,
    unit: value.unit,
    scale: value.scale,
    period: inferPeriod(sourceText),
    direction: inferDirection(sourceText),
    citations,
    verification: growthCheck ?? {
      status: "unverified",
      explanation: "Metric is cited and normalized, but no complete calculation pair was available for independent verification."
    }
  };
}

function extractGuidance(text: string, citations: EvidenceCitation[]): NormalizedFinancialMetric | null {
  const lower = text.toLowerCase();
  if (!guidanceAliases.some((alias) => lower.includes(alias))) return null;
  const value = findNearestValue(text, guidanceAliases);
  if (!value) return null;

  return {
    id: stableMetricId("guidance", value.raw, citations),
    statementType: "guidance",
    label: "Guidance",
    normalizedLabel: "guidance",
    rawValue: value.raw,
    numericValue: value.numericValue,
    unit: value.unit,
    scale: value.scale,
    period: inferPeriod(text),
    direction: inferDirection(text),
    citations,
    verification: {
      status: "unverified",
      explanation: "Guidance value is cited but forward-looking and not independently verifiable from historical source pairs."
    }
  };
}

function extractRiskFactor(text: string, citations: EvidenceCitation[]): NormalizedFinancialMetric | null {
  const lower = text.toLowerCase();
  if (!riskAliases.some((alias) => lower.includes(alias))) return null;
  const value = findNearestValue(text, riskAliases) ?? {
    raw: "Risk disclosed",
    numericValue: undefined,
    unit: "unknown" as const,
    scale: 1 as const
  };

  return {
    id: stableMetricId("risk_factor", value.raw, citations),
    statementType: "risk_factor",
    label: "Risk factor",
    normalizedLabel: "risk_factor",
    rawValue: value.raw,
    numericValue: value.numericValue,
    unit: value.unit,
    scale: value.scale,
    period: inferPeriod(text),
    direction: "unknown",
    citations,
    verification: {
      status: "unverified",
      explanation: "Risk factor is extracted as cited qualitative exposure, not a recalculable financial metric."
    }
  };
}

type ExtractedFinancialValue = {
  raw: string;
  numericValue?: number;
  unit: NormalizedFinancialMetric["unit"];
  scale: NormalizedFinancialMetric["scale"];
};

function findNearestValue(text: string, aliases: string[]): ExtractedFinancialValue | null {
  const lower = text.toLowerCase();
  const matches = aliases
    .map((alias) => ({ alias, index: lower.indexOf(alias) }))
    .filter((match) => match.index >= 0)
    .sort((a, b) => a.index - b.index);
  const match = matches[0];
  if (!match) return null;

  const afterAlias = text.slice(match.index + match.alias.length, match.index + match.alias.length + 180);
  const beforeAlias = text.slice(Math.max(0, match.index - 80), match.index);
  return findValueInWindow(afterAlias) ?? findValueInWindow(beforeAlias);
}

function findValueInWindow(window: string): ExtractedFinancialValue | null {
  const range = window.match(
    /\$?\(?-?\d+(?:,\d{3})*(?:\.\d+)?\)?\s*(?:%|basis points|bps|billion|million|thousand|bn|m|k)?\s*(?:to|-)\s*\$?\(?-?\d+(?:,\d{3})*(?:\.\d+)?\)?\s*(?:%|billion|million|thousand|bn|m|k)?/i
  );
  if (range) return normalizeValue(range[0]);

  const single = window.match(/\$?\(?-?\d+(?:,\d{3})*(?:\.\d+)?\)?\s*(?:%|basis points|bps|billion|million|thousand|bn|m|k)?/i);
  return single ? normalizeValue(single[0]) : null;
}

function normalizeValue(raw: string): ExtractedFinancialValue {
  const lower = raw.toLowerCase();
  const firstNumber = raw.match(/-?\d+(?:,\d{3})*(?:\.\d+)?/);
  const parsed = firstNumber ? Number.parseFloat(firstNumber[0].replace(/,/g, "")) : undefined;
  const scale = inferScale(lower);
  const unit = inferUnit(lower, raw);
  return {
    raw: raw.trim(),
    numericValue: parsed === undefined ? undefined : parsed * scale,
    unit,
    scale
  };
}

function inferScale(lower: string): NormalizedFinancialMetric["scale"] {
  if (/\b(billion|bn)\b/.test(lower)) return 1_000_000_000;
  if (/\b(million|m)\b/.test(lower)) return 1_000_000;
  if (/\b(thousand|k)\b/.test(lower)) return 1_000;
  return 1;
}

function inferUnit(lower: string, raw: string): NormalizedFinancialMetric["unit"] {
  if (lower.includes("%") || lower.includes("basis points") || lower.includes("bps")) return "percent";
  if (raw.includes("$")) return "usd";
  if (lower.includes("share")) return "shares";
  return "unknown";
}

function inferPeriod(text: string) {
  return text.match(/\b(Q[1-4]\s+20\d{2}|FY\s?20\d{2}|fiscal\s+20\d{2}|20\d{2})\b/i)?.[0];
}

function inferDirection(text: string): NormalizedFinancialMetric["direction"] {
  const lower = text.toLowerCase();
  if (/\b(to|-)\b/.test(text) && /\d/.test(text)) return "range";
  if (/\b(increase|increased|growth|grew|higher|improved|up)\b/.test(lower)) return "increase";
  if (/\b(decrease|decreased|decline|declined|lower|down|deteriorated)\b/.test(lower)) return "decrease";
  return "unknown";
}

function dedupeMetrics(metrics: NormalizedFinancialMetric[]) {
  const seen = new Set<string>();
  return metrics.filter((metric) => {
    const key = `${metric.normalizedLabel}:${metric.rawValue}:${metric.citations[0]?.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stableMetricId(label: string, value: string, citations: EvidenceCitation[]) {
  return createHash("sha256")
    .update(label)
    .update(value)
    .update(citations.map((citation) => citation.id).join("|"))
    .digest("hex")
    .slice(0, 32);
}
