import { runBearAgent } from "@/agents/bear";
import { runBullAgent } from "@/agents/bull";
import { runRefereeAgent } from "@/agents/referee";
import { runRiskAgent } from "@/agents/risk";
import type { AnalysisReport } from "@/lib/types";
import type { ParsedDocument } from "@/parsers/types";
import { evidenceToCitation, type VectorStore } from "@/retrieval/store";
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
    "revenue margin cash flow debt liquidity eps percentage growth decrease increase",
    10,
    { documentId: document.id, minScore: 0.16 }
  );
  const keyMetrics = extractKeyMetrics(metricEvidence);
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

  return runRefereeAgent({
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
  });
}
