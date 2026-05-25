import { describe, expect, it } from "vitest";
import { buildComplianceSummary } from "@/compliance/audit";
import type { AnalysisReport, EvidenceCitation } from "@/lib/types";

describe("audit trail and compliance infrastructure", () => {
  it("creates reproducibility metadata, evidence tracking, audit events, and report versions", () => {
    const report = analysisReport();

    const compliance = buildComplianceSummary(report);

    expect(compliance.auditId).toContain("audit_");
    expect(compliance.reproducibilitySeed).toHaveLength(64);
    expect(compliance.reportChecksum).toHaveLength(64);
    expect(compliance.evidenceRecordCount).toBe(1);
    expect(compliance.auditEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["ingest", "retrieval", "agent_analysis", "report_version"])
    );
    expect(compliance.evidenceTracking[0]).toMatchObject({
      citationId: "citation-1",
      claimIds: expect.arrayContaining(["risk-1"])
    });
    expect(compliance.versions[0]).toMatchObject({
      version: 1,
      checksum: compliance.reportChecksum,
      reproducibilitySeed: compliance.reproducibilitySeed
    });
  });
});

function analysisReport(): AnalysisReport {
  const citation = evidence("citation-1", "Debt refinancing risk remains elevated.");
  return {
    document: {
      id: "66666666-6666-4666-8666-666666666666",
      filename: "audit-filing.txt",
      kind: "sec_filing",
      chunkCount: 2,
      pageCount: 1,
      parserDiagnostics: [],
      processedAt: "2026-05-25T00:00:00.000Z"
    },
    executiveSummary: [],
    bullCase: [],
    bearCase: [],
    riskAnalysis: [
      {
        id: "risk-1",
        title: "Debt risk",
        claim: "Debt refinancing risk remains elevated.",
        polarity: "risk",
        confidence: 0.7,
        citations: [citation],
        caveats: []
      }
    ],
    keyMetrics: [],
    confidence: {
      score: 65,
      label: "Medium",
      drivers: [],
      reductions: []
    },
    citations: [citation],
    disagreements: [],
    debateAssessment: {
      contradictionScore: 0.2,
      evidenceWeight: 0.7,
      consensusScore: 0.6,
      confidenceCalibration: 0.6,
      agentScores: [],
      findings: []
    },
    finalVerdict: {
      stance: "Mixed",
      rationale: "test",
      citations: [citation]
    },
    traces: []
  };
}

function evidence(id: string, excerpt: string): EvidenceCitation {
  return {
    id,
    documentId: "66666666-6666-4666-8666-666666666666",
    documentKind: "sec_filing",
    sourceFile: "audit.txt",
    section: "Risk Factors",
    page: 2,
    pageEnd: 2,
    excerpt,
    relevanceScore: 0.8,
    chunkIndex: 1,
    charStart: 10,
    charEnd: 10 + excerpt.length
  };
}
