import type { EvidenceCitation } from "@/lib/types";
import type { DocumentChunk } from "@/parsers/types";
import { cosineSimilarity, embedTexts } from "@/retrieval/embeddings";
import { rankEvidence } from "@/retrieval/ranking";

export type RetrievedEvidence = {
  chunk: DocumentChunk;
  score: number;
  keywordScore?: number;
  semanticScore?: number;
  rankingSignals?: string[];
};

export type VectorStore = {
  upsertChunks(chunks: DocumentChunk[], embeddings: number[][]): Promise<void>;
  search(
    query: string,
    limit: number,
    filter?: { documentId?: string; minScore?: number; section?: string }
  ): Promise<RetrievedEvidence[]>;
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

  async search(query: string, limit: number, filter?: { documentId?: string; minScore?: number; section?: string }) {
    const [queryEmbedding] = await embedTexts([query]);
    const candidates = this.chunks
      .filter((item) => !filter?.documentId || item.chunk.documentId === filter.documentId)
      .filter((item) => !filter?.section || item.chunk.section === filter.section)
      .map((item) => ({
        chunk: item.chunk,
        score: cosineSimilarity(queryEmbedding, item.embedding),
        semanticScore: cosineSimilarity(queryEmbedding, item.embedding)
      }));

    return rankEvidence(query, candidates, {
      limit,
      minScore: filter?.minScore,
      diversityBySection: true
    });
  }
}

export function evidenceToCitation(evidence: RetrievedEvidence): EvidenceCitation {
  return {
    id: evidence.chunk.id,
    documentId: evidence.chunk.documentId,
    documentKind: evidence.chunk.documentKind,
    sourceFile: evidence.chunk.sourceFile,
    section: evidence.chunk.section,
    page: evidence.chunk.page,
    pageEnd: evidence.chunk.pageEnd,
    timestamp: evidence.chunk.timestamp,
    excerpt: evidence.chunk.text.slice(0, 900),
    relevanceScore: Number(evidence.score.toFixed(3)),
    chunkIndex: evidence.chunk.index,
    charStart: evidence.chunk.charStart,
    charEnd: evidence.chunk.charEnd
  };
}
