import { createHash } from "node:crypto";
import { createPgPool } from "@/db/client";
import { env } from "@/lib/config";
import { logger } from "@/lib/logger";
import type {
  AnalysisReport,
  CompanyMemorySummary,
  EvidenceCitation,
  WatchlistAlert,
  WatchlistAlertCategory,
  WatchlistAlertSeverity,
  WatchlistSummary
} from "@/lib/types";
import type { ParsedDocument } from "@/parsers/types";

const defaultWatchlistId = "watchlist_default";
const defaultWatchlistName = "Default Company Watchlist";
const inProcessWatchlists = new Map<string, WatchlistSummary>();

export async function updateWatchlistForAnalysis({
  document,
  report,
  memory
}: {
  document: ParsedDocument;
  report: AnalysisReport;
  memory: CompanyMemorySummary;
}): Promise<WatchlistSummary> {
  const alerts = buildWatchlistAlerts({ document, report, memory });
  const summary = env.DATABASE_URL
    ? await updateWatchlistWithPg({ memory, documentId: document.id, alerts })
    : updateWatchlistInProcess({ memory, alerts });

  logger.info("watchlist.updated", {
    watchlistId: summary.watchlistId,
    companyId: summary.companyId,
    companyName: summary.companyName,
    alertCount: summary.alertCount,
    unacknowledgedCount: summary.unacknowledgedCount
  });

  return summary;
}

export function buildWatchlistAlerts({
  document,
  report,
  memory
}: {
  document: ParsedDocument;
  report: AnalysisReport;
  memory: CompanyMemorySummary;
}): WatchlistAlert[] {
  const createdAt = report.document.processedAt;
  const alerts: WatchlistAlert[] = [
    alert({
      companyId: memory.companyId,
      category: "filing",
      severity: memory.filingCount > 1 ? "medium" : "info",
      title: memory.filingCount > 1 ? "New filing added to company history" : "Company added to watchlist",
      message: `${memory.companyName} now has ${memory.filingCount} remembered filing(s). Latest: ${document.filename}.`,
      documentId: document.id,
      createdAt,
      citations: report.citations.slice(0, 2)
    })
  ];

  if (document.kind === "earnings_call" || /earnings|transcript|call/i.test(document.filename)) {
    alerts.push(
      alert({
        companyId: memory.companyId,
        category: "earnings",
        severity: "medium",
        title: "Earnings document analyzed",
        message: `${memory.companyName} has a new earnings-related document with ${report.keyMetrics.length} extracted metric(s).`,
        documentId: document.id,
        createdAt,
        citations: report.keyMetrics.flatMap((metric) => metric.citations).slice(0, 4)
      })
    );
  }

  for (const risk of memory.recurringRisks.filter((item) => item.lastSeenDocumentId === document.id).slice(0, 6)) {
    const isNewRisk = risk.occurrenceCount <= 1;
    alerts.push(
      alert({
        companyId: memory.companyId,
        category: "risk_change",
        severity: isNewRisk ? "high" : "medium",
        title: isNewRisk ? `New risk tracked: ${risk.label}` : `Recurring risk updated: ${risk.label}`,
        message: isNewRisk
          ? `${risk.label} appeared in the latest analysis for ${memory.companyName}.`
          : `${risk.label} has appeared across ${risk.occurrenceCount} remembered filing(s) or analyses.`,
        documentId: document.id,
        createdAt,
        citations: risk.citations
      })
    );
  }

  if (report.confidence.score < 50 || report.debateAssessment.contradictionScore >= 0.5) {
    alerts.push(
      alert({
        companyId: memory.companyId,
        category: "confidence",
        severity: report.debateAssessment.contradictionScore >= 0.65 ? "high" : "medium",
        title: "Analysis confidence requires review",
        message: `Confidence is ${report.confidence.score}% with contradiction score ${Math.round(report.debateAssessment.contradictionScore * 100)}%.`,
        documentId: document.id,
        createdAt,
        citations: report.disagreements.flatMap((item) => item.citations).slice(0, 4)
      })
    );
  }

  return dedupeAlerts(alerts);
}

function alert({
  companyId,
  category,
  severity,
  title,
  message,
  documentId,
  createdAt,
  citations
}: {
  companyId: string;
  category: WatchlistAlertCategory;
  severity: WatchlistAlertSeverity;
  title: string;
  message: string;
  documentId: string;
  createdAt: string;
  citations: EvidenceCitation[];
}): WatchlistAlert {
  const stable = `${companyId}:${category}:${documentId}:${title}:${message}`;
  return {
    id: `alert_${hash(stable).slice(0, 28)}`,
    companyId,
    category,
    severity,
    title,
    message,
    documentId,
    createdAt,
    acknowledged: false,
    citations: uniqueCitations(citations).slice(0, 6)
  };
}

async function updateWatchlistWithPg({
  memory,
  documentId,
  alerts
}: {
  memory: CompanyMemorySummary;
  documentId: string;
  alerts: WatchlistAlert[];
}): Promise<WatchlistSummary> {
  const pool = createPgPool();
  if (!pool) return updateWatchlistInProcess({ memory, alerts });
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      `insert into watchlists (id, name, updated_at)
       values ($1, $2, $3)
       on conflict (id) do update set name = excluded.name, updated_at = excluded.updated_at`,
      [defaultWatchlistId, defaultWatchlistName, memory.lastUpdatedAt]
    );
    await client.query(
      `insert into watchlist_companies (
        watchlist_id, company_id, company_name, tracked_at, last_document_id, last_checked_at
      ) values ($1, $2, $3, $4, $5, $4)
      on conflict (watchlist_id, company_id) do update set
        company_name = excluded.company_name,
        last_document_id = excluded.last_document_id,
        last_checked_at = excluded.last_checked_at`,
      [defaultWatchlistId, memory.companyId, memory.companyName, memory.lastUpdatedAt, documentId]
    );

    for (const item of alerts) {
      await client.query(
        `insert into watchlist_alerts (
          id, watchlist_id, company_id, category, severity, title, message,
          document_id, created_at, acknowledged, citations
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10::jsonb)
        on conflict (id) do update set
          severity = excluded.severity,
          title = excluded.title,
          message = excluded.message,
          citations = excluded.citations`,
        [
          item.id,
          defaultWatchlistId,
          item.companyId,
          item.category,
          item.severity,
          item.title,
          item.message,
          item.documentId,
          item.createdAt,
          JSON.stringify(item.citations)
        ]
      );
    }

    await client.query("commit");
    return await loadWatchlistSummary(memory.companyId);
  } catch (error) {
    await client.query("rollback");
    logger.warn("watchlist.pg_failed", {
      companyId: memory.companyId,
      error: error instanceof Error ? error.message : String(error)
    });
    return updateWatchlistInProcess({ memory, alerts });
  } finally {
    client.release();
  }
}

async function loadWatchlistSummary(companyId: string): Promise<WatchlistSummary> {
  const pool = createPgPool();
  if (!pool) {
    const summary = inProcessWatchlists.get(companyId);
    if (!summary) throw new Error(`Watchlist summary not found for ${companyId}.`);
    return summary;
  }

  const [company, count, alerts] = await Promise.all([
    pool.query(
      `select company_name from watchlist_companies where watchlist_id = $1 and company_id = $2`,
      [defaultWatchlistId, companyId]
    ),
    pool.query(`select count(*)::int as tracked_count from watchlist_companies where watchlist_id = $1`, [
      defaultWatchlistId
    ]),
    pool.query(
      `select id, company_id, category, severity, title, message, document_id, created_at, acknowledged, citations
       from watchlist_alerts
       where watchlist_id = $1 and company_id = $2
       order by created_at desc, severity desc
       limit 20`,
      [defaultWatchlistId, companyId]
    )
  ]);
  const parsedAlerts = alerts.rows.map(alertFromRow);

  return {
    watchlistId: defaultWatchlistId,
    companyId,
    companyName: company.rows[0]?.company_name ?? "Unknown Company",
    trackedCompanyCount: count.rows[0]?.tracked_count ?? 0,
    alertCount: parsedAlerts.length,
    unacknowledgedCount: parsedAlerts.filter((item) => !item.acknowledged).length,
    alerts: parsedAlerts
  };
}

function updateWatchlistInProcess({
  memory,
  alerts
}: {
  memory: CompanyMemorySummary;
  alerts: WatchlistAlert[];
}): WatchlistSummary {
  const existing = inProcessWatchlists.get(memory.companyId);
  const mergedAlerts = dedupeAlerts([...alerts, ...(existing?.alerts ?? [])])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
  const summary: WatchlistSummary = {
    watchlistId: defaultWatchlistId,
    companyId: memory.companyId,
    companyName: memory.companyName,
    trackedCompanyCount: inProcessWatchlists.has(memory.companyId)
      ? inProcessWatchlists.size
      : inProcessWatchlists.size + 1,
    alertCount: mergedAlerts.length,
    unacknowledgedCount: mergedAlerts.filter((item) => !item.acknowledged).length,
    alerts: mergedAlerts
  };
  inProcessWatchlists.set(memory.companyId, summary);
  return summary;
}

function alertFromRow(row: Record<string, unknown>): WatchlistAlert {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    category: row.category as WatchlistAlertCategory,
    severity: row.severity as WatchlistAlertSeverity,
    title: String(row.title),
    message: String(row.message),
    documentId: String(row.document_id),
    createdAt: toIso(row.created_at),
    acknowledged: Boolean(row.acknowledged),
    citations: parseCitations(row.citations)
  };
}

function dedupeAlerts(alerts: WatchlistAlert[]) {
  const seen = new Set<string>();
  return alerts.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function uniqueCitations(citations: EvidenceCitation[]) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    if (seen.has(citation.id)) return false;
    seen.add(citation.id);
    return true;
  });
}

function parseCitations(value: unknown): EvidenceCitation[] {
  if (Array.isArray(value)) return value as EvidenceCitation[];
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return new Date().toISOString();
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
