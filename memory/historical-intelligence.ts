import { createHash } from "node:crypto";
import { createPgPool } from "@/db/client";
import { env } from "@/lib/config";
import { logger } from "@/lib/logger";
import type {
  AnalysisReport,
  CompanyMemoryMetric,
  EvidenceCitation,
  HistoricalChangeSignal,
  HistoricalChangeSignalType,
  HistoricalIntelligenceSummary,
  WatchlistAlertSeverity
} from "@/lib/types";

const inProcessHistoricalIntelligence = new Map<string, HistoricalIntelligenceSummary>();

const riskThemePatterns = [
  { theme: "liquidity", label: "Liquidity risk", pattern: /\bliquidity|cash runway|working capital\b/i },
  { theme: "debt_refinancing", label: "Debt and refinancing risk", pattern: /\bdebt|refinanc|covenant|maturit|leverage\b/i },
  { theme: "inventory", label: "Inventory concern", pattern: /\binventory|channel stock|obsolete\b/i },
  { theme: "supply_chain", label: "Supply chain risk", pattern: /\bsupply chain|supplier|component|logistics\b/i },
  { theme: "margin_pressure", label: "Margin pressure", pattern: /\bmargin|pricing pressure|cost pressure|gross profit\b/i },
  { theme: "regulatory", label: "Regulatory risk", pattern: /\bregulat|compliance|investigation|sanction\b/i },
  { theme: "customer_concentration", label: "Customer concentration risk", pattern: /\bcustomer concentration|top customer|concentrat/i }
];

const negativeGuidanceTerms = /\blower|lowered|reduce|reduced|cut|down|decrease|declin|pressure|below|weaker/i;
const guidanceTerms = /\bguidance|outlook|forecast|expect|target|margin guide|revenue guide/i;
const higherIsBetterMetric = /\brevenue|sales|gross profit|margin|operating income|net income|eps|cash flow|free cash flow|cash\b/i;

export async function createHistoricalIntelligence(report: AnalysisReport): Promise<HistoricalIntelligenceSummary> {
  const summary = buildHistoricalIntelligence(report);
  const saved = env.DATABASE_URL ? await saveHistoricalIntelligenceWithPg(summary) : saveInProcess(summary);

  logger.info("historical_intelligence.updated", {
    id: saved.id,
    documentId: saved.documentId,
    companyId: saved.companyId,
    priorFilingCount: saved.priorFilingCount,
    signalCount: saved.signals.length
  });

  return saved;
}

export function buildHistoricalIntelligence(report: AnalysisReport): HistoricalIntelligenceSummary {
  const memory = report.companyMemory;
  const previousGuidance = memory?.historicalMetrics
    .filter((metric) => metric.lastSeenDocumentId !== report.document.id)
    .filter(isGuidanceMetric)
    .slice(0, 8) ?? [];
  const historicalRisks = memory?.recurringRisks.slice(0, 8) ?? [];
  const recurringNarratives = memory?.managementClaims.filter((claim) => claim.occurrenceCount > 1).slice(0, 8) ?? [];
  const signals = memory
    ? [
      ...newRiskSignals(report),
      ...recurringRiskSignals(report),
      ...guidanceSignals(report, previousGuidance),
      ...metricDeteriorationSignals(report),
      ...narrativePatternSignals(report)
    ]
    : [];
  const limitations = [
    ...(memory ? [] : ["Company memory is unavailable, so historical intelligence could not compare prior filings."]),
    ...((memory?.filingCount ?? 0) < 2 ? ["Historical signals are limited until at least two filings are remembered."] : []),
    ...(signals.some((signal) => signal.citations.length === 0)
      ? ["Some historical signals have limited citation coverage and should be reviewed before use."]
      : [])
  ];

  return {
    id: `hist_${stableHash(`${report.document.id}:${memory?.companyId ?? "unknown"}:${signals.map((signal) => signal.id).join("|")}`).slice(0, 24)}`,
    companyId: memory?.companyId,
    documentId: report.document.id,
    generatedAt: report.document.processedAt,
    priorFilingCount: Math.max(0, (memory?.filingCount ?? 0) - 1),
    previousGuidance,
    historicalRisks,
    recurringNarratives,
    signals: dedupeSignals(signals).slice(0, 12),
    limitations
  };
}

function newRiskSignals(report: AnalysisReport): HistoricalChangeSignal[] {
  const currentRiskText = report.riskAnalysis.map((claim) => `${claim.title} ${claim.claim}`).join(" ");
  const memory = report.companyMemory;
  if (!memory) return [];
  const knownRecurring = new Set(memory.recurringRisks.filter((risk) => risk.occurrenceCount > 1).map((risk) => risk.theme));

  return riskThemePatterns.flatMap((theme) => {
    if (!theme.pattern.test(currentRiskText) || knownRecurring.has(theme.theme)) return [];
    const citations = citationsForPattern(report.riskAnalysis, theme.pattern);
    return [
      changeSignal({
        documentId: report.document.id,
        type: "new_risk",
        severity: "medium",
        title: `${theme.label} appeared`,
        summary: `${theme.label} appears in the current analysis but is not yet a recurring company-memory risk.`,
        citations
      })
    ];
  });
}

function recurringRiskSignals(report: AnalysisReport): HistoricalChangeSignal[] {
  return (report.companyMemory?.recurringRisks ?? [])
    .filter((risk) => risk.occurrenceCount > 1)
    .slice(0, 5)
    .map((risk) =>
      changeSignal({
        documentId: report.document.id,
        type: "recurring_risk",
        severity: risk.occurrenceCount >= 3 ? "high" : "medium",
        title: `${risk.label} is recurring`,
        summary: `${risk.label} has appeared across ${risk.occurrenceCount} remembered filing or analysis cycle(s).`,
        citations: risk.citations
      })
    );
}

function guidanceSignals(report: AnalysisReport, guidanceHistory: CompanyMemoryMetric[]): HistoricalChangeSignal[] {
  const currentGuidance = report.keyMetrics.filter(isGuidanceMetric);
  const priorGuidance = guidanceHistory.filter((metric) => metric.lastSeenDocumentId !== report.document.id);
  const lowered = currentGuidance.filter((metric) => negativeGuidanceTerms.test(`${metric.label} ${metric.value} ${metric.verification.explanation}`));
  const priorLowered = priorGuidance.filter((metric) => negativeGuidanceTerms.test(`${metric.label} ${metric.value}`));

  if (lowered.length === 0 && priorLowered.length < 2) return [];

  const citations = uniqueCitations([
    ...lowered.flatMap((metric) => metric.citations),
    ...priorLowered.flatMap((metric) => metric.citations)
  ]);
  const streak = lowered.length > 0 ? priorLowered.length + 1 : priorLowered.length;

  return [
    changeSignal({
      documentId: report.document.id,
      type: "guidance_change",
      severity: streak >= 2 ? "high" : "medium",
      title: "Guidance pressure detected",
      summary:
        streak >= 2
          ? `Guidance pressure has appeared in ${streak} remembered period(s), including the current analysis when cited.`
          : "Current guidance language indicates pressure or a downward revision.",
      citations
    })
  ];
}

function metricDeteriorationSignals(report: AnalysisReport): HistoricalChangeSignal[] {
  const memory = report.companyMemory;
  if (!memory) return [];
  const currentMetrics = report.keyMetrics;

  return currentMetrics.flatMap((current) => {
    const currentNumeric = numericValue(current.value);
    if (currentNumeric === undefined || !higherIsBetterMetric.test(current.label)) return [];
    const prior = memory.historicalMetrics.find(
      (metric) => metric.lastSeenDocumentId !== report.document.id && normalize(metric.label) === normalize(current.label)
    );
    const priorNumeric = prior ? numericValue(prior.value) : undefined;
    if (priorNumeric === undefined || currentNumeric >= priorNumeric) return [];
    const percentChange = priorNumeric === 0 ? undefined : (currentNumeric - priorNumeric) / Math.abs(priorNumeric);

    return [
      changeSignal({
        documentId: report.document.id,
        type: "metric_deterioration",
        severity: percentChange !== undefined && percentChange <= -0.1 ? "high" : "medium",
        title: `${current.label} deteriorated versus memory`,
        summary: `${current.label} moved from ${prior?.value} to ${current.value}${percentChange === undefined ? "" : ` (${Math.round(percentChange * 100)}%)`}.`,
        citations: uniqueCitations([...(prior?.citations ?? []), ...current.citations])
      })
    ];
  });
}

function narrativePatternSignals(report: AnalysisReport): HistoricalChangeSignal[] {
  return (report.companyMemory?.managementClaims ?? [])
    .filter((claim) => claim.occurrenceCount > 1)
    .slice(0, 4)
    .map((claim) =>
      changeSignal({
        documentId: report.document.id,
        type: "narrative_pattern",
        severity: claim.polarity === "risk" || claim.polarity === "bear" ? "medium" : "info",
        title: "Recurring management narrative",
        summary: claim.claim,
        citations: claim.citations
      })
    );
}

function changeSignal({
  documentId,
  type,
  severity,
  title,
  summary,
  citations
}: {
  documentId: string;
  type: HistoricalChangeSignalType;
  severity: WatchlistAlertSeverity;
  title: string;
  summary: string;
  citations: EvidenceCitation[];
}): HistoricalChangeSignal {
  return {
    id: `${type}_${stableHash(`${documentId}:${title}:${summary}`).slice(0, 20)}`,
    type,
    severity,
    title,
    summary,
    citations: uniqueCitations(citations).slice(0, 6)
  };
}

async function saveHistoricalIntelligenceWithPg(summary: HistoricalIntelligenceSummary): Promise<HistoricalIntelligenceSummary> {
  const pool = createPgPool();
  if (!pool) return saveInProcess(summary);

  try {
    await pool.query(
      `insert into historical_intelligence_runs (
        id, company_id, document_id, generated_at, prior_filing_count, previous_guidance,
        historical_risks, recurring_narratives, signals, limitations
      ) values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb)
      on conflict (id) do update set
        prior_filing_count = excluded.prior_filing_count,
        previous_guidance = excluded.previous_guidance,
        historical_risks = excluded.historical_risks,
        recurring_narratives = excluded.recurring_narratives,
        signals = excluded.signals,
        limitations = excluded.limitations`,
      [
        summary.id,
        summary.companyId ?? null,
        summary.documentId,
        summary.generatedAt,
        summary.priorFilingCount,
        JSON.stringify(summary.previousGuidance),
        JSON.stringify(summary.historicalRisks),
        JSON.stringify(summary.recurringNarratives),
        JSON.stringify(summary.signals),
        JSON.stringify(summary.limitations)
      ]
    );
    return summary;
  } catch (error) {
    logger.warn("historical_intelligence.pg_failed", {
      id: summary.id,
      error: error instanceof Error ? error.message : String(error)
    });
    return saveInProcess(summary);
  }
}

function saveInProcess(summary: HistoricalIntelligenceSummary) {
  inProcessHistoricalIntelligence.set(summary.id, summary);
  return summary;
}

function citationsForPattern(claims: AnalysisReport["riskAnalysis"], pattern: RegExp) {
  return uniqueCitations(
    claims
      .filter((claim) => pattern.test(`${claim.title} ${claim.claim}`))
      .flatMap((claim) => claim.citations)
  );
}

function isGuidanceMetric(metric: { label: string; value: string; period?: string }) {
  return guidanceTerms.test(`${metric.label} ${metric.value} ${metric.period ?? ""}`);
}

function numericValue(value: string) {
  const lower = value.toLowerCase();
  const match = value.match(/-?\d+(?:,\d{3})*(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number.parseFloat(match[0].replace(/,/g, ""));
  const scale = lower.includes("billion") || lower.includes("bn") ? 1_000_000_000 : lower.includes("million") || lower.includes("m") ? 1_000_000 : lower.includes("thousand") || lower.includes("k") ? 1_000 : 1;
  return parsed * scale;
}

function dedupeSignals(signals: HistoricalChangeSignal[]) {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = `${signal.type}:${normalize(signal.title)}`;
    if (seen.has(key)) return false;
    seen.add(key);
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

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
