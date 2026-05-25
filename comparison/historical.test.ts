import { describe, expect, it } from "vitest";
import { compareHistoricalFilings, parseHistoricalPeriod } from "@/comparison/historical";
import type { AnalysisReport, EvidenceCitation } from "@/lib/types";
import type { NormalizedFinancialMetric } from "@/verification/financial-extraction";

describe("historical filing comparison engine", () => {
  it("classifies quarter versus quarter and computes metric deltas", () => {
    const prior = snapshot("prior", "Q1 2025", [
      metric("Revenue", "revenue", "income_statement", "$100 million", 100_000_000),
      metric("Gross margin", "gross_margin", "income_statement", "40%", 40, "percent")
    ]);
    const current = snapshot("current", "Q1 2026", [
      metric("Revenue", "revenue", "income_statement", "$118 million", 118_000_000),
      metric("Gross margin", "gross_margin", "income_statement", "42%", 42, "percent")
    ]);

    const result = compareHistoricalFilings({ current, prior });

    expect(result.comparisonType).toBe("year_vs_year");
    expect(result.metricDeltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          normalizedLabel: "revenue",
          absoluteChange: 18_000_000,
          percentChange: 0.18,
          direction: "improved"
        }),
        expect.objectContaining({
          normalizedLabel: "gross_margin",
          basisPointChange: 200
        })
      ])
    );
  });

  it("detects guidance changes", () => {
    const prior = snapshot("prior", "Q2 2026", [
      metric("Guidance", "guidance", "guidance", "$500 million", 500_000_000)
    ]);
    const current = snapshot("current", "Q3 2026", [
      metric("Guidance", "guidance", "guidance", "$550 million", 550_000_000)
    ]);

    const result = compareHistoricalFilings({ current, prior });

    expect(result.comparisonType).toBe("quarter_vs_quarter");
    expect(result.guidanceChanges[0]).toMatchObject({
      direction: "raised",
      absoluteChange: 50_000_000,
      percentChange: 0.1
    });
  });

  it("tracks risk factor and sentiment drift", () => {
    const prior = snapshot("prior", "FY 2025", [], {
      bull: 0.7,
      bear: 0.2,
      risk: [{ term: "debt", confidence: 0.3 }]
    });
    const current = snapshot("current", "FY 2026", [], {
      bull: 0.4,
      bear: 0.5,
      risk: [
        { term: "debt refinancing", confidence: 0.6 },
        { term: "customer concentration", confidence: 0.5 }
      ]
    });

    const result = compareHistoricalFilings({ current, prior });

    expect(result.riskFactorDrift.addedTerms).toEqual(expect.arrayContaining(["refinancing", "concentration"]));
    expect(result.riskFactorDrift.severityChange).toBe("increased");
    expect(result.sentimentDrift.direction).toBe("more_cautious");
  });

  it("detects narrative tone shifts, new risks, removed risks, and intensified wording", () => {
    const prior = snapshot("prior", "FY 2025", [], {
      bull: 0.6,
      bear: 0.2,
      risk: [
        { term: "litigation exposure was limited and supply chain delays were manageable", confidence: 0.3 },
        { term: "demand remained stable", confidence: 0.2 }
      ]
    });
    const current = snapshot("current", "FY 2026", [], {
      bull: 0.4,
      bear: 0.5,
      risk: [
        {
          term: "significant supply chain disruption materially increased and created elevated component constraints",
          confidence: 0.7
        },
        { term: "new regulatory investigation could increase compliance cost", confidence: 0.6 }
      ]
    });

    const result = compareHistoricalFilings({ current, prior });

    expect(result.narrativeChanges.toneShift.direction).toBe("more_cautious");
    expect(result.narrativeChanges.newRisks.map((risk) => risk.theme)).toContain("regulatory");
    expect(result.narrativeChanges.removedRisks.map((risk) => risk.theme)).toContain("litigation");
    expect(result.narrativeChanges.wordingChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          theme: "supply_chain",
          changeType: "intensified"
        })
      ])
    );
    expect(result.narrativeChanges.summary[0].citations.length).toBeGreaterThan(0);
  });

  it("flags hidden deterioration when constructive tone conflicts with deteriorating metrics", () => {
    const prior = snapshot(
      "prior",
      "Q4 2025",
      [metric("Operating margin", "operating_margin", "income_statement", "24%", 24, "percent")],
      {
        bull: 0.4,
        bear: 0.2,
        risk: [{ term: "moderate margin pressure", confidence: 0.2 }],
        bullClaim: "Management described stable demand."
      }
    );
    const current = snapshot(
      "current",
      "Q4 2026",
      [metric("Operating margin", "operating_margin", "income_statement", "18%", 18, "percent")],
      {
        bull: 0.8,
        bear: 0.1,
        risk: [{ term: "limited margin pressure", confidence: 0.2 }],
        bullClaim: "Management highlighted growth and improved profitability despite margin pressure and adjusted costs."
      }
    );

    const result = compareHistoricalFilings({ current, prior });

    expect(result.narrativeChanges.hiddenDeterioration).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: "Constructive tone conflicts with deteriorating metrics"
        }),
        expect.objectContaining({
          issue: "Offset or adjustment language increased scrutiny need"
        })
      ])
    );
  });
});

function snapshot(
  id: string,
  periodLabel: string,
  metrics: NormalizedFinancialMetric[],
  sentiment: {
    bull?: number;
    bear?: number;
    risk?: Array<{ term: string; confidence: number }>;
    bullClaim?: string;
    bearClaim?: string;
  } = {}
) {
  return {
    id,
    period: parseHistoricalPeriod(periodLabel),
    report: report(id, periodLabel, sentiment),
    structuredMetrics: metrics
  };
}

function metric(
  label: string,
  normalizedLabel: string,
  statementType: NormalizedFinancialMetric["statementType"],
  rawValue: string,
  numericValue: number,
  unit: NormalizedFinancialMetric["unit"] = "usd"
): NormalizedFinancialMetric {
  return {
    id: `${normalizedLabel}-${rawValue}`,
    label,
    normalizedLabel,
    statementType,
    rawValue,
    numericValue,
    unit,
    scale: unit === "usd" ? 1_000_000 : 1,
    citations: [citation(`${normalizedLabel}-${rawValue}`)],
    verification: {
      status: "unverified",
      explanation: "test metric"
    }
  };
}

function report(
  id: string,
  periodLabel: string,
  sentiment: {
    bull?: number;
    bear?: number;
    risk?: Array<{ term: string; confidence: number }>;
    bullClaim?: string;
    bearClaim?: string;
  }
): AnalysisReport {
  return {
    document: {
      id,
      filename: `${id}.txt`,
      kind: "sec_filing",
      chunkCount: 1,
      parserDiagnostics: [],
      processedAt: "2026-01-01T00:00:00.000Z"
    },
    executiveSummary: [],
    bullCase: [
      {
        id: `${id}-bull`,
        title: "Bull",
        claim: sentiment.bullClaim ?? "Revenue evidence improved.",
        polarity: "bull",
        confidence: sentiment.bull ?? 0.5,
        citations: [citation(`${id}-bull-citation`)],
        caveats: []
      }
    ],
    bearCase: [
      {
        id: `${id}-bear`,
        title: "Bear",
        claim: sentiment.bearClaim ?? "Expense pressure exists.",
        polarity: "bear",
        confidence: sentiment.bear ?? 0.3,
        citations: [citation(`${id}-bear-citation`)],
        caveats: []
      }
    ],
    riskAnalysis: (sentiment.risk ?? [{ term: "debt", confidence: 0.3 }]).map((risk, index) => ({
      id: `${id}-risk-${index}`,
      title: "Risk",
      claim: `${risk.term} risk disclosed in ${periodLabel}.`,
      polarity: "risk",
      confidence: risk.confidence,
      citations: [citation(`${id}-risk-citation-${index}`)],
      caveats: []
    })),
    keyMetrics: [],
    confidence: {
      score: 70,
      label: "Medium",
      drivers: [],
      reductions: []
    },
    citations: [],
    disagreements: [],
    finalVerdict: {
      stance: "Mixed",
      rationale: "test",
      citations: []
    },
    traces: []
  };
}

function citation(id: string): EvidenceCitation {
  return {
    id,
    documentId: "document",
    documentKind: "sec_filing",
    sourceFile: "source.txt",
    section: "Test",
    page: 1,
    pageEnd: 1,
    excerpt: "test excerpt",
    relevanceScore: 0.8,
    chunkIndex: 0,
    charStart: 0,
    charEnd: 12
  };
}
