import { dedupeCitations, meanScore, stableClaimId } from "@/agents/common";
import type { RefereeInput } from "@/agents/types";
import type { AgentClaim, AnalysisReport, EvidenceCitation, KeyMetric } from "@/lib/types";
import { scoreConfidence } from "@/scoring/confidence";

export function runRefereeAgent({
  input,
  keyMetrics,
  document,
  startedAt
}: {
  input: RefereeInput;
  keyMetrics: KeyMetric[];
  document: AnalysisReport["document"];
  startedAt: number;
}): AnalysisReport {
  const allClaims = [...input.bull.claims, ...input.bear.claims, ...input.risk.claims];
  const disagreements = buildDisagreements(input.bull.claims, [...input.bear.claims, ...input.risk.claims]);
  const allEvidence = [...input.bull.evidence, ...input.bear.evidence, ...input.risk.evidence];
  const meanRetrievalScore = meanScore(allEvidence);
  const confidence = scoreConfidence({
    claims: allClaims,
    keyMetrics,
    contradictionCount: disagreements.length,
    meanRetrievalScore,
    agentConsensus: estimateConsensus(input.bull.claims, input.bear.claims, input.risk.claims)
  });

  const citations = dedupeCitations([
    ...input.citations,
    ...allClaims.flatMap((claim) => claim.citations),
    ...keyMetrics.flatMap((metric) => metric.citations)
  ]).slice(0, 24);

  const finalVerdict = buildVerdict(input.bull.claims, input.bear.claims, input.risk.claims, citations);

  return {
    document,
    executiveSummary: buildExecutiveSummary(finalVerdict, confidence, citations),
    bullCase: input.bull.claims,
    bearCase: input.bear.claims,
    riskAnalysis: input.risk.claims,
    keyMetrics,
    confidence,
    citations,
    disagreements,
    finalVerdict,
    traces: [
      input.bull.trace,
      input.bear.trace,
      input.risk.trace,
      {
        agent: "Referee Agent",
        latencyMs: Date.now() - startedAt,
        retrievalDiagnostics: [],
        tokenUsage: undefined
      }
    ]
  };
}

function buildDisagreements(bullClaims: AgentClaim[], counterClaims: AgentClaim[]) {
  const bull = bullClaims[0];
  const counter = counterClaims[0];
  if (!bull || !counter) return [];

  return [
    {
      issue: "Upside evidence versus downside or risk evidence",
      bullPosition: bull.claim,
      bearOrRiskPosition: counter.claim,
      refereeAssessment:
        "Both positions are retained because each is grounded in retrieved excerpts. The referee does not net them into a single unsupported directional call.",
      citations: dedupeCitations([...bull.citations, ...counter.citations])
    }
  ].map((item) => ({
    ...item,
    id: stableClaimId(item.issue, `${item.bullPosition}\n${item.bearOrRiskPosition}`, item.citations)
  }));
}

function buildVerdict(
  bullClaims: AgentClaim[],
  bearClaims: AgentClaim[],
  riskClaims: AgentClaim[],
  citations: EvidenceCitation[]
): AnalysisReport["finalVerdict"] {
  const bullScore = averageConfidence(bullClaims);
  const bearRiskScore = averageConfidence([...bearClaims, ...riskClaims]);
  const stance =
    citations.length === 0
      ? "Insufficient Evidence"
      : bullScore > bearRiskScore + 0.15
        ? "Constructive"
        : bearRiskScore > bullScore + 0.15
          ? "Cautious"
          : "Mixed";

  return {
    stance,
    rationale:
      stance === "Insufficient Evidence"
        ? "The system did not retrieve enough cited evidence to support a verdict."
        : "The verdict reflects cited agent findings, unresolved disagreements, retrieval quality, and numeric verification outcomes.",
    citations: citations.slice(0, 3)
  };
}

function buildExecutiveSummary(
  verdict: AnalysisReport["finalVerdict"],
  confidence: AnalysisReport["confidence"],
  citations: EvidenceCitation[]
): AgentClaim[] {
  return [
    {
      id: stableClaimId("Referee verdict", `${verdict.stance}: ${verdict.rationale}`, verdict.citations),
      title: "Referee verdict",
      claim: `${verdict.stance}: ${verdict.rationale}`,
      polarity: "neutral",
      confidence: confidence.score / 100,
      citations: verdict.citations,
      caveats: confidence.reductions
    },
    {
      id: stableClaimId("Audit posture", "Important conclusions are limited to retrieved excerpts.", citations.slice(0, 2)),
      title: "Audit posture",
      claim:
        "Important conclusions are limited to retrieved excerpts, and numeric claims are flagged when independent recalculation is unavailable.",
      polarity: "neutral",
      confidence: confidence.score / 100,
      citations: citations.slice(0, 2),
      caveats: []
    }
  ];
}

function estimateConsensus(bullClaims: AgentClaim[], bearClaims: AgentClaim[], riskClaims: AgentClaim[]) {
  const average = averageConfidence([...bullClaims, ...bearClaims, ...riskClaims]);
  const spread = Math.abs(averageConfidence(bullClaims) - averageConfidence([...bearClaims, ...riskClaims]));
  return Math.max(0, Math.min(1, average - spread / 2));
}

function averageConfidence(claims: AgentClaim[]) {
  if (claims.length === 0) return 0;
  return claims.reduce((sum, claim) => sum + claim.confidence, 0) / claims.length;
}
