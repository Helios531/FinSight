import type { AgentClaim, AnalysisReport } from "@/lib/types";
import { logger } from "@/lib/logger";

export function validateAnalysisReport(report: AnalysisReport): AnalysisReport {
  const claims = [
    ...report.executiveSummary,
    ...report.bullCase,
    ...report.bearCase,
    ...report.riskAnalysis
  ];
  const unsupported = claims.filter(isImportantUnsupportedClaim);

  if (unsupported.length === 0) {
    return report;
  }

  logger.warn("report.unsupported_claims_detected", {
    documentId: report.document.id,
    claimIds: unsupported.map((claim) => claim.id)
  });

  const score = Math.max(10, report.confidence.score - unsupported.length * 8);
  return {
    ...report,
    confidence: {
      ...report.confidence,
      score,
      label: score >= 75 ? "High" : score >= 50 ? "Medium" : "Low",
      reductions: [
        ...report.confidence.reductions,
        `${unsupported.length} important claims lacked required citations and reduced confidence.`
      ]
    }
  };
}

function isImportantUnsupportedClaim(claim: AgentClaim) {
  return claim.confidence > 0.25 && claim.citations.length === 0;
}
