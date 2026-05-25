import type { AgentClaim, ConfidenceAssessment, KeyMetric } from "@/lib/types";

export function scoreConfidence({
  claims,
  keyMetrics,
  contradictionCount,
  meanRetrievalScore,
  agentConsensus
}: {
  claims: AgentClaim[];
  keyMetrics: KeyMetric[];
  contradictionCount: number;
  meanRetrievalScore: number;
  agentConsensus: number;
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
  score += agentConsensus * 8;
  score -= contradictionCount * 6;
  score -= conflictedMetrics * 4;

  const bounded = Math.max(10, Math.min(92, Math.round(score)));

  return {
    score: bounded,
    label: bounded >= 75 ? "High" : bounded >= 50 ? "Medium" : "Low",
    drivers: [
      `${Math.round(citationCoverage * 100)}% of claims include direct citations.`,
      `Mean retrieval relevance is ${Math.round(meanRetrievalScore * 100)}%.`,
      `${verifiedMetrics} of ${keyMetrics.length} extracted metrics were mathematically verified.`,
      `Agent consensus signal is ${Math.round(agentConsensus * 100)}%.`
    ],
    reductions: [
      ...(contradictionCount > 0
        ? [`${contradictionCount} material disagreement areas require analyst review.`]
        : []),
      ...(conflictedMetrics > 0 ? [`${conflictedMetrics} numeric metrics conflict with recalculation.`] : []),
      ...(metricConsistency < 0.5
        ? ["Most numeric metrics are cited but could not be independently recalculated from complete source pairs."]
        : []),
      ...(meanRetrievalScore < 0.35
        ? ["Retrieval relevance was weak, so conclusions should be treated as provisional."]
        : [])
    ]
  };
}
