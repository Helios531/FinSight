import { citationSupportScore, rejectGenericFluff } from "@/agents/grounding";
import type { AnalysisReport, AgentClaim } from "@/lib/types";
import type { FinancialBenchmarkCase, EvaluationScores } from "@/evaluation/types";
import type { RetrievedEvidence } from "@/retrieval/store";

const minimumSupport = 0.08;

export function scoreReport(report: AnalysisReport, benchmark: FinancialBenchmarkCase): EvaluationScores {
  return {
    hallucinationRate: computeHallucinationRate(report),
    citationPrecision: computeCitationPrecision(report),
    numericalCorrectness: computeNumericalCorrectness(report),
    agentConsistency: computeAgentConsistency(report),
    retrievalRecall: 0
  };
}

export function scoreRetrieval(benchmark: FinancialBenchmarkCase, retrievals: RetrievedEvidence[][]) {
  const expectations = benchmark.expectations;
  if (expectations.length === 0) return 1;

  const matched = expectations.filter((expectation, index) => {
    const evidenceText = (retrievals[index] ?? [])
      .map((item) => item.chunk.text)
      .join("\n")
      .toLowerCase();
    return expectation.mustContain.every((term) => evidenceText.includes(term.toLowerCase()));
  }).length;

  return matched / expectations.length;
}

export function findEvaluationFailures(
  report: AnalysisReport,
  benchmark: FinancialBenchmarkCase,
  scores: EvaluationScores
) {
  const failures: string[] = [];

  if (scores.hallucinationRate > 0) {
    failures.push(`Hallucination rate was ${formatRate(scores.hallucinationRate)}.`);
  }

  if (scores.citationPrecision < 0.8) {
    failures.push(`Citation precision was ${formatRate(scores.citationPrecision)}.`);
  }

  if (scores.numericalCorrectness < 0.5 && report.keyMetrics.length > 0) {
    failures.push(`Numerical correctness was ${formatRate(scores.numericalCorrectness)}.`);
  }

  if (scores.agentConsistency < 0.5) {
    failures.push(`Agent consistency was ${formatRate(scores.agentConsistency)}.`);
  }

  for (const expectation of benchmark.expectations) {
    const reportText = JSON.stringify(report).toLowerCase();
    for (const forbidden of expectation.forbiddenClaimTerms ?? []) {
      if (reportText.includes(forbidden.toLowerCase())) {
        failures.push(`Forbidden unsupported term appeared: ${forbidden}.`);
      }
    }
  }

  return failures;
}

export function compareReports(first: AnalysisReport, second: AnalysisReport) {
  const firstSignature = reportSignature(first);
  const secondSignature = reportSignature(second);
  const matches = firstSignature.filter((value, index) => value === secondSignature[index]).length;
  return firstSignature.length === 0 ? 1 : matches / firstSignature.length;
}

function computeHallucinationRate(report: AnalysisReport) {
  const claims = agentClaims(report);
  if (claims.length === 0) return 0;
  const unsupported = claims.filter((claim) => {
    const evidenceText = claim.citations.map((citation) => citation.excerpt).join("\n");
    return (
      claim.citations.length === 0 ||
      citationSupportScore(claim.claim, evidenceText) < minimumSupport ||
      rejectGenericFluff(claim.claim)
    );
  }).length;
  return unsupported / claims.length;
}

function computeCitationPrecision(report: AnalysisReport) {
  const citedClaims = agentClaims(report).filter((claim) => claim.citations.length > 0);
  if (citedClaims.length === 0) return 0;
  const supported = citedClaims.filter((claim) => {
    const evidenceText = claim.citations.map((citation) => citation.excerpt).join("\n");
    return citationSupportScore(claim.claim, evidenceText) >= minimumSupport;
  }).length;
  return supported / citedClaims.length;
}

function computeNumericalCorrectness(report: AnalysisReport) {
  if (report.keyMetrics.length === 0) return 1;
  const correct = report.keyMetrics.filter((metric) => metric.verification.status !== "conflict").length;
  return correct / report.keyMetrics.length;
}

function computeAgentConsistency(report: AnalysisReport) {
  const groups = [report.bullCase, report.bearCase, report.riskAnalysis];
  const nonEmpty = groups.filter((claims) => claims.length > 0).length / groups.length;
  const cited = groups.filter((claims) => claims.every((claim) => claim.citations.length > 0)).length / groups.length;
  return (nonEmpty + cited) / 2;
}

function agentClaims(report: AnalysisReport): AgentClaim[] {
  return [...report.bullCase, ...report.bearCase, ...report.riskAnalysis].filter(
    (claim) => claim.title !== "Insufficient retrieved evidence"
  );
}

function reportSignature(report: AnalysisReport) {
  return [
    report.finalVerdict.stance,
    String(report.confidence.score),
    ...agentClaims(report).map((claim) => claim.id),
    ...report.keyMetrics.map((metric) => `${metric.label}:${metric.value}:${metric.verification.status}`)
  ];
}

function formatRate(value: number) {
  return `${Math.round(value * 100)}%`;
}
