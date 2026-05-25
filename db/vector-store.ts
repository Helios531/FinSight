import { createPgPool } from "@/db/client";
import type { DocumentChunk } from "@/parsers/types";
import { embedTexts } from "@/retrieval/embeddings";
import { rankEvidence } from "@/retrieval/ranking";
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
            id, document_id, document_kind, source_file, section, page, page_end, timestamp,
            chunk_index, token_estimate, char_start, char_end, has_table_like_content, content, embedding
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::vector)
          on conflict (id) do update set content = excluded.content, embedding = excluded.embedding`,
          [
            chunk.id,
            chunk.documentId,
            chunk.documentKind,
            chunk.sourceFile,
            chunk.section,
            chunk.page ?? null,
            chunk.pageEnd ?? null,
            chunk.timestamp ?? null,
            chunk.index,
            chunk.tokenEstimate,
            chunk.charStart,
            chunk.charEnd,
            chunk.metadata.hasTableLikeContent,
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

  async search(
    query: string,
    limit: number,
    filter?: { documentId?: string; minScore?: number; section?: string }
  ): Promise<RetrievedEvidence[]> {
    if (!this.pool) throw new Error("DATABASE_URL is required for PgVectorStore.");
    const [embedding] = await embedTexts([query]);
    const result = await this.pool.query(
      `select id, document_id, document_kind, source_file, section, page, page_end, timestamp, chunk_index,
        token_estimate, char_start, char_end, has_table_like_content, content, 1 - (embedding <=> $1::vector) as score
       from document_chunks
       where ($2::uuid is null or document_id = $2::uuid)
        and ($4::text is null or section = $4::text)
       order by embedding <=> $1::vector
       limit $3`,
      [toVectorLiteral(embedding), filter?.documentId ?? null, Math.max(limit * 4, 20), filter?.section ?? null]
    );

    const candidates = result.rows.map((row) => ({
      score: Number(row.score),
      semanticScore: Number(row.score),
      chunk: {
        id: row.id,
        documentId: row.document_id,
        documentKind: row.document_kind,
        sourceFile: row.source_file,
        section: row.section,
        page: row.page ?? undefined,
        pageEnd: row.page_end ?? undefined,
        timestamp: row.timestamp ?? undefined,
        index: row.chunk_index,
        tokenEstimate: row.token_estimate,
        charStart: row.char_start,
        charEnd: row.char_end,
        text: row.content,
        metadata: {
          hasTableLikeContent: row.has_table_like_content,
          lineCount: String(row.content).split("\n").length,
          retrievalText: `${row.section}\n${row.content}`.slice(0, 2200)
        }
      }
    }));

    return rankEvidence(query, candidates, {
      limit,
      minScore: filter?.minScore,
      diversityBySection: true
    });
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
