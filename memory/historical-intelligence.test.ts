import { describe, expect, it } from "vitest";
import { buildHistoricalIntelligence } from "@/memory/historical-intelligence";
import type { AgentClaim, AnalysisReport, EvidenceCitation } from "@/lib/types";

describe("historical intelligence and what changed layer", () => {
  it("surfaces recurring risks, guidance pressure, metric deterioration, and recurring narratives", () => {
    const summary = buildHistoricalIntelligence(report());

    expect(summary.priorFilingCount).toBe(2);
    expect(summary.previousGuidance.length).toBeGreaterThan(0);
    expect(summary.previousGuidance.every((metric) => metric.lastSeenDocumentId !== report().document.id)).toBe(true);
    expect(summary.signals.map((signal) => signal.type)).toEqual(
      expect.arrayContaining(["recurring_risk", "guidance_change", "metric_deterioration", "narrative_pattern"])
    );
    expect(summary.signals.every((signal) => signal.citations.length > 0)).toBe(true);
  });

  it("explains when company memory is unavailable", () => {
    const base = report();
    base.companyMemory = undefined;

    const summary = buildHistoricalIntelligence(base);

    expect(summary.signals).toEqual([]);
    expect(summary.limitations).toContain("Company memory is unavailable, so historical intelligence could not compare prior filings.");
  });
});

function report(): AnalysisReport {
  const currentDoc = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const priorDoc = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const riskCitation = citation("risk", currentDoc, "Liquidity and debt refinancing risk remains elevated.");
  const guidanceCitation = citation("guidance", currentDoc, "Management lowered margin guidance due to pricing pressure.");
  const priorGuidanceCitation = citation("prior-guidance", priorDoc, "Prior quarter margin guidance was also reduced.");
  const revenueCitation = citation("revenue", currentDoc, "Revenue declined to $90 million from $100 million.");
  const priorRevenueCitation = citation("prior-revenue", priorDoc, "Revenue was $100 million.");
  const narrativeCitation = citation("narrative", currentDoc, "Management continues to describe demand as resilient.");

  return {
    document: {
      id: currentDoc,
      filename: "acme-q2-2026.txt",
      kind: "earnings_call",
      chunkCount: 4,
      parserDiagnostics: [],
      processedAt: "2026-05-26T00:00:00.000Z"
    },
    executiveSummary: [],
    bullCase: [
      claim("bull-1", "Demand narrative", "Management continues to describe demand as resilient.", "bull", narrativeCitation)
    ],
    bearCase: [],
    riskAnalysis: [
      claim("risk-1", "Liquidity risk", "Liquidity and debt refinancing risk remains elevated.", "risk", riskCitation)
    ],
    keyMetrics: [
      {
        id: "metric-current-revenue",
        label: "Revenue",
        value: "$90 million",
        period: "Q2 2026",
        citations: [revenueCitation],
        verification: {
          status: "verified",
          explanation: "Revenue declined from the prior period."
        }
      },
      {
        id: "metric-current-guidance",
        label: "Margin guidance",
        value: "lowered",
        period: "Q2 2026",
        citations: [guidanceCitation],
        verification: {
          status: "unverified",
          explanation: "Management lowered margin guidance due to pricing pressure."
        }
      }
    ],
    confidence: {
      score: 70,
      label: "Medium",
      drivers: [],
      reductions: []
    },
    citations: [riskCitation, guidanceCitation, priorGuidanceCitation, revenueCitation, priorRevenueCitation, narrativeCitation],
    disagreements: [],
    debateAssessment: {
      contradictionScore: 0.2,
      evidenceWeight: 0.7,
      consensusScore: 0.7,
      confidenceCalibration: 0.7,
      agentScores: [],
      findings: []
    },
    companyMemory: {
      companyId: "company_acme",
      companyName: "Acme",
      filingCount: 3,
      latestDocumentId: currentDoc,
      latestDocumentFilename: "acme-q2-2026.txt",
      lastUpdatedAt: "2026-05-26T00:00:00.000Z",
      pastFilings: [],
      recurringRisks: [
        {
          theme: "debt_refinancing",
          label: "Debt and refinancing risk",
          firstSeenDocumentId: priorDoc,
          lastSeenDocumentId: currentDoc,
          occurrenceCount: 2,
          lastSeenAt: "2026-05-26T00:00:00.000Z",
          citations: [riskCitation]
        }
      ],
      managementClaims: [
        {
          id: "claim-demand",
          claim: "Management continues to describe demand as resilient.",
          polarity: "bull",
          firstSeenDocumentId: priorDoc,
          lastSeenDocumentId: currentDoc,
          occurrenceCount: 2,
          lastSeenAt: "2026-05-26T00:00:00.000Z",
          citations: [narrativeCitation]
        }
      ],
      historicalMetrics: [
        {
          label: "Margin guidance",
          value: "lowered",
          period: "Q2 2026",
          firstSeenDocumentId: currentDoc,
          lastSeenDocumentId: currentDoc,
          occurrenceCount: 1,
          lastSeenAt: "2026-05-26T00:00:00.000Z",
          citations: [guidanceCitation]
        },
        {
          label: "Revenue",
          value: "$100 million",
          period: "Q1 2026",
          firstSeenDocumentId: priorDoc,
          lastSeenDocumentId: priorDoc,
          occurrenceCount: 1,
          lastSeenAt: "2026-04-26T00:00:00.000Z",
          citations: [priorRevenueCitation]
        },
        {
          label: "Margin guidance",
          value: "reduced",
          period: "Q1 2026",
          firstSeenDocumentId: priorDoc,
          lastSeenDocumentId: priorDoc,
          occurrenceCount: 1,
          lastSeenAt: "2026-04-26T00:00:00.000Z",
          citations: [priorGuidanceCitation]
        }
      ]
    },
    finalVerdict: {
      stance: "Mixed",
      rationale: "test",
      citations: [riskCitation]
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
    confidence: 0.72,
    citations: [evidence],
    caveats: []
  };
}

function citation(id: string, documentId: string, excerpt: string): EvidenceCitation {
  return {
    id,
    documentId,
    documentKind: "earnings_call",
    sourceFile: "acme-q2-2026.txt",
    section: "Prepared remarks",
    timestamp: "00:12:00",
    excerpt,
    relevanceScore: 0.84,
    chunkIndex: 1,
    charStart: 0,
    charEnd: excerpt.length
  };
}
