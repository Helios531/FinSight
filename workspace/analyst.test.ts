import { describe, expect, it } from "vitest";
import { buildAnalystWorkspace } from "@/workspace/analyst";
import type { AnalysisReport, EvidenceCitation } from "@/lib/types";

describe("collaborative analyst workspace", () => {
  it("creates notes, annotations, saved findings, collaborators, and exports", () => {
    const report = analysisReport();

    const workspace = buildAnalystWorkspace(report);

    expect(workspace.workspaceId).toContain("workspace_");
    expect(workspace.analystNotes.length).toBeGreaterThan(0);
    expect(workspace.annotations.map((annotation) => annotation.targetType)).toEqual(
      expect.arrayContaining(["claim", "disagreement"])
    );
    expect(workspace.savedFindings[0]).toMatchObject({
      title: "Mixed referee verdict",
      owner: "Lead Analyst"
    });
    expect(workspace.collaborators).toEqual(expect.arrayContaining(["Lead Analyst", "Risk Reviewer"]));
    expect(workspace.exports.map((item) => item.format)).toEqual(expect.arrayContaining(["markdown", "json"]));
    expect(workspace.exports.every((item) => item.checksum.length === 64)).toBe(true);
  });
});

function analysisReport(): AnalysisReport {
  const citation = evidence("risk citation", "Debt refinancing risk remains elevated.");
  return {
    document: {
      id: "55555555-5555-4555-8555-555555555555",
      filename: "sample-filing.txt",
      kind: "sec_filing",
      chunkCount: 2,
      pageCount: 1,
      parserDiagnostics: [],
      processedAt: "2026-05-25T00:00:00.000Z"
    },
    executiveSummary: [
      {
        id: "summary-1",
        title: "Referee verdict",
        claim: "Mixed: risk offsets upside.",
        polarity: "neutral",
        confidence: 0.66,
        citations: [citation],
        caveats: []
      }
    ],
    bullCase: [],
    bearCase: [],
    riskAnalysis: [
      {
        id: "risk-1",
        title: "Debt risk",
        claim: "Debt refinancing risk remains elevated.",
        polarity: "risk",
        confidence: 0.72,
        citations: [citation],
        caveats: []
      }
    ],
    keyMetrics: [],
    confidence: {
      score: 66,
      label: "Medium",
      drivers: [],
      reductions: []
    },
    citations: [citation],
    disagreements: [
      {
        id: "disagreement-1",
        issue: "Upside versus refinancing risk",
        bullPosition: "Revenue improved.",
        bearOrRiskPosition: "Debt refinancing risk remains elevated.",
        refereeAssessment: "Both are cited.",
        contradictionScore: 0.42,
        evidenceWeight: 0.7,
        confidenceImpact: 0.2,
        citations: [citation]
      }
    ],
    debateAssessment: {
      contradictionScore: 0.42,
      evidenceWeight: 0.7,
      consensusScore: 0.58,
      confidenceCalibration: 0.64,
      agentScores: [],
      findings: []
    },
    finalVerdict: {
      stance: "Mixed",
      rationale: "Risk offsets upside.",
      citations: [citation]
    },
    traces: []
  };
}

function evidence(id: string, excerpt: string): EvidenceCitation {
  return {
    id,
    documentId: "55555555-5555-4555-8555-555555555555",
    documentKind: "sec_filing",
    sourceFile: "sample.txt",
    section: "Risk Factors",
    page: 1,
    pageEnd: 1,
    excerpt,
    relevanceScore: 0.8,
    chunkIndex: 0,
    charStart: 0,
    charEnd: excerpt.length
  };
}
