import type { AnalysisReport } from "@/lib/types";

export type ApiPlatformManifest = {
  name: "Financial Sight API";
  version: "v1";
  capabilities: string[];
  endpoints: Array<{
    method: "GET" | "POST";
    path: string;
    description: string;
  }>;
};

export function platformManifest(): ApiPlatformManifest {
  return {
    name: "Financial Sight API",
    version: "v1",
    capabilities: [
      "document_analysis",
      "company_memory",
      "watchlist_alerts",
      "portfolio_intelligence",
      "analyst_workspace_exports",
      "audit_compliance"
    ],
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/health",
        description: "Service health and API version metadata."
      },
      {
        method: "POST",
        path: "/api/v1/analyze",
        description: "Analyze an uploaded financial document using the production workflow."
      },
      {
        method: "POST",
        path: "/api/v1/reports",
        description: "Normalize an existing AnalysisReport into integration-friendly resource summaries."
      }
    ]
  };
}

export function reportResourceEnvelope(report: AnalysisReport) {
  return {
    apiVersion: "v1",
    document: report.document,
    verdict: report.finalVerdict,
    confidence: report.confidence,
    resources: {
      companyMemory: report.companyMemory
        ? {
          companyId: report.companyMemory.companyId,
          companyName: report.companyMemory.companyName,
          filingCount: report.companyMemory.filingCount,
          recurringRisks: report.companyMemory.recurringRisks.length,
          historicalMetrics: report.companyMemory.historicalMetrics.length
        }
        : null,
      watchlist: report.watchlist
        ? {
          watchlistId: report.watchlist.watchlistId,
          alertCount: report.watchlist.alertCount,
          unacknowledgedCount: report.watchlist.unacknowledgedCount,
          alerts: report.watchlist.alerts
        }
        : null,
      portfolio: report.portfolio
        ? {
          portfolioId: report.portfolio.portfolioId,
          companyCount: report.portfolio.companyCount,
          sectorExposure: report.portfolio.sectorExposure,
          overlappingRisks: report.portfolio.overlappingRisks,
          concentrationSignals: report.portfolio.concentrationSignals
        }
        : null,
      workspace: report.workspace
        ? {
          workspaceId: report.workspace.workspaceId,
          savedFindings: report.workspace.savedFindings,
          annotations: report.workspace.annotations,
          exports: report.workspace.exports.map((item) => ({
            id: item.id,
            format: item.format,
            filename: item.filename,
            generatedAt: item.generatedAt,
            checksum: item.checksum
          }))
        }
        : null,
      compliance: report.compliance
        ? {
          auditId: report.compliance.auditId,
          reproducibilitySeed: report.compliance.reproducibilitySeed,
          reportChecksum: report.compliance.reportChecksum,
          evidenceRecordCount: report.compliance.evidenceRecordCount,
          versions: report.compliance.versions
        }
        : null
    },
    links: {
      health: "/api/v1/health",
      analyze: "/api/v1/analyze",
      reports: "/api/v1/reports"
    }
  };
}
