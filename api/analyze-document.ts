import { insertDocumentRecord, PgVectorStore } from "@/db/vector-store";
import { env, hasOpenAi } from "@/lib/config";
import { logger } from "@/lib/logger";
import type { DocumentKind } from "@/lib/types";
import { parseUploadedDocument } from "@/parsers/pdf";
import { chunkDocument } from "@/retrieval/chunking";
import { indexChunks } from "@/retrieval/indexing";
import { InMemoryVectorStore } from "@/retrieval/store";
import { runAnalysisWorkflow } from "@/agents/workflow";
import { rememberCompanyAnalysis } from "@/memory/company";
import { updateWatchlistForAnalysis } from "@/memory/watchlist";

export async function analyzeUploadedDocument(file: File, kind: DocumentKind) {
  const document = await parseUploadedDocument(file, kind);
  const chunks = chunkDocument(document);
  const usePgVector = Boolean(env.DATABASE_URL && hasOpenAi);
  const store = usePgVector ? new PgVectorStore() : new InMemoryVectorStore();

  await insertDocumentRecord({
    id: document.id,
    filename: document.filename,
    kind: document.kind,
    pageCount: document.pageCount
  });

  logger.info("document.parsed", {
    documentId: document.id,
    filename: document.filename,
    kind: document.kind,
    parser: document.metadata.parser,
    pageCount: document.pageCount,
    byteLength: document.metadata.byteLength,
    diagnostics: document.metadata.diagnostics
  });

  const index = await indexChunks(chunks, store);
  const report = await runAnalysisWorkflow({
    document,
    store,
    chunkCount: chunks.length
  });
  report.companyMemory = await rememberCompanyAnalysis({ document, report });
  report.watchlist = await updateWatchlistForAnalysis({
    document,
    report,
    memory: report.companyMemory
  });

  logger.info("document.analysis_completed", {
    documentId: document.id,
    filename: document.filename,
    chunkCount: chunks.length,
    embeddingDimensions: index.embeddingDimensions,
    store: usePgVector ? "pgvector" : "memory",
    confidence: report.confidence.score,
    companyId: report.companyMemory.companyId,
    companyFilingCount: report.companyMemory.filingCount,
    watchlistAlerts: report.watchlist.alertCount
  });

  return report;
}
