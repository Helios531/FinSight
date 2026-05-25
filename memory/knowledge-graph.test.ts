import { describe, expect, it } from "vitest";
import { buildKnowledgeGraph } from "@/memory/knowledge-graph";
import type { AnalysisReport, EvidenceCitation } from "@/lib/types";

describe("financial knowledge graph infrastructure", () => {
  it("builds company, sector, risk, executive, supplier, product, and macro nodes", () => {
    const graph = buildKnowledgeGraph(report());

    expect(graph.nodes.map((node) => node.type)).toEqual(
      expect.arrayContaining(["company", "sector", "risk", "executive", "supplier", "product", "macro_factor"])
    );
    expect(graph.nodes.map((node) => node.label)).toEqual(
      expect.arrayContaining(["Acme Analytics", "Jane Smith", "MegaSupply", "InsightCloud"])
    );
  });

  it("links companies to risks, sectors, executives, suppliers, products, competitors, and macro exposure", () => {
    const graph = buildKnowledgeGraph(report());

    expect(graph.edges.map((edge) => edge.type)).toEqual(
      expect.arrayContaining([
        "operates_in",
        "exposed_to",
        "managed_by",
        "supplies",
        "mentions",
        "competes_with",
        "linked_to_macro"
      ])
    );
    expect(graph.edgeCount).toBeGreaterThan(5);
  });
});

function report(): AnalysisReport {
  const citation = evidence("citation-1", "CEO Jane Smith said supplier MegaSupply supports product InsightCloud while debt refinancing risk remains elevated.");

  return {
    document: {
      id: "88888888-8888-4888-8888-888888888888",
      filename: "acme-q2-2026.txt",
      kind: "earnings_call",
      chunkCount: 1,
      parserDiagnostics: [],
      processedAt: "2026-05-26T00:00:00.000Z"
    },
    executiveSummary: [
      {
        id: "summary-1",
        title: "CEO commentary",
        claim: "CEO Jane Smith said supplier MegaSupply supports product InsightCloud.",
        polarity: "neutral",
        confidence: 0.7,
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
        confidence: 0.7,
        citations: [citation],
        caveats: []
      }
    ],
    keyMetrics: [],
    confidence: {
      score: 70,
      label: "Medium",
      drivers: [],
      reductions: []
    },
    citations: [citation],
    disagreements: [],
    debateAssessment: {
      contradictionScore: 0.1,
      evidenceWeight: 0.7,
      consensusScore: 0.7,
      confidenceCalibration: 0.7,
      agentScores: [],
      findings: []
    },
    companyMemory: {
      companyId: "company_acme",
      companyName: "Acme Analytics",
      filingCount: 2,
      latestDocumentId: "88888888-8888-4888-8888-888888888888",
      latestDocumentFilename: "acme-q2-2026.txt",
      lastUpdatedAt: "2026-05-26T00:00:00.000Z",
      pastFilings: [],
      recurringRisks: [
        {
          theme: "debt_refinancing",
          label: "Debt and refinancing risk",
          firstSeenDocumentId: "88888888-8888-4888-8888-888888888888",
          lastSeenDocumentId: "88888888-8888-4888-8888-888888888888",
          occurrenceCount: 2,
          lastSeenAt: "2026-05-26T00:00:00.000Z",
          citations: [citation]
        }
      ],
      managementClaims: [
        {
          id: "claim-1",
          claim: "CEO Jane Smith said supplier MegaSupply supports product InsightCloud.",
          polarity: "neutral",
          firstSeenDocumentId: "88888888-8888-4888-8888-888888888888",
          lastSeenDocumentId: "88888888-8888-4888-8888-888888888888",
          occurrenceCount: 1,
          lastSeenAt: "2026-05-26T00:00:00.000Z",
          citations: [citation]
        }
      ],
      historicalMetrics: []
    },
    portfolio: {
      portfolioId: "portfolio_default",
      companyCount: 2,
      filingCount: 4,
      alertCount: 4,
      highSeverityAlertCount: 1,
      sectorExposure: [
        {
          sector: "Technology",
          companyCount: 2,
          concentrationWeight: 1,
          companies: ["Acme Analytics", "Beta Software"]
        }
      ],
      overlappingRisks: [
        {
          theme: "debt_refinancing",
          label: "Debt and refinancing risk",
          companyCount: 2,
          companies: ["Acme Analytics", "Beta Software"],
          severity: "high",
          citations: [citation]
        }
      ],
      concentrationSignals: [],
      companies: [
        {
          companyId: "company_acme",
          companyName: "Acme Analytics",
          sector: "Technology",
          filingCount: 2,
          riskCount: 1,
          alertCount: 2,
          concentrationWeight: 0.5,
          latestDocumentId: "88888888-8888-4888-8888-888888888888",
          latestDocumentFilename: "acme-q2-2026.txt",
          topRisks: ["Debt and refinancing risk"]
        },
        {
          companyId: "company_beta",
          companyName: "Beta Software",
          sector: "Technology",
          filingCount: 2,
          riskCount: 1,
          alertCount: 2,
          concentrationWeight: 0.5,
          latestDocumentId: "beta",
          latestDocumentFilename: "beta.txt",
          topRisks: ["Debt and refinancing risk"]
        }
      ],
      updatedAt: "2026-05-26T00:00:00.000Z"
    },
    crossCompany: {
      id: "cross-company",
      portfolioId: "portfolio_default",
      generatedAt: "2026-05-26T00:00:00.000Z",
      competitorComparisons: [
        {
          id: "competitor-1",
          sector: "Technology",
          companies: ["Acme Analytics", "Beta Software"],
          sharedRisks: ["Debt and refinancing risk"],
          alertSpread: 0,
          assessment: "Peers share risk."
        }
      ],
      sectorTrends: [],
      industryTrends: [],
      macroExposures: [
        {
          factor: "rates",
          label: "Interest rate and refinancing exposure",
          companies: ["Acme Analytics", "Beta Software"],
          severity: "high",
          evidence: ["Debt and refinancing risk"],
          citations: [citation]
        }
      ],
      limitations: []
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
    documentId: "88888888-8888-4888-8888-888888888888",
    documentKind: "earnings_call",
    sourceFile: "source.txt",
    section: "Prepared Remarks",
    page: 1,
    pageEnd: 1,
    excerpt,
    relevanceScore: 0.8,
    chunkIndex: 0,
    charStart: 0,
    charEnd: excerpt.length
  };
}
