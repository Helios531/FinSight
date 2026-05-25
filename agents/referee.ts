import { dedupeCitations, meanScore, stableClaimId } from "@/agents/common";
import { analyzeDebate } from "@/agents/debate";
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
  const debate = analyzeDebate({
    bull: input.bull.claims,
    bear: input.bear.claims,
    risk: input.risk.claims
  });
  const disagreements = debate.disagreements.length > 0
    ? debate.disagreements
    : buildFallbackDisagreements(input.bull.claims, [...input.bear.claims, ...input.risk.claims]);
  const allEvidence = [...input.bull.evidence, ...input.bear.evidence, ...input.risk.evidence];
  const meanRetrievalScore = meanScore(allEvidence);
  const confidence = scoreConfidence({
    claims: allClaims,
    keyMetrics,
    contradictionCount: disagreements.length,
    contradictionScore: debate.assessment.contradictionScore,
    meanRetrievalScore,
    agentConsensus: debate.assessment.consensusScore,
    evidenceWeight: debate.assessment.evidenceWeight,
    confidenceCalibration: debate.assessment.confidenceCalibration
  });

  const citations = dedupeCitations([
    ...input.citations,
    ...allClaims.flatMap((claim) => claim.citations),
    ...keyMetrics.flatMap((metric) => metric.citations)
  ]).slice(0, 24);

  const finalVerdict = buildVerdict(input.bull.claims, input.bear.claims, input.risk.claims, citations, debate.assessment);

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
    debateAssessment: debate.assessment,
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

function buildFallbackDisagreements(bullClaims: AgentClaim[], counterClaims: AgentClaim[]) {
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
      contradictionScore: 0.25,
      evidenceWeight: meanEvidenceWeight([bull, counter]),
      confidenceImpact: 0.08,
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
  citations: EvidenceCitation[],
  debateAssessment: AnalysisReport["debateAssessment"]
): AnalysisReport["finalVerdict"] {
  const bullScore = averageConfidence(bullClaims);
  const bearRiskScore = averageConfidence([...bearClaims, ...riskClaims]);
  const calibratedBull = calibratedAgentConfidence(debateAssessment, "bull", bullScore);
  const calibratedBearRisk = average([
    calibratedAgentConfidence(debateAssessment, "bear", averageConfidence(bearClaims)),
    calibratedAgentConfidence(debateAssessment, "risk", averageConfidence(riskClaims))
  ]);
  const contradictionBuffer = debateAssessment.contradictionScore > 0.5 ? 0.22 : 0.15;
  const stance =
    citations.length === 0
      ? "Insufficient Evidence"
      : debateAssessment.evidenceWeight < 0.22
        ? "Insufficient Evidence"
        : calibratedBull > calibratedBearRisk + contradictionBuffer
        ? "Constructive"
        : calibratedBearRisk > calibratedBull + contradictionBuffer
          ? "Cautious"
          : "Mixed";

  return {
    stance,
    rationale:
      stance === "Insufficient Evidence"
        ? "The system did not retrieve enough cited evidence to support a verdict."
        : `The verdict reflects cited agent findings, contradiction score (${Math.round(debateAssessment.contradictionScore * 100)}%), evidence weight (${Math.round(debateAssessment.evidenceWeight * 100)}%), consensus (${Math.round(debateAssessment.consensusScore * 100)}%), and numeric verification outcomes.`,
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
        "Important conclusions are limited to retrieved excerpts; numeric claims are flagged when recalculation is unavailable, and disagreements are scored for contradiction, evidence weight, and confidence impact.",
      polarity: "neutral",
      confidence: confidence.score / 100,
      citations: citations.slice(0, 2),
      caveats: []
    }
  ];
}

function averageConfidence(claims: AgentClaim[]) {
  if (claims.length === 0) return 0;
  return claims.reduce((sum, claim) => sum + claim.confidence, 0) / claims.length;
}

function calibratedAgentConfidence(
  debateAssessment: AnalysisReport["debateAssessment"],
  agent: "bull" | "bear" | "risk",
  fallback: number
) {
  return debateAssessment.agentScores.find((score) => score.agent === agent)?.calibratedConfidence ?? fallback;
}

function meanEvidenceWeight(claims: AgentClaim[]) {
  const citations = claims.flatMap((claim) => claim.citations);
  if (citations.length === 0) return 0;
  return citations.reduce((sum, citation) => sum + citation.relevanceScore, 0) / citations.length;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
