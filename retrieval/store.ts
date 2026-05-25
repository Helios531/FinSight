import type { EvidenceCitation } from "@/lib/types";
import type { DocumentChunk } from "@/parsers/types";
import { cosineSimilarity, embedTexts } from "@/retrieval/embeddings";

export type RetrievedEvidence = {
  chunk: DocumentChunk;
  score: number;
};

export type VectorStore = {
  upsertChunks(chunks: DocumentChunk[], embeddings: number[][]): Promise<void>;
  search(query: string, limit: number, filter?: { documentId?: string }): Promise<RetrievedEvidence[]>;
};

type StoredChunk = {
  chunk: DocumentChunk;
  embedding: number[];
};

export class InMemoryVectorStore implements VectorStore {
  private chunks: StoredChunk[] = [];

  async upsertChunks(chunks: DocumentChunk[], embeddings: number[][]) {
    chunks.forEach((chunk, index) => {
      this.chunks.push({ chunk, embedding: embeddings[index] });
    });
  }

  async search(query: string, limit: number, filter?: { documentId?: string }) {
    const [queryEmbedding] = await embedTexts([query]);
    return this.chunks
      .filter((item) => !filter?.documentId || item.chunk.documentId === filter.documentId)
      .map((item) => ({
        chunk: item.chunk,
        score: cosineSimilarity(queryEmbedding, item.embedding)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

export function evidenceToCitation(evidence: RetrievedEvidence): EvidenceCitation {
  return {
    id: evidence.chunk.id,
    documentId: evidence.chunk.documentId,
    sourceFile: evidence.chunk.sourceFile,
    section: evidence.chunk.section,
    page: evidence.chunk.page,
    timestamp: evidence.chunk.timestamp,
    excerpt: evidence.chunk.text.slice(0, 900),
    relevanceScore: Number(evidence.score.toFixed(3))
  };
}
