import { createHash } from "node:crypto";
import type { AgentClaim, AnalysisReport, EvidenceCitation, KeyMetric } from "@/lib/types";
import type {
  GuidanceChange,
  HistoricalComparisonResult,
  HistoricalComparisonType,
  HistoricalSnapshot,
  MetricDelta,
  RiskFactorDrift,
  SentimentBreakdown,
  SentimentDrift
} from "@/comparison/types";
import type { NormalizedFinancialMetric } from "@/verification/financial-extraction";

const improvementLabels = new Set([
  "revenue",
  "gross_profit",
  "gross_margin",
  "operating_income",
  "operating_margin",
  "net_income",
  "eps",
  "cash",
  "total_assets",
  "operating_cash_flow",
  "free_cash_flow",
  "guidance"
]);

const lowerIsBetterLabels = new Set(["total_debt", "total_liabilities", "capital_expenditures", "risk_factor"]);

const riskTerms = [
  "liquidity",
  "debt",
  "refinancing",
  "covenant",
  "concentration",
  "customer",
  "regulatory",
  "litigation",
  "macro",
  "demand",
  "cash flow",
  "going concern",
  "impairment",
  "internal control"
];

export function compareHistoricalFilings({
  current,
  prior,
  comparisonType
}: {
  current: HistoricalSnapshot;
  prior: HistoricalSnapshot;
  comparisonType?: HistoricalComparisonType;
}): HistoricalComparisonResult {
  const resolvedType = comparisonType ?? inferComparisonType(current, prior);
  const metricDeltas = compareMetrics(current, prior);
  const guidanceChanges = compareGuidance(current, prior);
  const riskFactorDrift = compareRiskFactors(current.report, prior.report);
  const sentimentDrift = compareSentiment(current.report, prior.report);

  return {
    comparisonType: resolvedType,
    currentPeriod: current.period,
    priorPeriod: prior.period,
    metricDeltas,
    guidanceChanges,
    riskFactorDrift,
    sentimentDrift,
    summary: buildSummary(metricDeltas, guidanceChanges, riskFactorDrift, sentimentDrift)
  };
}

export function parseHistoricalPeriod(label: string) {
  const quarterMatch = label.match(/\bQ([1-4])\s*(20\d{2})\b/i);
  if (quarterMatch) {
    return {
      label,
      fiscalQuarter: Number(quarterMatch[1]) as 1 | 2 | 3 | 4,
      fiscalYear: Number(quarterMatch[2])
    };
  }

  const yearMatch = label.match(/\b(?:FY\s*)?(20\d{2})\b/i);
  return {
    label,
    fiscalYear: yearMatch ? Number(yearMatch[1]) : undefined
  };
}

function inferComparisonType(current: HistoricalSnapshot, prior: HistoricalSnapshot): HistoricalComparisonType {
  if (
    current.period.fiscalQuarter &&
    prior.period.fiscalQuarter &&
    current.period.fiscalQuarter === prior.period.fiscalQuarter &&
    current.period.fiscalYear !== prior.period.fiscalYear
  ) {
    return "year_vs_year";
  }

  if (current.period.fiscalQuarter && prior.period.fiscalQuarter) {
    return "quarter_vs_quarter";
  }

  if (current.period.fiscalYear && prior.period.fiscalYear) {
    return "year_vs_year";
  }

  return "custom";
}

function compareMetrics(current: HistoricalSnapshot, prior: HistoricalSnapshot): MetricDelta[] {
  const currentMetrics = metricsByKey(metricsForSnapshot(current).filter((metric) => metric.normalizedLabel !== "guidance"));
  const priorMetrics = metricsByKey(metricsForSnapshot(prior).filter((metric) => metric.normalizedLabel !== "guidance"));

  return Array.from(currentMetrics.entries())
    .flatMap(([key, currentMetric]) => {
      const priorMetric = priorMetrics.get(key);
      if (!priorMetric) return [];
      return [toMetricDelta(currentMetric, priorMetric)];
    })
    .sort((a, b) => a.normalizedLabel.localeCompare(b.normalizedLabel));
}

function compareGuidance(current: HistoricalSnapshot, prior: HistoricalSnapshot): GuidanceChange[] {
  const currentGuidance = metricsForSnapshot(current).filter((metric) => metric.normalizedLabel === "guidance");
  const priorGuidance = metricsForSnapshot(prior).filter((metric) => metric.normalizedLabel === "guidance");
  const priorMetric = priorGuidance[0];

  if (!currentGuidance[0] || !priorMetric) return [];

  return currentGuidance.slice(0, 3).map((currentMetric) => {
    const absoluteChange =
      currentMetric.numericValue !== undefined && priorMetric.numericValue !== undefined
        ? currentMetric.numericValue - priorMetric.numericValue
        : undefined;
    const percentChange =
      absoluteChange !== undefined && priorMetric.numericValue
        ? absoluteChange / Math.abs(priorMetric.numericValue)
        : undefined;

    return {
      label: "Guidance",
      currentRawValue: currentMetric.rawValue,
      priorRawValue: priorMetric.rawValue,
      absoluteChange,
      percentChange,
      direction: directionFromChange(absoluteChange, "guidance", "raised", "lowered", "unchanged"),
      citations: [...currentMetric.citations, ...priorMetric.citations]
    };
  });
}

function compareRiskFactors(current: AnalysisReport, prior: AnalysisReport): RiskFactorDrift {
  const currentText = current.riskAnalysis.map((claim) => claim.claim).join("\n").toLowerCase();
  const priorText = prior.riskAnalysis.map((claim) => claim.claim).join("\n").toLowerCase();
  const currentTerms = riskTerms.filter((term) => currentText.includes(term));
  const priorTerms = riskTerms.filter((term) => priorText.includes(term));
  const addedTerms = currentTerms.filter((term) => !priorTerms.includes(term));
  const removedTerms = priorTerms.filter((term) => !currentTerms.includes(term));
  const persistentTerms = currentTerms.filter((term) => priorTerms.includes(term));
  const currentSeverity = current.riskAnalysis.reduce((sum, claim) => sum + claim.confidence, 0);
  const priorSeverity = prior.riskAnalysis.reduce((sum, claim) => sum + claim.confidence, 0);

  return {
    addedTerms,
    removedTerms,
    persistentTerms,
    currentRiskClaimCount: current.riskAnalysis.length,
    priorRiskClaimCount: prior.riskAnalysis.length,
    severityChange:
      Math.abs(currentSeverity - priorSeverity) < 0.05
        ? "flat"
        : currentSeverity > priorSeverity
          ? "increased"
          : "decreased",
    citations: [
      ...current.riskAnalysis.flatMap((claim) => claim.citations),
      ...prior.riskAnalysis.flatMap((claim) => claim.citations)
    ].slice(0, 6)
  };
}

function compareSentiment(current: AnalysisReport, prior: AnalysisReport): SentimentDrift {
  const currentBreakdown = sentimentBreakdown(current);
  const priorBreakdown = sentimentBreakdown(prior);
  const currentNetSentiment = currentBreakdown.bull - currentBreakdown.bear - currentBreakdown.risk;
  const priorNetSentiment = priorBreakdown.bull - priorBreakdown.bear - priorBreakdown.risk;
  const drift = currentNetSentiment - priorNetSentiment;

  return {
    currentNetSentiment,
    priorNetSentiment,
    drift,
    direction: Math.abs(drift) < 0.05 ? "flat" : drift > 0 ? "more_constructive" : "more_cautious",
    currentBreakdown,
    priorBreakdown
  };
}

function toMetricDelta(current: NormalizedFinancialMetric, prior: NormalizedFinancialMetric): MetricDelta {
  const absoluteChange =
    current.numericValue !== undefined && prior.numericValue !== undefined
      ? current.numericValue - prior.numericValue
      : undefined;
  const percentChange =
    absoluteChange !== undefined && prior.numericValue ? absoluteChange / Math.abs(prior.numericValue) : undefined;
  const basisPointChange =
    current.unit === "percent" && prior.unit === "percent" && absoluteChange !== undefined
      ? absoluteChange * 100
      : undefined;

  return {
    label: current.label,
    normalizedLabel: current.normalizedLabel,
    statementType: current.statementType,
    currentValue: current.numericValue,
    priorValue: prior.numericValue,
    currentRawValue: current.rawValue,
    priorRawValue: prior.rawValue,
    absoluteChange,
    percentChange,
    basisPointChange,
    direction: directionFromChange(absoluteChange, current.normalizedLabel, "improved", "deteriorated", "flat"),
    citations: [...current.citations, ...prior.citations]
  };
}

function directionFromChange<TPositive extends string, TNegative extends string, TFlat extends string>(
  change: number | undefined,
  normalizedLabel: string,
  positive: TPositive,
  negative: TNegative,
  flat: TFlat
) {
  if (change === undefined) return "not_comparable" as const;
  if (Math.abs(change) < 0.000001) return flat;
  const higherIsBetter = !lowerIsBetterLabels.has(normalizedLabel) || improvementLabels.has(normalizedLabel);
  return change > 0 === higherIsBetter ? positive : negative;
}

function sentimentBreakdown(report: AnalysisReport): SentimentBreakdown {
  return {
    bull: averageConfidence(report.bullCase),
    bear: averageConfidence(report.bearCase),
    risk: averageConfidence(report.riskAnalysis)
  };
}

function averageConfidence(claims: AnalysisReport["bullCase"]) {
  if (claims.length === 0) return 0;
  return claims.reduce((sum, claim) => sum + claim.confidence, 0) / claims.length;
}

function metricsForSnapshot(snapshot: HistoricalSnapshot): NormalizedFinancialMetric[] {
  if (snapshot.structuredMetrics?.length) return snapshot.structuredMetrics;
  return snapshot.report.keyMetrics.map(metricFromKeyMetric);
}

function metricFromKeyMetric(metric: KeyMetric): NormalizedFinancialMetric {
  const numeric = normalizeNumeric(metric.value);
  return {
    id: metric.id,
    statementType: inferStatementType(metric.label),
    label: metric.label,
    normalizedLabel: normalizeLabel(metric.label),
    rawValue: metric.value,
    numericValue: numeric.value,
    unit: numeric.unit,
    scale: numeric.scale,
    period: metric.period,
    direction: "unknown",
    citations: metric.citations,
    verification: metric.verification
  };
}

function normalizeNumeric(value: string) {
  const lower = value.toLowerCase();
  const match = value.match(/-?\d+(?:,\d{3})*(?:\.\d+)?/);
  const parsed = match ? Number.parseFloat(match[0].replace(/,/g, "")) : undefined;
  const scale = lower.includes("billion") || lower.includes("bn") ? 1_000_000_000 : lower.includes("million") || lower.includes("m") ? 1_000_000 : lower.includes("thousand") || lower.includes("k") ? 1_000 : 1;
  return {
    value: parsed === undefined ? undefined : parsed * scale,
    unit: lower.includes("%") ? ("percent" as const) : value.includes("$") ? ("usd" as const) : ("unknown" as const),
    scale: scale as 1 | 1_000 | 1_000_000 | 1_000_000_000
  };
}

function inferStatementType(label: string): NormalizedFinancialMetric["statementType"] {
  const normalized = normalizeLabel(label);
  if (["cash", "total_debt", "total_assets", "total_liabilities"].includes(normalized)) return "balance_sheet";
  if (["operating_cash_flow", "free_cash_flow", "capital_expenditures"].includes(normalized)) return "cash_flow_statement";
  if (normalized === "guidance") return "guidance";
  if (normalized === "risk_factor") return "risk_factor";
  return "income_statement";
}

function normalizeLabel(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function metricsByKey(metrics: NormalizedFinancialMetric[]) {
  const map = new Map<string, NormalizedFinancialMetric>();
  for (const metric of metrics) {
    const key = `${metric.statementType}:${metric.normalizedLabel}`;
    if (!map.has(key)) map.set(key, metric);
  }
  return map;
}

function buildSummary(
  metricDeltas: MetricDelta[],
  guidanceChanges: GuidanceChange[],
  riskFactorDrift: RiskFactorDrift,
  sentimentDrift: SentimentDrift
): AgentClaim[] {
  const citations = [
    ...metricDeltas.flatMap((delta) => delta.citations),
    ...guidanceChanges.flatMap((guidance) => guidance.citations),
    ...riskFactorDrift.citations
  ].slice(0, 4);

  const claim = [
    `${metricDeltas.length} comparable metrics were matched across periods.`,
    guidanceChanges.length > 0 ? `${guidanceChanges.length} guidance changes were detected.` : "No comparable guidance change was detected.",
    `Risk factor severity was ${riskFactorDrift.severityChange}.`,
    `Sentiment drift was ${sentimentDrift.direction}.`
  ].join(" ");

  return [
    {
      id: stableSummaryId(claim, citations),
      title: "Historical comparison summary",
      claim,
      polarity: sentimentDrift.direction === "more_constructive" ? "bull" : sentimentDrift.direction === "more_cautious" ? "bear" : "neutral",
      confidence: citations.length > 0 ? 0.72 : 0.42,
      citations,
      caveats: citations.length > 0 ? [] : ["Comparison summary has limited citation coverage."]
    }
  ];
}

function stableSummaryId(text: string, citations: EvidenceCitation[]) {
  return createHash("sha256")
    .update(text)
    .update(citations.map((citation) => citation.id).join("|"))
    .digest("hex")
    .slice(0, 32);
}
