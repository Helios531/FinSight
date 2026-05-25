import { describe, expect, it } from "vitest";
import { buildPredictiveRiskSummary } from "@/scoring/predictive-risk";
import type { AgentClaim, AnalysisReport, EvidenceCitation } from "@/lib/types";

describe("predictive financial risk signal engine", () => {
  it("detects deteriorating fundamentals, liquidity stress, fraud indicators, and narrative inconsistency", () => {
    const summary = buildPredictiveRiskSummary(report());

    expect(summary.signals.map((signal) => signal.type)).toEqual(
      expect.arrayContaining([
        "deteriorating_fundamentals",
        "fraud_indicator",
        "liquidity_stress",
        "narrative_inconsistency"
      ])
    );
    expect(summary.overallRisk).toBe("high");
    expect(summary.score).toBeGreaterThanOrEqual(70);
    expect(summary.signals.every((signal) => signal.citations.length > 0)).toBe(true);
  });

  it("returns an explicit low-signal result when deterministic thresholds are not crossed", () => {
    const base = report();
    base.bearCase = [];
    base.riskAnalysis = [];
    base.keyMetrics = [];
    base.disagreements = [];
    base.debateAssessment.contradictionScore = 0;
    base.debateAssessment.findings = [];

    const summary = buildPredictiveRiskSummary(base);

    expect(summary.overallRisk).toBe("info");
    expect(summary.signals).toEqual([]);
    expect(summary.limitations).toContain("No advanced risk signal crossed the deterministic threshold.");
  });
});

function report(): AnalysisReport {
  const liquidity = citation("liq", "Debt refinancing and covenant maturity pressure could constrain liquidity and working capital.");
  const accounting = citation("acct", "Management disclosed a material weakness in internal control and accounting estimates.");
  const margin = citation("margin", "Revenue declined while margin pressure and cash burn increased despite demand commentary.");
  const bull = citation("bull", "Management described demand as resilient and highlighted revenue growth opportunities.");

  return {
    document: {
      id: "99999999-9999-4999-8999-999999999999",
      filename: "risk-q2-2026.txt",
      kind: "sec_filing",
      chunkCount: 4,
      parserDiagnostics: [],
      processedAt: "2026-05-26T00:00:00.000Z"
    },
    executiveSummary: [],
    bullCase: [
      claim("bull-1", "Demand narrative", "Management described demand as resilient and revenue growth opportunities as intact.", "bull", bull)
    ],
    bearCase: [
      claim("bear-1", "Margin deterioration", "Revenue declined and margin pressure increased with continued cash burn.", "bear", margin)
    ],
    riskAnalysis: [
      claim("risk-1", "Liquidity stress", "Debt refinancing, covenant maturity, liquidity, and working capital pressure remain material.", "risk", liquidity),
      claim("risk-2", "Accounting controls", "A material weakness in internal control and accounting estimates raises reporting quality risk.", "risk", accounting)
    ],
    keyMetrics: [
      {
        id: "metric-1",
        label: "Revenue decline",
        value: "$90 million",
        period: "Q2 2026",
        citations: [margin],
        verification: {
          status: "verified",
          explanation: "Revenue decline verified against cited current and prior values."
        }
      },
      {
        id: "metric-2",
        label: "Margin pressure",
        value: "negative 400 bps",
        period: "Q2 2026",
        citations: [margin],
        verification: {
          status: "verified",
          explanation: "Margin pressure was verified from cited margin values."
        }
      }
    ],
    confidence: {
      score: 61,
      label: "Medium",
      drivers: [],
      reductions: []
    },
    citations: [liquidity, accounting, margin, bull],
    disagreements: [
      {
        id: "disagreement-1",
        issue: "Optimistic demand narrative versus deteriorating margins",
        bullPosition: "Demand is resilient.",
        bearOrRiskPosition: "Revenue declined and margins deteriorated.",
        refereeAssessment: "The claims conflict on overlapping operating performance evidence.",
        contradictionScore: 0.68,
        evidenceWeight: 0.78,
        confidenceImpact: 0.42,
        citations: [bull, margin]
      }
    ],
    debateAssessment: {
      contradictionScore: 0.68,
      evidenceWeight: 0.78,
      consensusScore: 0.41,
      confidenceCalibration: 0.62,
      agentScores: [],
      findings: ["1 high-contradiction claim pair requires analyst review."]
    },
    finalVerdict: {
      stance: "Mixed",
      rationale: "Operating deterioration offsets the constructive demand narrative.",
      citations: [bull, margin]
    },
    traces: []
  };
}

function claim(id: string, title: string, text: string, polarity: AgentClaim["polarity"], evidence: EvidenceCitation): AgentClaim {
  return {
    id,
    title,
    claim: text,
    polarity,
    confidence: 0.76,
    citations: [evidence],
    caveats: []
  };
}

function citation(id: string, excerpt: string): EvidenceCitation {
  return {
    id,
    documentId: "99999999-9999-4999-8999-999999999999",
    documentKind: "sec_filing",
    sourceFile: "risk-q2-2026.txt",
    section: "MD&A",
    page: 12,
    excerpt,
    relevanceScore: 0.86,
    chunkIndex: 1,
    charStart: 0,
    charEnd: excerpt.length
  };
}
