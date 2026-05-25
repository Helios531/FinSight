import { runBearAgent } from "@/agents/bear";
import { runBullAgent } from "@/agents/bull";
import { runRefereeAgent } from "@/agents/referee";
import { runRiskAgent } from "@/agents/risk";
import { validateAnalysisReport } from "@/agents/validation";
import type { AnalysisReport } from "@/lib/types";
import type { ParsedDocument } from "@/parsers/types";
import { evidenceToCitation, type VectorStore } from "@/retrieval/store";
import { extractStructuredFinancials, structuredMetricsToKeyMetrics } from "@/verification/financial-extraction";
import { extractKeyMetrics } from "@/verification/numbers";

export async function runAnalysisWorkflow({
  document,
  store,
  chunkCount
}: {
  document: ParsedDocument;
  store: VectorStore;
  chunkCount: number;
}): Promise<AnalysisReport> {
  const metricEvidence = await store.search(
    "income statement balance sheet cash flow revenue margin debt assets liabilities guidance outlook risk factors liquidity eps percentage growth decrease increase",
    16,
    { documentId: document.id, minScore: 0.16 }
  );
  const structuredFinancials = extractStructuredFinancials(metricEvidence);
  const keyMetrics = mergeKeyMetrics([
    ...structuredMetricsToKeyMetrics(structuredFinancials),
    ...extractKeyMetrics(metricEvidence)
  ]);
  const context = {
    documentId: document.id,
    filename: document.filename,
    store,
    structuredMetrics: keyMetrics
  };

  const [bull, bear, risk] = await Promise.all([
    runBullAgent(context),
    runBearAgent(context),
    runRiskAgent(context)
  ]);

  return validateAnalysisReport(runRefereeAgent({
    input: {
      bull,
      bear,
      risk,
      citations: metricEvidence.map(evidenceToCitation)
    },
    keyMetrics,
    document: {
      id: document.id,
      filename: document.filename,
      kind: document.kind,
      chunkCount,
      pageCount: document.pageCount,
      parserDiagnostics: document.metadata.diagnostics.map((diagnostic) => diagnostic.message),
      processedAt: new Date().toISOString()
    },
    startedAt: Date.now()
  }));
}

function mergeKeyMetrics(metrics: ReturnType<typeof extractKeyMetrics>) {
  const seen = new Set<string>();
  return metrics.filter((metric) => {
    const key = `${metric.label}:${metric.value}:${metric.citations[0]?.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}
