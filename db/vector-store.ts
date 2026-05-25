import { createPgPool } from "@/db/client";
import type { DocumentChunk } from "@/parsers/types";
import { embedTexts } from "@/retrieval/embeddings";
import type { RetrievedEvidence, VectorStore } from "@/retrieval/store";

export class PgVectorStore implements VectorStore {
  private pool = createPgPool();

  async upsertChunks(chunks: DocumentChunk[], embeddings: number[][]) {
    if (!this.pool) throw new Error("DATABASE_URL is required for PgVectorStore.");
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        await client.query(
          `insert into document_chunks (
            id, document_id, source_file, section, page, timestamp,
            chunk_index, token_estimate, content, embedding
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector)
          on conflict (id) do update set content = excluded.content, embedding = excluded.embedding`,
          [
            chunk.id,
            chunk.documentId,
            chunk.sourceFile,
            chunk.section,
            chunk.page ?? null,
            chunk.timestamp ?? null,
            chunk.index,
            chunk.tokenEstimate,
            chunk.text,
            toVectorLiteral(embeddings[index])
          ]
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async search(query: string, limit: number, filter?: { documentId?: string }): Promise<RetrievedEvidence[]> {
    if (!this.pool) throw new Error("DATABASE_URL is required for PgVectorStore.");
    const [embedding] = await embedTexts([query]);
    const result = await this.pool.query(
      `select id, document_id, source_file, section, page, timestamp, chunk_index,
        token_estimate, content, 1 - (embedding <=> $1::vector) as score
       from document_chunks
       where ($2::uuid is null or document_id = $2::uuid)
       order by embedding <=> $1::vector
       limit $3`,
      [toVectorLiteral(embedding), filter?.documentId ?? null, limit]
    );

    return result.rows.map((row) => ({
      score: Number(row.score),
      chunk: {
        id: row.id,
        documentId: row.document_id,
        sourceFile: row.source_file,
        section: row.section,
        page: row.page ?? undefined,
        timestamp: row.timestamp ?? undefined,
        index: row.chunk_index,
        tokenEstimate: row.token_estimate,
        text: row.content
      }
    }));
  }
}

export async function insertDocumentRecord(document: {
  id: string;
  filename: string;
  kind: string;
  pageCount?: number;
}) {
  const pool = createPgPool();
  if (!pool) return;

  await pool.query(
    `insert into documents (id, filename, kind, page_count)
     values ($1, $2, $3, $4)
     on conflict (id) do nothing`,
    [document.id, document.filename, document.kind, document.pageCount ?? null]
  );
}

function toVectorLiteral(vector: number[]) {
  return `[${vector.map((value) => Number(value.toFixed(8))).join(",")}]`;
}
