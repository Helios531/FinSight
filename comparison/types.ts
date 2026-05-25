import type { AgentClaim, AnalysisReport, EvidenceCitation } from "@/lib/types";
import type { NormalizedFinancialMetric } from "@/verification/financial-extraction";

export type HistoricalPeriod = {
  label: string;
  fiscalYear?: number;
  fiscalQuarter?: 1 | 2 | 3 | 4;
};

export type HistoricalSnapshot = {
  id: string;
  period: HistoricalPeriod;
  report: AnalysisReport;
  structuredMetrics?: NormalizedFinancialMetric[];
};

export type HistoricalComparisonType = "quarter_vs_quarter" | "year_vs_year" | "sequential" | "custom";

export type MetricDelta = {
  label: string;
  normalizedLabel: string;
  statementType: string;
  currentValue?: number;
  priorValue?: number;
  currentRawValue: string;
  priorRawValue: string;
  absoluteChange?: number;
  percentChange?: number;
  basisPointChange?: number;
  direction: "improved" | "deteriorated" | "flat" | "not_comparable";
  citations: EvidenceCitation[];
};

export type GuidanceChange = {
  label: string;
  currentRawValue: string;
  priorRawValue: string;
  absoluteChange?: number;
  percentChange?: number;
  direction: "raised" | "lowered" | "unchanged" | "not_comparable";
  citations: EvidenceCitation[];
};

export type RiskFactorDrift = {
  addedTerms: string[];
  removedTerms: string[];
  persistentTerms: string[];
  currentRiskClaimCount: number;
  priorRiskClaimCount: number;
  severityChange: "increased" | "decreased" | "flat";
  citations: EvidenceCitation[];
};

export type SentimentDrift = {
  currentNetSentiment: number;
  priorNetSentiment: number;
  drift: number;
  direction: "more_constructive" | "more_cautious" | "flat";
  currentBreakdown: SentimentBreakdown;
  priorBreakdown: SentimentBreakdown;
};

export type SentimentBreakdown = {
  bull: number;
  bear: number;
  risk: number;
};

export type HistoricalComparisonResult = {
  comparisonType: HistoricalComparisonType;
  currentPeriod: HistoricalPeriod;
  priorPeriod: HistoricalPeriod;
  metricDeltas: MetricDelta[];
  guidanceChanges: GuidanceChange[];
  riskFactorDrift: RiskFactorDrift;
  sentimentDrift: SentimentDrift;
  summary: AgentClaim[];
};
