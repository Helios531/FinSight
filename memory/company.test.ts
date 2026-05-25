import { describe, expect, it } from "vitest";
import { buildMemoryWrite, identifyCompany, loadCompanyMemoryForDocument, rememberCompanyAnalysis } from "@/memory/company";
import type { AnalysisReport, EvidenceCitation } from "@/lib/types";
import type { ParsedDocument } from "@/parsers/types";

describe("persistent company memory", () => {
  it("derives stable company identity across period-specific filenames", () => {
    const q1 = document("acme-q1-2026-earnings-call.txt", "q1");
    const q2 = document("acme-q2-2026-earnings-call.txt", "q2");

    expect(identifyCompany(q1)).toMatchObject({
      companyId: identifyCompany(q2).companyId,
      companyName: "Acme"
    });
  });

  it("extracts filings, risks, management claims, and historical metrics from a report", () => {
    const parsed = document("acme-q1-2026-earnings-call.txt", "q1");
    const report = analysisReport(parsed, "2026-01-01T00:00:00.000Z");
    const write = buildMemoryWrite(parsed, report);

    expect(write.filing.filename).toBe(parsed.filename);
    expect(write.risks.map((risk) => risk.theme)).toContain("debt_refinancing");
    expect(write.claims[0].claim).toContain("Revenue growth improved");
    expect(write.metrics[0]).toMatchObject({
      label: "Revenue",
      value: "$118 million"
    });
  });

  it("remembers prior filings and recurring risks across analyses", async () => {
    const q1 = document("acme-q1-2026-earnings-call.txt", "q1");
    const q2 = document("acme-q2-2026-earnings-call.txt", "q2");

    await rememberCompanyAnalysis({
      document: q1,
      report: analysisReport(q1, "2026-01-01T00:00:00.000Z", "$118 million")
    });
    const summary = await rememberCompanyAnalysis({
      document: q2,
      report: analysisReport(q2, "2026-04-01T00:00:00.000Z", "$126 million")
    });

    expect(summary.filingCount).toBeGreaterThanOrEqual(2);
    expect(summary.pastFilings.map((filing) => filing.documentId)).toEqual(
      expect.arrayContaining([q1.id, q2.id])
    );
    expect(summary.recurringRisks.find((risk) => risk.theme === "debt_refinancing")?.occurrenceCount).toBeGreaterThanOrEqual(2);
    expect(summary.historicalMetrics.map((metric) => metric.value)).toEqual(
      expect.arrayContaining(["$118 million", "$126 million"])
    );
  });

  it("loads prior company memory before the next filing is written", async () => {
    const q1 = document("delta-q1-2026-earnings-call.txt", "d1");
    const q2 = document("delta-q2-2026-earnings-call.txt", "d2");

    await rememberCompanyAnalysis({
      document: q1,
      report: analysisReport(q1, "2026-01-01T00:00:00.000Z", "$100 million")
    });

    const prior = await loadCompanyMemoryForDocument(q2);

    expect(prior?.filingCount).toBe(1);
    expect(prior?.pastFilings.map((filing) => filing.documentId)).toEqual([q1.id]);
  });
});

function document(filename: string, suffix: string): ParsedDocument {
  return {
    id: `11111111-1111-4111-8111-${suffix.padEnd(12, "0")}`,
    filename,
    kind: "earnings_call",
    text: "Revenue growth improved. Debt refinancing risk remains disclosed.",
    pages: [{ pageNumber: 1, text: "Revenue growth improved. Debt refinancing risk remains disclosed." }],
    pageCount: 1,
    metadata: {
      parser: "text",
      byteLength: 72,
      diagnostics: []
    }
  };
}

function analysisReport(document: ParsedDocument, processedAt: string, revenue = "$118 million"): AnalysisReport {
  const revenueCitation = citation(document.id, "Prepared Remarks", `Revenue growth improved to ${revenue}.`);
  const riskCitation = citation(document.id, "Risk Factors", "Debt refinancing risk remains disclosed.");

  return {
    document: {
      id: document.id,
      filename: document.filename,
      kind: document.kind,
      chunkCount: 2,
      pageCount: 1,
      parserDiagnostics: [],
      processedAt
    },
    executiveSummary: [],
    bullCase: [
      {
        id: `bull-${document.id}`,
        title: "Revenue growth",
        claim: `Revenue growth improved to ${revenue}.`,
        polarity: "bull",
        confidence: 0.7,
        citations: [revenueCitation],
        caveats: []
      }
    ],
    bearCase: [],
    riskAnalysis: [
      {
        id: `risk-${document.id}`,
        title: "Debt refinancing risk",
        claim: "Debt refinancing risk remains disclosed.",
        polarity: "risk",
        confidence: 0.66,
        citations: [riskCitation],
        caveats: []
      }
    ],
    keyMetrics: [
      {
        id: `revenue-${document.id}`,
        label: "Revenue",
        value: revenue,
        period: "Q1 2026",
        citations: [revenueCitation],
        verification: {
          status: "unverified",
          explanation: "test metric"
        }
      }
    ],
    confidence: {
      score: 70,
      label: "Medium",
      drivers: [],
      reductions: []
    },
    citations: [revenueCitation, riskCitation],
    disagreements: [],
    debateAssessment: {
      contradictionScore: 0.1,
      evidenceWeight: 0.75,
      consensusScore: 0.7,
      confidenceCalibration: 0.68,
      agentScores: [],
      findings: []
    },
    finalVerdict: {
      stance: "Mixed",
      rationale: "test",
      citations: [revenueCitation]
    },
    traces: []
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
    relevanceScore: 0.82,
    chunkIndex: 0,
    charStart: 0,
    charEnd: excerpt.length
  };
}
