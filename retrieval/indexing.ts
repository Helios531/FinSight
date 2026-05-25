import type { DocumentChunk } from "@/parsers/types";
import { embedTexts } from "@/retrieval/embeddings";
import type { VectorStore } from "@/retrieval/store";

export async function indexChunks(chunks: DocumentChunk[], store: VectorStore) {
  const embeddings = await embedTexts(chunks.map((chunk) => chunk.text));
  await store.upsertChunks(chunks, embeddings);
  return {
    chunkCount: chunks.length,
    embeddingDimensions: embeddings[0]?.length ?? 0
  };
}
