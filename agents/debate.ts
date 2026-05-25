import { dedupeCitations, stableClaimId } from "@/agents/common";
import type { AgentClaim, AnalysisReport, DebateAgentScore, EvidenceCitation } from "@/lib/types";

type AgentClaimGroup = {
  bull: AgentClaim[];
  bear: AgentClaim[];
  risk: AgentClaim[];
};

type DebatePair = {
  bull: AgentClaim;
  counter: AgentClaim;
  contradictionScore: number;
  evidenceWeight: number;
  confidenceImpact: number;
  sharedThemes: string[];
  citations: EvidenceCitation[];
};

const positiveTerms = [
  "growth",
  "grew",
  "increase",
  "increased",
  "improved",
  "expand",
  "expanded",
  "positive",
  "raised",
  "profitability",
  "margin expansion",
  "cash flow positive"
];

const negativeTerms = [
  "decline",
  "declined",
  "decrease",
  "decreased",
  "pressure",
  "weak",
  "lowered",
  "risk",
  "loss",
  "headwind",
  "deterioration",
  "cash burn",
  "liquidity",
  "debt",
  "refinancing",
  "concentration",
  "litigation",
  "regulatory"
];

const themePatterns = [
  { theme: "revenue", pattern: /\brevenue|sales|top line\b/i },
  { theme: "margin", pattern: /\bmargin|gross profit|operating income|profitability\b/i },
  { theme: "cash_flow", pattern: /\bcash flow|free cash flow|cash burn|liquidity\b/i },
  { theme: "debt", pattern: /\bdebt|refinancing|covenant|maturity|leverage\b/i },
  { theme: "demand", pattern: /\bdemand|churn|retention|customer|backlog\b/i },
  { theme: "guidance", pattern: /\bguidance|outlook|forecast|expect\b/i },
  { theme: "legal_regulatory", pattern: /\blegal|litigation|regulatory|compliance|investigation\b/i },
  { theme: "macro", pattern: /\bmacro|recession|inflation|rates|fx|currency\b/i }
];

export function analyzeDebate(groups: AgentClaimGroup): {
  assessment: AnalysisReport["debateAssessment"];
  disagreements: AnalysisReport["disagreements"];
} {
  const pairs = debatePairs(groups.bull, [...groups.bear, ...groups.risk]);
  const agentScores = [
    agentScore("bull", groups.bull),
    agentScore("bear", groups.bear),
    agentScore("risk", groups.risk)
  ];
  const evidenceWeight = round(average(agentScores.map((score) => score.evidenceWeight)));
  const contradictionScore = round(average(pairs.map((pair) => pair.contradictionScore)));
  const consensusScore = round(calculateConsensus(agentScores, contradictionScore));
  const confidenceCalibration = round(average(agentScores.map((score) => score.calibratedConfidence)));
  const disagreements = pairs
    .filter((pair) => pair.contradictionScore >= 0.32 || pair.confidenceImpact >= 0.12)
    .sort((a, b) => b.confidenceImpact - a.confidenceImpact || b.contradictionScore - a.contradictionScore)
    .slice(0, 4)
    .map(disagreementFromPair);

  return {
    assessment: {
      contradictionScore,
      evidenceWeight,
      consensusScore,
      confidenceCalibration,
      agentScores,
      findings: debateFindings({ contradictionScore, evidenceWeight, consensusScore, confidenceCalibration, pairs })
    },
    disagreements
  };
}

export function contradictionScore(a: AgentClaim, b: AgentClaim) {
  const sharedThemes = intersect(themesForClaim(a), themesForClaim(b));
  const polarityConflict = a.polarity !== b.polarity && (a.polarity === "bull" || b.polarity === "bull") ? 0.32 : 0.14;
  const directionalConflict = directionalScore(a.claim) * directionalScore(b.claim) < 0 ? 0.28 : 0;
  const themeConflict = Math.min(0.28, sharedThemes.length * 0.14);
  const confidenceConflict = Math.min(0.12, Math.abs(a.confidence - b.confidence) * 0.2);
  const citationOverlapPenalty = citationOverlap(a, b) > 0 ? -0.08 : 0;
  return clamp(round(polarityConflict + directionalConflict + themeConflict + confidenceConflict + citationOverlapPenalty), 0, 1);
}

export function evidenceWeight(claim: AgentClaim) {
  if (claim.citations.length === 0) return 0;
  const meanRelevance = average(claim.citations.map((citation) => citation.relevanceScore));
  const citationDepth = Math.min(1, claim.citations.length / 2);
  const excerptCoverage = Math.min(1, average(claim.citations.map((citation) => Math.min(1, citation.excerpt.length / 220))));
  return clamp(round(meanRelevance * 0.62 + citationDepth * 0.25 + excerptCoverage * 0.13), 0, 1);
}

export function calibratedClaimConfidence(claim: AgentClaim) {
  const weight = evidenceWeight(claim);
  const citationCoverage = claim.citations.length > 0 ? 1 : 0;
  const caveatPenalty = Math.min(0.18, claim.caveats.length * 0.045);
  return clamp(round(claim.confidence * 0.58 + weight * 0.32 + citationCoverage * 0.1 - caveatPenalty), 0.05, 0.95);
}

function debatePairs(bullClaims: AgentClaim[], counterClaims: AgentClaim[]): DebatePair[] {
  return bullClaims.flatMap((bull) =>
    counterClaims.map((counter) => {
      const sharedThemes = intersect(themesForClaim(bull), themesForClaim(counter));
      const score = contradictionScore(bull, counter);
      const weight = round(average([evidenceWeight(bull), evidenceWeight(counter)]));
      const confidenceImpact = round(score * weight * average([bull.confidence, counter.confidence]));
      const citations = dedupeCitations([...bull.citations, ...counter.citations]).slice(0, 6);

      return {
        bull,
        counter,
        contradictionScore: score,
        evidenceWeight: weight,
        confidenceImpact,
        sharedThemes,
        citations
      };
    })
  );
}

function disagreementFromPair(pair: DebatePair): AnalysisReport["disagreements"][number] {
  const themes = pair.sharedThemes.length > 0 ? pair.sharedThemes.join(", ") : "general outlook";
  const issue = `Debate conflict on ${themes.replaceAll("_", " ")}`;
  return {
    id: stableClaimId(issue, `${pair.bull.claim}\n${pair.counter.claim}`, pair.citations),
    issue,
    bullPosition: pair.bull.claim,
    bearOrRiskPosition: pair.counter.claim,
    refereeAssessment: [
      `Contradiction score ${Math.round(pair.contradictionScore * 100)}%.`,
      `Evidence weight ${Math.round(pair.evidenceWeight * 100)}%.`,
      pair.contradictionScore >= 0.6
        ? "The claims point in opposing directions on overlapping evidence themes and should not be netted into a single unsupported view."
        : "The claims are directionally different but can coexist if their cited contexts are distinct."
    ].join(" "),
    contradictionScore: pair.contradictionScore,
    evidenceWeight: pair.evidenceWeight,
    confidenceImpact: pair.confidenceImpact,
    citations: pair.citations
  };
}

function agentScore(agent: DebateAgentScore["agent"], claims: AgentClaim[]): DebateAgentScore {
  const citationCoverage = claims.length === 0 ? 0 : claims.filter((claim) => claim.citations.length > 0).length / claims.length;
  return {
    agent,
    claimCount: claims.length,
    averageConfidence: round(average(claims.map((claim) => claim.confidence))),
    evidenceWeight: round(average(claims.map(evidenceWeight))),
    calibratedConfidence: round(average(claims.map(calibratedClaimConfidence))),
    citationCoverage: round(citationCoverage)
  };
}

function calculateConsensus(agentScores: DebateAgentScore[], contradiction: number) {
  const availableAgents = agentScores.filter((score) => score.claimCount > 0);
  if (availableAgents.length === 0) return 0;
  const calibrated = availableAgents.map((score) => score.calibratedConfidence);
  const spread = Math.max(...calibrated) - Math.min(...calibrated);
  const evidenceAgreement = average(availableAgents.map((score) => score.evidenceWeight));
  return clamp(evidenceAgreement * 0.45 + (1 - spread) * 0.25 + (1 - contradiction) * 0.3, 0, 1);
}

function debateFindings({
  contradictionScore,
  evidenceWeight,
  consensusScore,
  confidenceCalibration,
  pairs
}: {
  contradictionScore: number;
  evidenceWeight: number;
  consensusScore: number;
  confidenceCalibration: number;
  pairs: DebatePair[];
}) {
  const findings = [
    `Average contradiction score is ${Math.round(contradictionScore * 100)}%.`,
    `Average evidence weight is ${Math.round(evidenceWeight * 100)}%.`,
    `Consensus score is ${Math.round(consensusScore * 100)}%.`,
    `Calibrated confidence signal is ${Math.round(confidenceCalibration * 100)}%.`
  ];

  const severePairs = pairs.filter((pair) => pair.contradictionScore >= 0.6);
  if (severePairs.length > 0) {
    findings.push(`${severePairs.length} high-contradiction claim pair(s) require analyst review.`);
  }
  if (evidenceWeight < 0.45) {
    findings.push("Evidence weighting is weak, so agent confidence should be discounted.");
  }
  if (consensusScore < 0.45) {
    findings.push("Consensus is low because agent confidence or evidence signals diverge.");
  }

  return findings;
}

function themesForClaim(claim: AgentClaim) {
  const text = `${claim.title} ${claim.claim} ${claim.citations.map((citation) => citation.excerpt).join(" ")}`;
  return themePatterns.filter((item) => item.pattern.test(text)).map((item) => item.theme);
}

function directionalScore(text: string) {
  const normalized = text.toLowerCase();
  const positive = positiveTerms.reduce((sum, term) => sum + occurrences(normalized, term), 0);
  const negative = negativeTerms.reduce((sum, term) => sum + occurrences(normalized, term), 0);
  if (positive === negative) return 0;
  return positive > negative ? 1 : -1;
}

function occurrences(text: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(text.matchAll(new RegExp(escaped, "g"))).length;
}

function citationOverlap(a: AgentClaim, b: AgentClaim) {
  const aIds = new Set(a.citations.map((citation) => citation.id));
  return b.citations.filter((citation) => aIds.has(citation.id)).length;
}

function intersect(a: string[], b: string[]) {
  const bSet = new Set(b);
  return Array.from(new Set(a.filter((item) => bSet.has(item))));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
