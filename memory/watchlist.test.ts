import { describe, expect, it } from "vitest";
import { updateWatchlistForAnalysis, buildWatchlistAlerts } from "@/memory/watchlist";
import type { AnalysisReport, CompanyMemorySummary, EvidenceCitation } from "@/lib/types";
import type { ParsedDocument } from "@/parsers/types";

describe("company watchlists and alerting", () => {
  it("creates filing, earnings, risk, and confidence alerts from analysis state", () => {
    const parsed = document("vertex-q2-2026-earnings-call.txt", "q2");
    const report = analysisReport(parsed, 42, 0.68);
    const memory = memorySummary(parsed, {
      filingCount: 2,
      riskOccurrenceCount: 1
    });

    const alerts = buildWatchlistAlerts({ document: parsed, report, memory });

    expect(alerts.map((alert) => alert.category)).toEqual(
      expect.arrayContaining(["filing", "earnings", "risk_change", "confidence"])
    );
    expect(alerts.find((alert) => alert.category === "risk_change")).toMatchObject({
      severity: "high",
      title: "New risk tracked: Debt and refinancing risk"
    });
  });

  it("marks recurring risk changes as medium severity", () => {
    const parsed = document("vertex-q3-2026-earnings-call.txt", "q3");
    const report = analysisReport(parsed, 72, 0.2);
    const memory = memorySummary(parsed, {
      filingCount: 3,
      riskOccurrenceCount: 3
    });

    const alerts = buildWatchlistAlerts({ document: parsed, report, memory });
    const riskAlert = alerts.find((alert) => alert.category === "risk_change");

    expect(riskAlert).toMatchObject({
      severity: "medium",
      title: "Recurring risk updated: Debt and refinancing risk"
    });
  });

  it("persists in-process watchlist history and deduplicates alerts across repeated analyses", async () => {
    const first = document("zenith-q1-2026-earnings-call.txt", "q1");
    const second = document("zenith-q2-2026-earnings-call.txt", "q2");

    const firstSummary = await updateWatchlistForAnalysis({
      document: first,
      report: analysisReport(first, 68, 0.15),
      memory: memorySummary(first, { filingCount: 1, riskOccurrenceCount: 1 })
    });
    const secondSummary = await updateWatchlistForAnalysis({
      document: second,
      report: analysisReport(second, 68, 0.15),
      memory: memorySummary(second, { filingCount: 2, riskOccurrenceCount: 2 })
    });

    expect(firstSummary.trackedCompanyCount).toBeGreaterThanOrEqual(1);
    expect(secondSummary.alertCount).toBeGreaterThan(firstSummary.alertCount);
    expect(new Set(secondSummary.alerts.map((alert) => alert.id)).size).toBe(secondSummary.alerts.length);
  });
});

function document(filename: string, suffix: string): ParsedDocument {
  return {
    id: `33333333-3333-4333-8333-${suffix.padEnd(12, "0")}`,
    filename,
    kind: "earnings_call",
    text: "Revenue improved. Debt refinancing risk remains elevated.",
    pages: [{ pageNumber: 1, text: "Revenue improved. Debt refinancing risk remains elevated." }],
    pageCount: 1,
    metadata: {
      parser: "text",
      byteLength: 56,
      diagnostics: []
    }
  };
}

function analysisReport(document: ParsedDocument, confidence: number, contradiction: number): AnalysisReport {
  const metricCitation = citation(document.id, "Prepared Remarks", "Revenue improved to $150 million.");
  const riskCitation = citation(document.id, "Risk Factors", "Debt refinancing risk remains elevated.");

  return {
    document: {
      id: document.id,
      filename: document.filename,
      kind: document.kind,
      chunkCount: 2,
      pageCount: 1,
      parserDiagnostics: [],
      processedAt: `2026-0${document.id.includes("q1") ? "1" : "2"}-01T00:00:00.000Z`
    },
    executiveSummary: [],
    bullCase: [],
    bearCase: [],
    riskAnalysis: [
      {
        id: `risk-${document.id}`,
        title: "Debt refinancing risk",
        claim: "Debt refinancing risk remains elevated.",
        polarity: "risk",
        confidence: 0.7,
        citations: [riskCitation],
        caveats: []
      }
    ],
    keyMetrics: [
      {
        id: `revenue-${document.id}`,
        label: "Revenue",
        value: "$150 million",
        period: "Q2 2026",
        citations: [metricCitation],
        verification: {
          status: "unverified",
          explanation: "test metric"
        }
      }
    ],
    confidence: {
      score: confidence,
      label: confidence >= 75 ? "High" : confidence >= 50 ? "Medium" : "Low",
      drivers: [],
      reductions: []
    },
    citations: [metricCitation, riskCitation],
    disagreements: [
      {
        id: `disagreement-${document.id}`,
        issue: "Debt refinancing risk",
        bullPosition: "Revenue improved.",
        bearOrRiskPosition: "Debt refinancing risk remains elevated.",
        refereeAssessment: "Risk requires review.",
        contradictionScore: contradiction,
        evidenceWeight: 0.75,
        confidenceImpact: 0.25,
        citations: [riskCitation]
      }
    ],
    debateAssessment: {
      contradictionScore: contradiction,
      evidenceWeight: 0.75,
      consensusScore: 0.55,
      confidenceCalibration: 0.58,
      agentScores: [],
      findings: []
    },
    finalVerdict: {
      stance: "Mixed",
      rationale: "test",
      citations: [metricCitation]
    },
    traces: []
  };
}

function memorySummary(
  document: ParsedDocument,
  options: { filingCount: number; riskOccurrenceCount: number }
): CompanyMemorySummary {
  const riskCitation = citation(document.id, "Risk Factors", "Debt refinancing risk remains elevated.");

  return {
    companyId: `company_${document.filename.split("-")[0]}`,
    companyName: document.filename.split("-")[0],
    filingCount: options.filingCount,
    latestDocumentId: document.id,
    latestDocumentFilename: document.filename,
    lastUpdatedAt: "2026-02-01T00:00:00.000Z",
    pastFilings: [
      {
        documentId: document.id,
        filename: document.filename,
        kind: document.kind,
        processedAt: "2026-02-01T00:00:00.000Z"
      }
    ],
    recurringRisks: [
      {
        theme: "debt_refinancing",
        label: "Debt and refinancing risk",
        firstSeenDocumentId: document.id,
        lastSeenDocumentId: document.id,
        occurrenceCount: options.riskOccurrenceCount,
        lastSeenAt: "2026-02-01T00:00:00.000Z",
        citations: [riskCitation]
      }
    ],
    managementClaims: [],
    historicalMetrics: []
  };
}

function citation(documentId: string, section: string, excerpt: string): EvidenceCitation {
  return {
    id: `${documentId}-${section}`,
    documentId,
    documentKind: "earnings_call",
    sourceFile: "source.txt",
    section,
    page: 1,
    pageEnd: 1,
    excerpt,
    relevanceScore: 0.8,
    chunkIndex: 0,
    charStart: 0,
    charEnd: excerpt.length
  };
}
