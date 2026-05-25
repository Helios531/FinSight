import { describe, expect, it } from "vitest";
import { inferSector, updatePortfolioForAnalysis } from "@/memory/portfolio";
import type { CompanyMemorySummary, EvidenceCitation, WatchlistSummary } from "@/lib/types";

describe("portfolio intelligence dashboard", () => {
  it("infers sector exposure from company memory", () => {
    expect(inferSector(memory("cloudco", "CloudCo", ["cloud platform revenue"], ["Cybersecurity risk"]))).toBe("Technology");
    expect(inferSector(memory("bankco", "BankCo", ["loan growth"], ["Credit risk"]))).toBe("Financials");
  });

  it("aggregates multiple companies into sector and concentration exposure", async () => {
    const first = await updatePortfolioForAnalysis({
      memory: memory("alpha", "Alpha Cloud", ["cloud revenue"], ["Debt and refinancing risk"]),
      watchlist: watchlist("alpha", "Alpha Cloud", 2)
    });
    const second = await updatePortfolioForAnalysis({
      memory: memory("beta", "Beta Software", ["software revenue"], ["Debt and refinancing risk"]),
      watchlist: watchlist("beta", "Beta Software", 5)
    });

    expect(first.companyCount).toBeGreaterThanOrEqual(1);
    expect(second.companyCount).toBeGreaterThanOrEqual(2);
    expect(second.sectorExposure.find((sector) => sector.sector === "Technology")).toMatchObject({
      companyCount: expect.any(Number)
    });
    expect(second.concentrationSignals.some((signal) => signal.issue.includes("Technology"))).toBe(true);
  });

  it("detects overlapping risks across tracked companies", async () => {
    await updatePortfolioForAnalysis({
      memory: memory("gamma", "Gamma Energy", ["pipeline revenue"], ["Supply chain risk", "Debt and refinancing risk"]),
      watchlist: watchlist("gamma", "Gamma Energy", 3)
    });
    const portfolio = await updatePortfolioForAnalysis({
      memory: memory("delta", "Delta Industrial", ["manufacturing demand"], ["Supply chain risk"]),
      watchlist: watchlist("delta", "Delta Industrial", 1)
    });

    const overlap = portfolio.overlappingRisks.find((risk) => risk.label === "Supply chain risk");

    expect(overlap).toMatchObject({
      companyCount: expect.any(Number),
      severity: expect.stringMatching(/medium|high/)
    });
    expect(overlap?.companies).toEqual(expect.arrayContaining(["Gamma Energy", "Delta Industrial"]));
  });
});

function memory(id: string, name: string, claims: string[], risks: string[]): CompanyMemorySummary {
  const latestDocumentId = `44444444-4444-4444-8444-${id.slice(0, 4).padEnd(12, "0")}`;
  return {
    companyId: `company_${id}`,
    companyName: name,
    filingCount: 2,
    latestDocumentId,
    latestDocumentFilename: `${name.toLowerCase().replace(/\s+/g, "-")}-q2-2026.txt`,
    lastUpdatedAt: "2026-05-01T00:00:00.000Z",
    pastFilings: [
      {
        documentId: latestDocumentId,
        filename: `${name}-q2-2026.txt`,
        kind: "earnings_call",
        processedAt: "2026-05-01T00:00:00.000Z"
      }
    ],
    recurringRisks: risks.map((risk) => ({
      theme: risk.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
      label: risk,
      firstSeenDocumentId: latestDocumentId,
      lastSeenDocumentId: latestDocumentId,
      occurrenceCount: 1,
      lastSeenAt: "2026-05-01T00:00:00.000Z",
      citations: [citation(latestDocumentId, risk)]
    })),
    managementClaims: claims.map((claim, index) => ({
      id: `claim_${id}_${index}`,
      claim,
      polarity: "neutral",
      firstSeenDocumentId: latestDocumentId,
      lastSeenDocumentId: latestDocumentId,
      occurrenceCount: 1,
      lastSeenAt: "2026-05-01T00:00:00.000Z",
      citations: [citation(latestDocumentId, claim)]
    })),
    historicalMetrics: []
  };
}

function watchlist(id: string, name: string, alertCount: number): WatchlistSummary {
  const alerts = Array.from({ length: alertCount }, (_, index) => ({
    id: `alert_${id}_${index}`,
    companyId: `company_${id}`,
    category: index === 0 ? ("risk_change" as const) : ("filing" as const),
    severity: index === 0 ? ("high" as const) : ("medium" as const),
    title: index === 0 ? "Risk change" : "Filing update",
    message: index === 0 ? "Supply chain risk updated." : "New filing added.",
    documentId: `44444444-4444-4444-8444-${id.slice(0, 4).padEnd(12, "0")}`,
    createdAt: "2026-05-01T00:00:00.000Z",
    acknowledged: false,
    citations: []
  }));

  return {
    watchlistId: "watchlist_default",
    companyId: `company_${id}`,
    companyName: name,
    trackedCompanyCount: 1,
    alertCount: alerts.length,
    unacknowledgedCount: alerts.length,
    alerts
  };
}

function citation(documentId: string, excerpt: string): EvidenceCitation {
  return {
    id: `${documentId}-${excerpt}`,
    documentId,
    documentKind: "earnings_call",
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
