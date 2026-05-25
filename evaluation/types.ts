import type { AnalysisReport, DocumentKind } from "@/lib/types";

export type BenchmarkDocument = {
  id: string;
  name: string;
  filename: string;
  kind: DocumentKind;
  content: string;
};

export type BenchmarkExpectation = {
  query: string;
  mustContain: string[];
  metricLabels?: string[];
  forbiddenClaimTerms?: string[];
};

export type FinancialBenchmarkCase = {
  document: BenchmarkDocument;
  expectations: BenchmarkExpectation[];
};

export type EvaluationScores = {
  hallucinationRate: number;
  citationPrecision: number;
  numericalCorrectness: number;
  agentConsistency: number;
  retrievalRecall: number;
};

export type EvaluatedReport = {
  benchmarkId: string;
  report: AnalysisReport;
  scores: EvaluationScores;
  failures: string[];
};
