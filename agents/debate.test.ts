import { describe, expect, it } from "vitest";
import {
  analyzeDebate,
  calibratedClaimConfidence,
  contradictionScore,
  evidenceWeight
} from "@/agents/debate";
import type { AgentClaim, EvidenceCitation } from "@/lib/types";

describe("multi-agent debate intelligence", () => {
  it("scores contradictions higher when opposing agents address the same financial theme", () => {
    const bull = claim("bull", "Revenue growth improved as enterprise demand increased.", "Revenue grew 18% on enterprise demand.");
    const bear = claim("bear", "Revenue growth is under pressure from weaker customer demand.", "Demand softened and revenue growth slowed.");
    const unrelatedRisk = claim("risk", "Regulatory investigation could increase compliance costs.", "A regulatory investigation remains ongoing.");

    expect(contradictionScore(bull, bear)).toBeGreaterThan(contradictionScore(bull, unrelatedRisk));
  });

  it("weights evidence using citation relevance, depth, and excerpt coverage", () => {
    const strong = claim("bull", "Gross margin improved.", "Gross margin improved due to lower infrastructure costs.", 0.88);
    const weak = {
      ...claim("bull", "Gross margin improved.", "Margin.", 0.2),
      citations: [citation("weak", "Margin.", 0.2)]
    };

    expect(evidenceWeight(strong)).toBeGreaterThan(evidenceWeight(weak));
  });

  it("calibrates confidence downward when citations are weak or caveated", () => {
    const caveated = {
      ...claim("risk", "Liquidity risk may increase.", "Liquidity risk may increase if refinancing fails.", 0.35, 0.9),
      caveats: ["Evidence is directional but not quantified.", "No maturity table was retrieved."]
    };

    expect(calibratedClaimConfidence(caveated)).toBeLessThan(caveated.confidence);
  });

  it("produces consensus and disagreement diagnostics for referee synthesis", () => {
    const bull = claim("bull", "Free cash flow improved and was positive.", "Free cash flow was positive in the quarter.", 0.82, 0.72);
    const bear = claim("bear", "Free cash flow quality is under pressure from higher expenses.", "Expenses increased and margin pressure continued.", 0.78, 0.68);
    const risk = claim("risk", "Debt refinancing risk remains elevated.", "Debt maturities create refinancing risk.", 0.74, 0.66);

    const result = analyzeDebate({ bull: [bull], bear: [bear], risk: [risk] });

    expect(result.assessment.agentScores).toHaveLength(3);
    expect(result.assessment.consensusScore).toBeGreaterThan(0);
    expect(result.assessment.evidenceWeight).toBeGreaterThan(0);
    expect(result.disagreements[0]).toMatchObject({
      contradictionScore: expect.any(Number),
      evidenceWeight: expect.any(Number),
      confidenceImpact: expect.any(Number)
    });
  });
});

function claim(
  polarity: AgentClaim["polarity"],
  text: string,
  excerpt: string,
  relevanceScore = 0.8,
  confidence = 0.7
): AgentClaim {
  return {
    id: `${polarity}-${text}`,
    title: `${polarity} claim`,
    claim: text,
    polarity,
    confidence,
    citations: [citation(`${polarity}-${text}`, excerpt, relevanceScore)],
    caveats: []
  };
}

function citation(id: string, excerpt: string, relevanceScore: number): EvidenceCitation {
  return {
    id,
    documentId: "document",
    documentKind: "earnings_call",
    sourceFile: "source.txt",
    section: "Prepared Remarks",
    page: 1,
    pageEnd: 1,
    excerpt,
    relevanceScore,
    chunkIndex: 0,
    charStart: 0,
    charEnd: excerpt.length
  };
}
