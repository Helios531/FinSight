import { insertDocumentRecord, PgVectorStore } from "@/db/vector-store";
import { env, hasOpenAi } from "@/lib/config";
import { logger } from "@/lib/logger";
import type { DocumentKind } from "@/lib/types";
import { parseUploadedDocument } from "@/parsers/pdf";
import { chunkDocument } from "@/retrieval/chunking";
import { indexChunks } from "@/retrieval/indexing";
import { InMemoryVectorStore } from "@/retrieval/store";
import { runAnalysisWorkflow } from "@/agents/workflow";

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

  const index = await indexChunks(chunks, store);
  const report = await runAnalysisWorkflow({
    document,
    store,
    chunkCount: chunks.length
  });

  logger.info("document.analysis_completed", {
    documentId: document.id,
    filename: document.filename,
    chunkCount: chunks.length,
    embeddingDimensions: index.embeddingDimensions,
    store: usePgVector ? "pgvector" : "memory",
    confidence: report.confidence.score
  });

  return report;
}
