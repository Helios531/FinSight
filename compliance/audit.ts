import { createHash } from "node:crypto";
import { createPgPool } from "@/db/client";
import { env } from "@/lib/config";
import { logger } from "@/lib/logger";
import type { AnalysisReport, AuditEvent, ComplianceSummary, EvidenceTrackingRecord, ReportVersion } from "@/lib/types";

const inProcessAudits = new Map<string, ComplianceSummary>();

export async function createComplianceSummary(report: AnalysisReport): Promise<ComplianceSummary> {
  const summary = buildComplianceSummary(report);
  const saved = env.DATABASE_URL ? await saveComplianceWithPg(summary) : saveComplianceInProcess(summary);

  logger.info("compliance.audit_created", {
    auditId: saved.auditId,
    documentId: saved.documentId,
    evidenceRecordCount: saved.evidenceRecordCount,
    versionCount: saved.versions.length
  });

  return saved;
}

export function buildComplianceSummary(report: AnalysisReport): ComplianceSummary {
  const createdAt = report.document.processedAt;
  const reproducibilitySeed = stableHash([
    report.document.id,
    report.document.filename,
    String(report.document.chunkCount),
    report.citations.map((citation) => citation.id).sort().join("|")
  ].join(":"));
  const reportChecksum = checksumReport(report);
  const auditId = `audit_${stableHash(`${report.document.id}:${reportChecksum}`).slice(0, 24)}`;
  const evidenceTracking = buildEvidenceTracking(report);
  const versions: ReportVersion[] = [
    {
      id: `version_${stableHash(`${auditId}:1:${reportChecksum}`).slice(0, 24)}`,
      documentId: report.document.id,
      version: 1,
      createdAt,
      checksum: reportChecksum,
      reproducibilitySeed
    }
  ];

  return {
    auditId,
    documentId: report.document.id,
    reproducibilitySeed,
    reportChecksum,
    evidenceRecordCount: evidenceTracking.length,
    auditEvents: buildAuditEvents({ report, auditId, createdAt, evidenceTracking, versions }),
    evidenceTracking,
    versions,
    createdAt
  };
}

function buildAuditEvents({
  report,
  auditId,
  createdAt,
  evidenceTracking,
  versions
}: {
  report: AnalysisReport;
  auditId: string;
  createdAt: string;
  evidenceTracking: EvidenceTrackingRecord[];
  versions: ReportVersion[];
}): AuditEvent[] {
  return [
    event(auditId, report.document.id, "ingest", createdAt, {
      filename: report.document.filename,
      kind: report.document.kind,
      chunkCount: report.document.chunkCount
    }),
    event(auditId, report.document.id, "retrieval", createdAt, {
      citationCount: report.citations.length,
      evidenceRecordCount: evidenceTracking.length
    }),
    event(auditId, report.document.id, "agent_analysis", createdAt, {
      bullClaims: report.bullCase.length,
      bearClaims: report.bearCase.length,
      riskClaims: report.riskAnalysis.length,
      confidence: report.confidence.score
    }),
    event(auditId, report.document.id, "memory_update", createdAt, {
      companyId: report.companyMemory?.companyId ?? "none",
      filingCount: report.companyMemory?.filingCount ?? 0,
      portfolioCompanies: report.portfolio?.companyCount ?? 0
    }),
    event(auditId, report.document.id, "workspace_export", createdAt, {
      workspaceId: report.workspace?.workspaceId ?? "none",
      exportCount: report.workspace?.exports.length ?? 0
    }),
    event(auditId, report.document.id, "report_version", createdAt, {
      version: versions[0]?.version ?? 1,
      checksum: versions[0]?.checksum ?? "unknown"
    })
  ];
}

function event(
  auditId: string,
  documentId: string,
  eventType: AuditEvent["eventType"],
  occurredAt: string,
  details: AuditEvent["details"]
): AuditEvent {
  return {
    id: `event_${stableHash(`${auditId}:${eventType}:${JSON.stringify(details)}`).slice(0, 24)}`,
    documentId,
    eventType,
    actor: "Financial Sight",
    occurredAt,
    details
  };
}

function buildEvidenceTracking(report: AnalysisReport): EvidenceTrackingRecord[] {
  const claims = [
    ...report.executiveSummary,
    ...report.bullCase,
    ...report.bearCase,
    ...report.riskAnalysis
  ];
  const claimIdsByCitation = new Map<string, string[]>();
  for (const claim of claims) {
    for (const citation of claim.citations) {
      claimIdsByCitation.set(citation.id, [...(claimIdsByCitation.get(citation.id) ?? []), claim.id]);
    }
  }

  const seen = new Set<string>();
  return report.citations
    .filter((citation) => {
      if (seen.has(citation.id)) return false;
      seen.add(citation.id);
      return true;
    })
    .map((citation) => ({
      citationId: citation.id,
      documentId: citation.documentId,
      section: citation.section,
      page: citation.page,
      excerptHash: stableHash(citation.excerpt),
      claimIds: claimIdsByCitation.get(citation.id) ?? []
    }));
}

async function saveComplianceWithPg(summary: ComplianceSummary): Promise<ComplianceSummary> {
  const pool = createPgPool();
  if (!pool) return saveComplianceInProcess(summary);
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      `insert into audit_runs (id, document_id, reproducibility_seed, report_checksum, created_at)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do update set report_checksum = excluded.report_checksum`,
      [summary.auditId, summary.documentId, summary.reproducibilitySeed, summary.reportChecksum, summary.createdAt]
    );

    for (const item of summary.auditEvents) {
      await client.query(
        `insert into audit_events (id, audit_id, document_id, event_type, actor, occurred_at, details)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb)
         on conflict (id) do update set details = excluded.details`,
        [item.id, summary.auditId, item.documentId, item.eventType, item.actor, item.occurredAt, JSON.stringify(item.details)]
      );
    }

    for (const item of summary.evidenceTracking) {
      const id = `evidence_${stableHash(`${summary.auditId}:${item.citationId}`).slice(0, 24)}`;
      await client.query(
        `insert into evidence_tracking (id, audit_id, citation_id, document_id, section, page, excerpt_hash, claim_ids)
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         on conflict (id) do update set claim_ids = excluded.claim_ids`,
        [
          id,
          summary.auditId,
          item.citationId,
          item.documentId,
          item.section,
          item.page ?? null,
          item.excerptHash,
          JSON.stringify(item.claimIds)
        ]
      );
    }

    for (const version of summary.versions) {
      await client.query(
        `insert into report_versions (id, audit_id, document_id, version, created_at, checksum, reproducibility_seed)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (id) do update set checksum = excluded.checksum`,
        [
          version.id,
          summary.auditId,
          version.documentId,
          version.version,
          version.createdAt,
          version.checksum,
          version.reproducibilitySeed
        ]
      );
    }

    await client.query("commit");
    return summary;
  } catch (error) {
    await client.query("rollback");
    logger.warn("compliance.pg_failed", {
      auditId: summary.auditId,
      error: error instanceof Error ? error.message : String(error)
    });
    return saveComplianceInProcess(summary);
  } finally {
    client.release();
  }
}

function saveComplianceInProcess(summary: ComplianceSummary) {
  inProcessAudits.set(summary.auditId, summary);
  return summary;
}

function checksumReport(report: AnalysisReport) {
  return stableHash(JSON.stringify({
    document: {
      ...report.document,
      processedAt: "<normalized>"
    },
    executiveSummary: report.executiveSummary,
    bullCase: report.bullCase,
    bearCase: report.bearCase,
    riskAnalysis: report.riskAnalysis,
    keyMetrics: report.keyMetrics,
    confidence: report.confidence,
    citations: report.citations,
    disagreements: report.disagreements,
    finalVerdict: report.finalVerdict
  }));
}

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
