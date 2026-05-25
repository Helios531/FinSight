import { describe, expect, it } from "vitest";
import { buildCrossCompanyIntelligence } from "@/memory/cross-company";
import type { EvidenceCitation, PortfolioIntelligenceSummary } from "@/lib/types";

describe("cross-company intelligence analysis", () => {
  it("compares same-sector competitors and shared risks", () => {
    const intelligence = buildCrossCompanyIntelligence(portfolio());

    const competitor = intelligence.competitorComparisons.find((item) => item.sector === "Technology");

    expect(competitor).toMatchObject({
      companies: ["Alpha Cloud", "Beta Software"],
      sharedRisks: expect.arrayContaining(["Debt and refinancing risk"])
    });
  });

  it("detects sector trend pressure from tracked companies and alerts", () => {
    const intelligence = buildCrossCompanyIntelligence(portfolio());

    expect(intelligence.sectorTrends.find((trend) => trend.sector === "Technology")).toMatchObject({
      companyCount: 2,
      trend: "rising_risk"
    });
  });

  it("clusters industry trends and macro exposure across companies", () => {
    const intelligence = buildCrossCompanyIntelligence(portfolio());

    expect(intelligence.industryTrends.map((trend) => trend.label)).toEqual(
      expect.arrayContaining(["Debt and refinancing risk", "Supply chain risk"])
    );
    expect(intelligence.macroExposures.map((exposure) => exposure.factor)).toEqual(
      expect.arrayContaining(["rates", "supply_chain"])
    );
    expect(intelligence.macroExposures.find((exposure) => exposure.factor === "rates")?.companies).toEqual(
      expect.arrayContaining(["Alpha Cloud", "Beta Software"])
    );
  });
});

function portfolio(): PortfolioIntelligenceSummary {
  const debtCitation = citation("debt", "Debt refinancing risk remains elevated.");
  const supplyCitation = citation("supply", "Supply chain risk increased.");

  return {
    portfolioId: "portfolio_default",
    companyCount: 3,
    filingCount: 6,
    alertCount: 10,
    highSeverityAlertCount: 3,
    sectorExposure: [
      {
        sector: "Technology",
        companyCount: 2,
        concentrationWeight: 0.667,
        companies: ["Alpha Cloud", "Beta Software"]
      },
      {
        sector: "Industrials",
        companyCount: 1,
        concentrationWeight: 0.333,
        companies: ["Gamma Industrial"]
      }
    ],
    overlappingRisks: [
      {
        theme: "debt_refinancing",
        label: "Debt and refinancing risk",
        companyCount: 2,
        companies: ["Alpha Cloud", "Beta Software"],
        severity: "high",
        citations: [debtCitation]
      },
      {
        theme: "supply_chain",
        label: "Supply chain risk",
        companyCount: 2,
        companies: ["Beta Software", "Gamma Industrial"],
        severity: "medium",
        citations: [supplyCitation]
      }
    ],
    concentrationSignals: [],
    companies: [
      {
        companyId: "company_alpha",
        companyName: "Alpha Cloud",
        sector: "Technology",
        filingCount: 2,
        riskCount: 2,
        alertCount: 5,
        concentrationWeight: 0.333,
        latestDocumentId: "doc-alpha",
        latestDocumentFilename: "alpha.txt",
        topRisks: ["Debt and refinancing risk", "Cybersecurity risk"]
      },
      {
        companyId: "company_beta",
        companyName: "Beta Software",
        sector: "Technology",
        filingCount: 2,
        riskCount: 3,
        alertCount: 4,
        concentrationWeight: 0.333,
        latestDocumentId: "doc-beta",
        latestDocumentFilename: "beta.txt",
        topRisks: ["Debt and refinancing risk", "Supply chain risk"]
      },
      {
        companyId: "company_gamma",
        companyName: "Gamma Industrial",
        sector: "Industrials",
        filingCount: 2,
        riskCount: 1,
        alertCount: 1,
        concentrationWeight: 0.333,
        latestDocumentId: "doc-gamma",
        latestDocumentFilename: "gamma.txt",
        topRisks: ["Supply chain risk"]
      }
    ],
    updatedAt: "2026-05-26T00:00:00.000Z"
  };
}

function citation(id: string, excerpt: string): EvidenceCitation {
  return {
    id,
    documentId: "doc",
    documentKind: "sec_filing",
    sourceFile: "source.txt",
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
