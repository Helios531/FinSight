import { createHash } from "node:crypto";
import { createPgPool } from "@/db/client";
import { env } from "@/lib/config";
import { logger } from "@/lib/logger";
import type {
  AgentClaim,
  AnalysisReport,
  CompanyMemoryClaim,
  CompanyMemoryMetric,
  CompanyMemoryRisk,
  CompanyMemorySummary,
  DocumentKind,
  EvidenceCitation,
  KeyMetric
} from "@/lib/types";
import type { ParsedDocument } from "@/parsers/types";

type CompanyIdentity = {
  companyId: string;
  companyName: string;
  normalizedName: string;
};

type FilingMemory = CompanyMemorySummary["pastFilings"][number];

type MemoryWrite = {
  identity: CompanyIdentity;
  filing: FilingMemory;
  risks: CompanyMemoryRisk[];
  claims: CompanyMemoryClaim[];
  metrics: CompanyMemoryMetric[];
};

const inProcessMemory = new Map<string, CompanyMemorySummary>();

const riskThemes = [
  { theme: "liquidity", label: "Liquidity risk", patterns: [/liquidity/i, /cash runway/i, /working capital/i] },
  { theme: "debt_refinancing", label: "Debt and refinancing risk", patterns: [/debt/i, /refinanc/i, /covenant/i, /maturit/i] },
  { theme: "customer_concentration", label: "Customer concentration risk", patterns: [/concentration/i, /top customer/i] },
  { theme: "regulatory", label: "Regulatory risk", patterns: [/regulat/i, /compliance/i, /investigation/i] },
  { theme: "litigation", label: "Litigation risk", patterns: [/litigation/i, /lawsuit/i, /legal proceeding/i] },
  { theme: "macro_demand", label: "Macro and demand risk", patterns: [/macro/i, /demand/i, /recession/i, /headwind/i] },
  { theme: "accounting_controls", label: "Accounting and controls risk", patterns: [/accounting/i, /internal control/i, /impairment/i] },
  { theme: "supply_chain", label: "Supply chain risk", patterns: [/supply chain/i, /supplier/i, /logistics/i] },
  { theme: "margin_pressure", label: "Margin pressure", patterns: [/margin pressure/i, /pricing pressure/i, /cost pressure/i] },
  { theme: "guidance", label: "Guidance risk", patterns: [/guidance/i, /outlook/i, /forecast/i] }
];

export async function rememberCompanyAnalysis({
  document,
  report
}: {
  document: ParsedDocument;
  report: AnalysisReport;
}): Promise<CompanyMemorySummary> {
  const write = buildMemoryWrite(document, report);
  const summary = env.DATABASE_URL ? await rememberWithPg(write) : rememberInProcess(write);

  logger.info("company_memory.updated", {
    companyId: summary.companyId,
    companyName: summary.companyName,
    filingCount: summary.filingCount,
    riskCount: summary.recurringRisks.length,
    metricCount: summary.historicalMetrics.length
  });

  return summary;
}

export function buildMemoryWrite(document: ParsedDocument, report: AnalysisReport): MemoryWrite {
  const identity = identifyCompany(document);
  const processedAt = report.document.processedAt;
  return {
    identity,
    filing: {
      documentId: document.id,
      filename: document.filename,
      kind: document.kind,
      processedAt
    },
    risks: extractRiskMemory(report.riskAnalysis, document.id, processedAt),
    claims: extractClaimMemory([...report.bullCase, ...report.bearCase, ...report.riskAnalysis], document.id, processedAt),
    metrics: extractMetricMemory(report.keyMetrics, document.id, processedAt)
  };
}

export function identifyCompany(document: ParsedDocument): CompanyIdentity {
  const rawName = document.metadata.title ?? document.filename.replace(/\.[^.]+$/, "");
  const companyName = cleanCompanyName(rawName);
  const normalizedName = normalizeKey(companyName);
  return {
    companyId: `company_${hash(normalizedName).slice(0, 20)}`,
    companyName,
    normalizedName
  };
}

function extractRiskMemory(claims: AgentClaim[], documentId: string, seenAt: string): CompanyMemoryRisk[] {
  const byTheme = new Map<string, CompanyMemoryRisk>();

  for (const claim of claims) {
    const text = `${claim.title} ${claim.claim}`;
    for (const theme of riskThemes) {
      if (!theme.patterns.some((pattern) => pattern.test(text))) continue;
      const existing = byTheme.get(theme.theme);
      const citations = mergeCitations(existing?.citations ?? [], claim.citations).slice(0, 6);
      byTheme.set(theme.theme, {
        theme: theme.theme,
        label: theme.label,
        firstSeenDocumentId: documentId,
        lastSeenDocumentId: documentId,
        occurrenceCount: (existing?.occurrenceCount ?? 0) + 1,
        lastSeenAt: seenAt,
        citations
      });
    }
  }

  return Array.from(byTheme.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function extractClaimMemory(claims: AgentClaim[], documentId: string, seenAt: string): CompanyMemoryClaim[] {
  return claims
    .filter((claim) => claim.citations.length > 0)
    .slice(0, 12)
    .map((claim) => ({
      id: `claim_${hash(`${claim.polarity}:${normalizeText(claim.claim)}`).slice(0, 24)}`,
      claim: claim.claim,
      polarity: claim.polarity,
      firstSeenDocumentId: documentId,
      lastSeenDocumentId: documentId,
      occurrenceCount: 1,
      lastSeenAt: seenAt,
      citations: claim.citations.slice(0, 4)
    }));
}

function extractMetricMemory(metrics: KeyMetric[], documentId: string, seenAt: string): CompanyMemoryMetric[] {
  return metrics.slice(0, 18).map((metric) => ({
    label: metric.label,
    value: metric.value,
    period: metric.period,
    firstSeenDocumentId: documentId,
    lastSeenDocumentId: documentId,
    occurrenceCount: 1,
    lastSeenAt: seenAt,
    citations: metric.citations.slice(0, 4)
  }));
}

async function rememberWithPg(write: MemoryWrite): Promise<CompanyMemorySummary> {
  const pool = createPgPool();
  if (!pool) return rememberInProcess(write);
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      `insert into companies (id, name, normalized_name, updated_at)
       values ($1, $2, $3, $4)
       on conflict (id) do update set name = excluded.name, updated_at = excluded.updated_at`,
      [write.identity.companyId, write.identity.companyName, write.identity.normalizedName, write.filing.processedAt]
    );
    await client.query(
      `insert into company_filings (company_id, document_id, filename, kind, processed_at)
       values ($1, $2, $3, $4, $5)
       on conflict (company_id, document_id) do update set
        filename = excluded.filename,
        kind = excluded.kind,
        processed_at = excluded.processed_at`,
      [write.identity.companyId, write.filing.documentId, write.filing.filename, write.filing.kind, write.filing.processedAt]
    );

    for (const risk of write.risks) {
      await client.query(
        `insert into company_risks (
          company_id, theme, label, first_seen_document_id, last_seen_document_id,
          occurrence_count, last_seen_at, citations
        ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        on conflict (company_id, theme) do update set
          label = excluded.label,
          last_seen_document_id = excluded.last_seen_document_id,
          occurrence_count = case
            when company_risks.last_seen_document_id = excluded.last_seen_document_id then company_risks.occurrence_count
            else company_risks.occurrence_count + excluded.occurrence_count
          end,
          last_seen_at = excluded.last_seen_at,
          citations = excluded.citations`,
        [
          write.identity.companyId,
          risk.theme,
          risk.label,
          risk.firstSeenDocumentId,
          risk.lastSeenDocumentId,
          risk.occurrenceCount,
          risk.lastSeenAt,
          JSON.stringify(risk.citations)
        ]
      );
    }

    for (const claim of write.claims) {
      await client.query(
        `insert into company_claims (
          company_id, id, claim, polarity, first_seen_document_id, last_seen_document_id,
          occurrence_count, last_seen_at, citations
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        on conflict (company_id, id) do update set
          claim = excluded.claim,
          polarity = excluded.polarity,
          last_seen_document_id = excluded.last_seen_document_id,
          occurrence_count = case
            when company_claims.last_seen_document_id = excluded.last_seen_document_id then company_claims.occurrence_count
            else company_claims.occurrence_count + excluded.occurrence_count
          end,
          last_seen_at = excluded.last_seen_at,
          citations = excluded.citations`,
        [
          write.identity.companyId,
          claim.id,
          claim.claim,
          claim.polarity,
          claim.firstSeenDocumentId,
          claim.lastSeenDocumentId,
          claim.occurrenceCount,
          claim.lastSeenAt,
          JSON.stringify(claim.citations)
        ]
      );
    }

    for (const metric of write.metrics) {
      const metricKey = normalizeKey(metric.label);
      await client.query(
        `insert into company_metrics (
          company_id, metric_key, label, value, period, period_key,
          first_seen_document_id, last_seen_document_id, occurrence_count, last_seen_at, citations
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
        on conflict (company_id, metric_key, value, period_key) do update set
          label = excluded.label,
          period = excluded.period,
          last_seen_document_id = excluded.last_seen_document_id,
          occurrence_count = case
            when company_metrics.last_seen_document_id = excluded.last_seen_document_id then company_metrics.occurrence_count
            else company_metrics.occurrence_count + excluded.occurrence_count
          end,
          last_seen_at = excluded.last_seen_at,
          citations = excluded.citations`,
        [
          write.identity.companyId,
          metricKey,
          metric.label,
          metric.value,
          metric.period ?? null,
          normalizeKey(metric.period ?? "not_stated"),
          metric.firstSeenDocumentId,
          metric.lastSeenDocumentId,
          metric.occurrenceCount,
          metric.lastSeenAt,
          JSON.stringify(metric.citations)
        ]
      );
    }

    await client.query("commit");
    return await loadCompanyMemory(write.identity.companyId);
  } catch (error) {
    await client.query("rollback");
    logger.warn("company_memory.pg_failed", {
      companyId: write.identity.companyId,
      error: error instanceof Error ? error.message : String(error)
    });
    return rememberInProcess(write);
  } finally {
    client.release();
  }
}

async function loadCompanyMemory(companyId: string): Promise<CompanyMemorySummary> {
  const pool = createPgPool();
  if (!pool) {
    const summary = inProcessMemory.get(companyId);
    if (!summary) throw new Error(`Company memory not found for ${companyId}.`);
    return summary;
  }

  const [company, filings, risks, claims, metrics] = await Promise.all([
    pool.query(`select id, name, updated_at from companies where id = $1`, [companyId]),
    pool.query(
      `select document_id, filename, kind, processed_at
       from company_filings where company_id = $1 order by processed_at desc limit 12`,
      [companyId]
    ),
    pool.query(
      `select theme, label, first_seen_document_id, last_seen_document_id, occurrence_count, last_seen_at, citations
       from company_risks where company_id = $1 order by occurrence_count desc, last_seen_at desc limit 12`,
      [companyId]
    ),
    pool.query(
      `select id, claim, polarity, first_seen_document_id, last_seen_document_id, occurrence_count, last_seen_at, citations
       from company_claims where company_id = $1 order by last_seen_at desc limit 12`,
      [companyId]
    ),
    pool.query(
      `select label, value, period, first_seen_document_id, last_seen_document_id, occurrence_count, last_seen_at, citations
       from company_metrics where company_id = $1 order by last_seen_at desc limit 18`,
      [companyId]
    )
  ]);
  const companyRow = company.rows[0];
  const latest = filings.rows[0];

  return {
    companyId,
    companyName: companyRow?.name ?? "Unknown Company",
    filingCount: filings.rows.length,
    latestDocumentId: latest?.document_id ?? "",
    latestDocumentFilename: latest?.filename ?? "",
    lastUpdatedAt: toIso(companyRow?.updated_at),
    pastFilings: filings.rows.map((row) => ({
      documentId: row.document_id,
      filename: row.filename,
      kind: row.kind as DocumentKind,
      processedAt: toIso(row.processed_at)
    })),
    recurringRisks: risks.rows.map((row) => ({
      theme: row.theme,
      label: row.label,
      firstSeenDocumentId: row.first_seen_document_id,
      lastSeenDocumentId: row.last_seen_document_id,
      occurrenceCount: row.occurrence_count,
      lastSeenAt: toIso(row.last_seen_at),
      citations: parseCitations(row.citations)
    })),
    managementClaims: claims.rows.map((row) => ({
      id: row.id,
      claim: row.claim,
      polarity: row.polarity,
      firstSeenDocumentId: row.first_seen_document_id,
      lastSeenDocumentId: row.last_seen_document_id,
      occurrenceCount: row.occurrence_count,
      lastSeenAt: toIso(row.last_seen_at),
      citations: parseCitations(row.citations)
    })),
    historicalMetrics: metrics.rows.map((row) => ({
      label: row.label,
      value: row.value,
      period: row.period ?? undefined,
      firstSeenDocumentId: row.first_seen_document_id,
      lastSeenDocumentId: row.last_seen_document_id,
      occurrenceCount: row.occurrence_count,
      lastSeenAt: toIso(row.last_seen_at),
      citations: parseCitations(row.citations)
    }))
  };
}

function rememberInProcess(write: MemoryWrite): CompanyMemorySummary {
  const existing = inProcessMemory.get(write.identity.companyId);
  const pastFilings = upsertFiling(existing?.pastFilings ?? [], write.filing);
  const summary: CompanyMemorySummary = {
    companyId: write.identity.companyId,
    companyName: write.identity.companyName,
    filingCount: pastFilings.length,
    latestDocumentId: write.filing.documentId,
    latestDocumentFilename: write.filing.filename,
    lastUpdatedAt: write.filing.processedAt,
    pastFilings,
    recurringRisks: mergeRiskMemory(existing?.recurringRisks ?? [], write.risks),
    managementClaims: mergeClaimMemory(existing?.managementClaims ?? [], write.claims),
    historicalMetrics: mergeMetricMemory(existing?.historicalMetrics ?? [], write.metrics)
  };
  inProcessMemory.set(write.identity.companyId, summary);
  return summary;
}

function upsertFiling(existing: FilingMemory[], filing: FilingMemory) {
  return [filing, ...existing.filter((item) => item.documentId !== filing.documentId)]
    .sort((a, b) => b.processedAt.localeCompare(a.processedAt))
    .slice(0, 12);
}

function mergeRiskMemory(existing: CompanyMemoryRisk[], incoming: CompanyMemoryRisk[]) {
  const map = new Map(existing.map((risk) => [risk.theme, risk]));
  for (const risk of incoming) {
    const current = map.get(risk.theme);
    map.set(risk.theme, current ? mergeRisk(current, risk) : risk);
  }
  return Array.from(map.values()).sort((a, b) => b.occurrenceCount - a.occurrenceCount).slice(0, 12);
}

function mergeClaimMemory(existing: CompanyMemoryClaim[], incoming: CompanyMemoryClaim[]) {
  const map = new Map(existing.map((claim) => [claim.id, claim]));
  for (const claim of incoming) {
    const current = map.get(claim.id);
    map.set(claim.id, current ? mergeClaim(current, claim) : claim);
  }
  return Array.from(map.values()).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, 12);
}

function mergeMetricMemory(existing: CompanyMemoryMetric[], incoming: CompanyMemoryMetric[]) {
  const key = (metric: CompanyMemoryMetric) => `${normalizeKey(metric.label)}:${metric.value}:${normalizeKey(metric.period ?? "")}`;
  const map = new Map(existing.map((metric) => [key(metric), metric]));
  for (const metric of incoming) {
    const current = map.get(key(metric));
    map.set(key(metric), current ? mergeMetric(current, metric) : metric);
  }
  return Array.from(map.values()).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, 18);
}

function mergeRisk(current: CompanyMemoryRisk, incoming: CompanyMemoryRisk): CompanyMemoryRisk {
  const sameDocument = current.lastSeenDocumentId === incoming.lastSeenDocumentId;
  return {
    ...current,
    lastSeenDocumentId: incoming.lastSeenDocumentId,
    occurrenceCount: sameDocument ? current.occurrenceCount : current.occurrenceCount + incoming.occurrenceCount,
    lastSeenAt: incoming.lastSeenAt,
    citations: mergeCitations(incoming.citations, current.citations).slice(0, 6)
  };
}

function mergeClaim(current: CompanyMemoryClaim, incoming: CompanyMemoryClaim): CompanyMemoryClaim {
  const sameDocument = current.lastSeenDocumentId === incoming.lastSeenDocumentId;
  return {
    ...current,
    claim: incoming.claim,
    lastSeenDocumentId: incoming.lastSeenDocumentId,
    occurrenceCount: sameDocument ? current.occurrenceCount : current.occurrenceCount + incoming.occurrenceCount,
    lastSeenAt: incoming.lastSeenAt,
    citations: mergeCitations(incoming.citations, current.citations).slice(0, 4)
  };
}

function mergeMetric(current: CompanyMemoryMetric, incoming: CompanyMemoryMetric): CompanyMemoryMetric {
  const sameDocument = current.lastSeenDocumentId === incoming.lastSeenDocumentId;
  return {
    ...current,
    lastSeenDocumentId: incoming.lastSeenDocumentId,
    occurrenceCount: sameDocument ? current.occurrenceCount : current.occurrenceCount + incoming.occurrenceCount,
    lastSeenAt: incoming.lastSeenAt,
    citations: mergeCitations(incoming.citations, current.citations).slice(0, 4)
  };
}

function cleanCompanyName(value: string) {
  const cleaned = value
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(10 k|10 q|8 k|earnings|call|transcript|annual|quarterly|report|fy|q[1-4]|20\d{2})\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return titleCase(cleaned || value.replace(/\.[^.]+$/, ""));
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => (word.length <= 4 && word === word.toUpperCase() ? word : word[0]?.toUpperCase() + word.slice(1)))
    .join(" ");
}

function normalizeKey(value: string) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function mergeCitations(a: EvidenceCitation[], b: EvidenceCitation[]) {
  const seen = new Set<string>();
  return [...a, ...b].filter((citation) => {
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
