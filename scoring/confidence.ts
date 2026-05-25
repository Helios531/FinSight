import type { AgentClaim, ConfidenceAssessment, KeyMetric } from "@/lib/types";

export function scoreConfidence({
  claims,
  keyMetrics,
  contradictionCount = 0,
  contradictionScore = contradictionCount > 0 ? Math.min(1, contradictionCount * 0.18) : 0,
  meanRetrievalScore,
  agentConsensus,
  evidenceWeight = meanRetrievalScore,
  confidenceCalibration = agentConsensus
}: {
  claims: AgentClaim[];
  keyMetrics: KeyMetric[];
  contradictionCount?: number;
  contradictionScore?: number;
  meanRetrievalScore: number;
  agentConsensus: number;
  evidenceWeight?: number;
  confidenceCalibration?: number;
}): ConfidenceAssessment {
  const citedClaims = claims.filter((claim) => claim.citations.length > 0).length;
  const citationCoverage = claims.length === 0 ? 0 : citedClaims / claims.length;
  const verifiedMetrics = keyMetrics.filter((metric) => metric.verification.status === "verified").length;
  const conflictedMetrics = keyMetrics.filter((metric) => metric.verification.status === "conflict").length;
  const metricConsistency = keyMetrics.length === 0 ? 0.55 : verifiedMetrics / keyMetrics.length;

  let score = 32;
  score += citationCoverage * 30;
  score += Math.min(1, meanRetrievalScore) * 18;
  score += metricConsistency * 12;
  score += agentConsensus * 6;
  score += evidenceWeight * 5;
  score += confidenceCalibration * 5;
  score -= contradictionScore * 16;
  score -= conflictedMetrics * 4;

  const bounded = Math.max(10, Math.min(92, Math.round(score)));

  return {
    score: bounded,
    label: bounded >= 75 ? "High" : bounded >= 50 ? "Medium" : "Low",
    drivers: [
      `${Math.round(citationCoverage * 100)}% of claims include direct citations.`,
      `Mean retrieval relevance is ${Math.round(meanRetrievalScore * 100)}%.`,
      `Debate evidence weight is ${Math.round(evidenceWeight * 100)}%.`,
      `${verifiedMetrics} of ${keyMetrics.length} extracted metrics were mathematically verified.`,
      `Agent consensus signal is ${Math.round(agentConsensus * 100)}%.`,
      `Calibrated agent confidence signal is ${Math.round(confidenceCalibration * 100)}%.`
    ],
    reductions: [
      ...(contradictionScore > 0.25
        ? [`Debate contradiction score is ${Math.round(contradictionScore * 100)}%, requiring analyst review.`]
        : []),
      ...(conflictedMetrics > 0 ? [`${conflictedMetrics} numeric metrics conflict with recalculation.`] : []),
      ...(metricConsistency < 0.5
        ? ["Most numeric metrics are cited but could not be independently recalculated from complete source pairs."]
        : []),
      ...(meanRetrievalScore < 0.35
        ? ["Retrieval relevance was weak, so conclusions should be treated as provisional."]
        : []),
      ...(evidenceWeight < 0.45
        ? ["Debate evidence weighting was weak, so agent conclusions were discounted."]
        : [])
    ]
  };
}
