import { createHash } from "node:crypto";
import { createPgPool } from "@/db/client";
import { env } from "@/lib/config";
import { logger } from "@/lib/logger";
import type {
  AnalysisReport,
  EvidenceCitation,
  PredictiveRiskSignal,
  PredictiveRiskSignalType,
  PredictiveRiskSummary,
  WatchlistAlertSeverity
} from "@/lib/types";

const inProcessPredictiveRuns = new Map<string, PredictiveRiskSummary>();

export async function createPredictiveRiskSummary(report: AnalysisReport): Promise<PredictiveRiskSummary> {
  const summary = buildPredictiveRiskSummary(report);
  const saved = env.DATABASE_URL ? await savePredictiveRiskWithPg(summary) : saveInProcess(summary);

  logger.info("predictive_risk.updated", {
    id: saved.id,
    documentId: saved.documentId,
    overallRisk: saved.overallRisk,
    score: saved.score,
    signalCount: saved.signals.length
  });

  return saved;
}

export function buildPredictiveRiskSummary(report: AnalysisReport): PredictiveRiskSummary {
  const signals = [
    deterioratingFundamentals(report),
    fraudIndicator(report),
    liquidityStress(report),
    narrativeInconsistency(report)
  ].filter((signal): signal is PredictiveRiskSignal => Boolean(signal));
  const score = Math.min(100, Math.round(signals.reduce((sum, signal) => sum + severityScore(signal), 0)));
  const overallRisk = score >= 70 ? "high" : score >= 35 ? "medium" : "info";

  return {
    id: `predictive_${stableHash(`${report.document.id}:${score}:${signals.map((signal) => signal.id).join("|")}`).slice(0, 24)}`,
    documentId: report.document.id,
    generatedAt: report.document.processedAt,
    overallRisk,
    score,
    signals,
    limitations: [
      "Predictive signals are early-warning indicators, not forecasts.",
      "Signals are generated only from cited analysis, extracted metrics, debate diagnostics, memory, and graph relationships.",
      ...(signals.length === 0 ? ["No advanced risk signal crossed the deterministic threshold."] : [])
    ]
  };
}

function deterioratingFundamentals(report: AnalysisReport): PredictiveRiskSignal | null {
  const negativeMetrics = report.keyMetrics.filter((metric) =>
    /declin|decrease|lower|loss|negative|burn|pressure/i.test(`${metric.label} ${metric.value} ${metric.verification.explanation}`)
  );
  const riskText = joinedRiskText(report);
  const drivers = [
    ...negativeMetrics.map((metric) => `${metric.label}: ${metric.value}`),
    ...matchDrivers(riskText, ["margin pressure", "demand soft", "expense increase", "cash burn", "loss"])
  ];
  if (drivers.length < 2) return null;

  const citations = uniqueCitations([
    ...negativeMetrics.flatMap((metric) => metric.citations),
    ...report.riskAnalysis.flatMap((claim) => claim.citations)
  ]).slice(0, 6);
  return signal({
    report,
    type: "deteriorating_fundamentals",
    severity: drivers.length >= 4 ? "high" : "medium",
    confidence: citations.length > 0 ? 0.72 : 0.42,
    title: "Deteriorating fundamentals signal",
    rationale: "Multiple metric or risk indicators point to operating deterioration.",
    drivers,
    citations
  });
}

function fraudIndicator(report: AnalysisReport): PredictiveRiskSignal | null {
  const text = allClaimText(report);
  const drivers = matchDrivers(text, [
    "material weakness",
    "internal control",
    "restatement",
    "accounting estimate",
    "impairment",
    "non-gaap",
    "adjusted",
    "investigation"
  ]);
  if (drivers.length < 2) return null;

  const citations = citationsForText(report, drivers).slice(0, 6);
  return signal({
    report,
    type: "fraud_indicator",
    severity: drivers.some((driver) => /material weakness|restatement|investigation/i.test(driver)) ? "high" : "medium",
    confidence: citations.length > 0 ? 0.68 : 0.38,
    title: "Accounting or fraud-risk indicator",
    rationale: "Accounting, control, adjustment, or investigation language requires review for potential reporting quality risk.",
    drivers,
    citations
  });
}

function liquidityStress(report: AnalysisReport): PredictiveRiskSignal | null {
  const text = allClaimText(report);
  const drivers = matchDrivers(text, [
    "liquidity",
    "debt",
    "refinancing",
    "covenant",
    "cash burn",
    "maturity",
    "going concern",
    "working capital"
  ]);
  const graphLiquidityEdges = report.knowledgeGraph?.edges.filter((edge) =>
    /liquidity|debt|refinancing|rates/.test(`${edge.sourceId} ${edge.targetId}`)
  ).length ?? 0;
  if (drivers.length + graphLiquidityEdges < 2) return null;

  const citations = citationsForText(report, drivers).slice(0, 6);
  return signal({
    report,
    type: "liquidity_stress",
    severity: drivers.some((driver) => /going concern|covenant|refinancing/i.test(driver)) ? "high" : "medium",
    confidence: citations.length > 0 ? 0.76 : 0.4,
    title: "Liquidity stress signal",
    rationale: "Debt, cash, refinancing, or working-capital language indicates possible liquidity pressure.",
    drivers: [...drivers, ...(graphLiquidityEdges > 0 ? [`${graphLiquidityEdges} graph relationship(s) connect the company to liquidity or rates exposure.`] : [])],
    citations
  });
}

function narrativeInconsistency(report: AnalysisReport): PredictiveRiskSignal | null {
  const highContradiction = report.disagreements.filter((item) => item.contradictionScore >= 0.45);
  const debateDrivers = report.debateAssessment.findings.filter((finding) => /contradiction|consensus|evidence/i.test(finding));
  const drivers = [
    ...highContradiction.map((item) => `${item.issue}: contradiction ${Math.round(item.contradictionScore * 100)}%`),
    ...debateDrivers,
    ...(report.crossCompany?.limitations ?? []).filter((item) => /classification|overlapping|comparison/i.test(item))
  ];
  if (drivers.length < 1 || report.debateAssessment.contradictionScore < 0.4) return null;

  const citations = uniqueCitations(highContradiction.flatMap((item) => item.citations)).slice(0, 6);
  return signal({
    report,
    type: "narrative_inconsistency",
    severity: report.debateAssessment.contradictionScore >= 0.65 ? "high" : "medium",
    confidence: citations.length > 0 ? 0.7 : 0.45,
    title: "Narrative inconsistency signal",
    rationale: "Bull, bear, or risk narratives conflict enough to require analyst reconciliation.",
    drivers,
    citations
  });
}

function signal({
  report,
  type,
  severity,
  confidence,
  title,
  rationale,
  drivers,
  citations
}: {
  report: AnalysisReport;
  type: PredictiveRiskSignalType;
  severity: WatchlistAlertSeverity;
  confidence: number;
  title: string;
  rationale: string;
  drivers: string[];
  citations: EvidenceCitation[];
}): PredictiveRiskSignal {
  return {
    id: `${type}_${stableHash(`${report.document.id}:${title}:${drivers.join("|")}`).slice(0, 20)}`,
    type,
    severity,
    confidence,
    title,
    rationale,
    drivers: Array.from(new Set(drivers)).slice(0, 8),
    citations: uniqueCitations(citations).slice(0, 6)
  };
}

async function savePredictiveRiskWithPg(summary: PredictiveRiskSummary): Promise<PredictiveRiskSummary> {
  const pool = createPgPool();
  if (!pool) return saveInProcess(summary);
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      `insert into predictive_risk_runs (id, document_id, generated_at, overall_risk, score, limitations)
       values ($1, $2, $3, $4, $5, $6::jsonb)
       on conflict (id) do update set score = excluded.score, limitations = excluded.limitations`,
      [summary.id, summary.documentId, summary.generatedAt, summary.overallRisk, summary.score, JSON.stringify(summary.limitations)]
    );
    for (const item of summary.signals) {
      await client.query(
        `insert into predictive_risk_signals (
          id, run_id, signal_type, severity, confidence, title, rationale, drivers, citations
        ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
        on conflict (id) do update set
          severity = excluded.severity,
          confidence = excluded.confidence,
          rationale = excluded.rationale,
          drivers = excluded.drivers,
          citations = excluded.citations`,
        [
          item.id,
          summary.id,
          item.type,
          item.severity,
          item.confidence,
          item.title,
          item.rationale,
          JSON.stringify(item.drivers),
          JSON.stringify(item.citations)
        ]
      );
    }
    await client.query("commit");
    return summary;
  } catch (error) {
    await client.query("rollback");
    logger.warn("predictive_risk.pg_failed", {
      id: summary.id,
      error: error instanceof Error ? error.message : String(error)
    });
    return saveInProcess(summary);
  } finally {
    client.release();
  }
}

function saveInProcess(summary: PredictiveRiskSummary) {
  inProcessPredictiveRuns.set(summary.id, summary);
  return summary;
}

function severityScore(signal: PredictiveRiskSignal) {
  const severityBase = signal.severity === "high" ? 30 : signal.severity === "medium" ? 18 : 8;
  return severityBase * signal.confidence;
}

function joinedRiskText(report: AnalysisReport) {
  return report.riskAnalysis.map((claim) => `${claim.title} ${claim.claim} ${claim.caveats.join(" ")}`).join(" ").toLowerCase();
}

function allClaimText(report: AnalysisReport) {
  return [
    ...report.executiveSummary,
    ...report.bullCase,
    ...report.bearCase,
    ...report.riskAnalysis
  ].map((claim) => `${claim.title} ${claim.claim} ${claim.caveats.join(" ")}`).join(" ").toLowerCase();
}

function matchDrivers(text: string, phrases: string[]) {
  return phrases.filter((phrase) => text.includes(phrase.toLowerCase()));
}

function citationsForText(report: AnalysisReport, drivers: string[]) {
  const normalizedDrivers = drivers.map((driver) => driver.toLowerCase());
  return uniqueCitations([
    ...report.citations,
    ...report.riskAnalysis.flatMap((claim) => claim.citations),
    ...report.bearCase.flatMap((claim) => claim.citations)
  ]).filter((citation) => normalizedDrivers.some((driver) => citation.excerpt.toLowerCase().includes(driver)));
}

function uniqueCitations(citations: EvidenceCitation[]) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    if (seen.has(citation.id)) return false;
    seen.add(citation.id);
    return true;
  });
}

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
