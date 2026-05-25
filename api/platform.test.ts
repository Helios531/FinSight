import { describe, expect, it } from "vitest";
import { platformManifest, reportResourceEnvelope } from "@/api/platform";
import type { AnalysisReport } from "@/lib/types";

describe("Financial Sight API platform", () => {
  it("describes integration capabilities and versioned endpoints", () => {
    const manifest = platformManifest();

    expect(manifest.version).toBe("v1");
    expect(manifest.capabilities).toEqual(
      expect.arrayContaining(["document_analysis", "portfolio_intelligence", "audit_compliance"])
    );
    expect(manifest.endpoints.map((endpoint) => endpoint.path)).toEqual(
      expect.arrayContaining(["/api/v1/health", "/api/v1/analyze", "/api/v1/reports"])
    );
  });

  it("normalizes reports into integration resource envelopes", () => {
    const envelope = reportResourceEnvelope(report());

    expect(envelope.apiVersion).toBe("v1");
    expect(envelope.resources.companyMemory).toMatchObject({
      companyId: "company_test",
      filingCount: 2
    });
    expect(envelope.resources.portfolio).toMatchObject({
      companyCount: 1
    });
    expect(envelope.resources.compliance).toMatchObject({
      auditId: "audit_test",
      evidenceRecordCount: 1
    });
    expect(envelope.links.analyze).toBe("/api/v1/analyze");
  });
});

function report(): AnalysisReport {
  return {
    document: {
      id: "77777777-7777-4777-8777-777777777777",
      filename: "api-report.txt",
      kind: "sec_filing",
      chunkCount: 1,
      processedAt: "2026-05-25T00:00:00.000Z",
      parserDiagnostics: []
    },
    executiveSummary: [],
    bullCase: [],
    bearCase: [],
    riskAnalysis: [],
    keyMetrics: [],
    confidence: {
      score: 70,
      label: "Medium",
      drivers: [],
      reductions: []
    },
    citations: [],
    disagreements: [],
    debateAssessment: {
      contradictionScore: 0,
      evidenceWeight: 0.7,
      consensusScore: 0.7,
      confidenceCalibration: 0.7,
      agentScores: [],
      findings: []
    },
    companyMemory: {
      companyId: "company_test",
      companyName: "Test Co",
      filingCount: 2,
      latestDocumentId: "77777777-7777-4777-8777-777777777777",
      latestDocumentFilename: "api-report.txt",
      lastUpdatedAt: "2026-05-25T00:00:00.000Z",
      pastFilings: [],
      recurringRisks: [],
      managementClaims: [],
      historicalMetrics: []
    },
    portfolio: {
      portfolioId: "portfolio_default",
      companyCount: 1,
      filingCount: 2,
      alertCount: 0,
      highSeverityAlertCount: 0,
      sectorExposure: [],
      overlappingRisks: [],
      concentrationSignals: [],
      companies: [],
      updatedAt: "2026-05-25T00:00:00.000Z"
    },
    compliance: {
      auditId: "audit_test",
      documentId: "77777777-7777-4777-8777-777777777777",
      reproducibilitySeed: "seed",
      reportChecksum: "checksum",
      evidenceRecordCount: 1,
      auditEvents: [],
      evidenceTracking: [],
      versions: [],
      createdAt: "2026-05-25T00:00:00.000Z"
    },
    finalVerdict: {
      stance: "Mixed",
      rationale: "test",
      citations: []
    },
    traces: []
  };
}
