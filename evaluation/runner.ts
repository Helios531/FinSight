import { runAnalysisWorkflow } from "@/agents/workflow";
import { financialBenchmarks } from "@/evaluation/benchmarks";
import { compareReports, findEvaluationFailures, scoreReport, scoreRetrieval } from "@/evaluation/metrics";
import type { EvaluatedReport, FinancialBenchmarkCase } from "@/evaluation/types";
import { parseUploadedDocument } from "@/parsers/pdf";
import { chunkDocument } from "@/retrieval/chunking";
import { indexChunks } from "@/retrieval/indexing";
import { InMemoryVectorStore } from "@/retrieval/store";

export async function evaluateBenchmark(benchmark: FinancialBenchmarkCase): Promise<EvaluatedReport> {
  const { document, chunks, store } = await prepareBenchmark(benchmark);
  const report = await runAnalysisWorkflow({
    document,
    store,
    chunkCount: chunks.length
  });

  const retrievals = await Promise.all(
    benchmark.expectations.map((expectation) =>
      store.search(expectation.query, 5, {
        documentId: document.id,
        minScore: 0.1
      })
    )
  );
  const scores = {
    ...scoreReport(report, benchmark),
    retrievalRecall: scoreRetrieval(benchmark, retrievals)
  };

  return {
    benchmarkId: benchmark.document.id,
    report,
    scores,
    failures: findEvaluationFailures(report, benchmark, scores)
  };
}

export async function evaluateOutputStability(benchmark: FinancialBenchmarkCase) {
  const first = await evaluateBenchmark(benchmark);
  const second = await evaluateBenchmark(benchmark);
  return compareReports(first.report, second.report);
}

export async function evaluateAllBenchmarks() {
  return Promise.all(financialBenchmarks.map(evaluateBenchmark));
}

async function prepareBenchmark(benchmark: FinancialBenchmarkCase) {
  const file = new File([benchmark.document.content], benchmark.document.filename, { type: "text/plain" });
  const document = await parseUploadedDocument(file, benchmark.document.kind);
  const chunks = chunkDocument(document);
  const store = new InMemoryVectorStore();
  await indexChunks(chunks, store);
  return { document, chunks, store };
}
