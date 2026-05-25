import { describe, expect, it } from "vitest";
import { enforceGrounding } from "@/agents/grounding";
import { sampleEarningsTranscript, sampleUnsupportedClaim } from "@/evaluation/fixtures";
import type { AgentClaim } from "@/lib/types";
import { parseUploadedDocument } from "@/parsers/pdf";
import { chunkDocument } from "@/retrieval/chunking";
import { indexChunks } from "@/retrieval/indexing";
import { InMemoryVectorStore, type RetrievedEvidence } from "@/retrieval/store";

describe("stabilization quality checks", () => {
  it("creates stable document and chunk ids with required provenance", async () => {
    const file = new File([sampleEarningsTranscript], "sample-transcript.txt", { type: "text/plain" });
    const first = chunkDocument(await parseUploadedDocument(file, "earnings_call"));
    const second = chunkDocument(await parseUploadedDocument(file, "earnings_call"));

    expect(first.map((chunk) => chunk.id)).toEqual(second.map((chunk) => chunk.id));
    expect(first[0]).toMatchObject({
      documentKind: "earnings_call",
      sourceFile: "sample-transcript.txt",
      page: 1,
      section: expect.any(String),
      index: 0
    });
    expect(first[0].charEnd).toBeGreaterThan(first[0].charStart);
  });

  it("retrieves revenue evidence above unrelated risk evidence for a revenue query", async () => {
    const file = new File([sampleEarningsTranscript], "sample-transcript.txt", { type: "text/plain" });
    const document = await parseUploadedDocument(file, "earnings_call");
    const chunks = chunkDocument(document);
    const store = new InMemoryVectorStore();
    await indexChunks(chunks, store);

    const results = await store.search("revenue growth gross margin", 3, { documentId: document.id });

    expect(results[0].chunk.text.toLowerCase()).toContain("revenue");
    expect(results[0].rankingSignals?.length).toBeGreaterThan(0);
  });

  it("rejects unsupported claims even when fallback evidence exists", () => {
    const evidence = fakeEvidence("Revenue increased from $100 million to $118 million.");
    const claim: AgentClaim = {
      id: "claim-1",
      title: "Unsupported market claim",
      claim: sampleUnsupportedClaim,
      polarity: "bull",
      confidence: 0.9,
      citations: [
        {
          id: evidence.chunk.id,
          documentId: evidence.chunk.documentId,
          documentKind: evidence.chunk.documentKind,
          sourceFile: evidence.chunk.sourceFile,
          section: evidence.chunk.section,
          page: evidence.chunk.page,
          pageEnd: evidence.chunk.pageEnd,
          excerpt: evidence.chunk.text,
          relevanceScore: evidence.score,
          chunkIndex: evidence.chunk.index,
          charStart: evidence.chunk.charStart,
          charEnd: evidence.chunk.charEnd
        }
      ],
      caveats: []
    };

    const grounded = enforceGrounding([claim], [evidence]);

    expect(grounded[0].title).toBe("Insufficient retrieved evidence");
    expect(grounded[0].confidence).toBeLessThanOrEqual(0.1);
  });
});

function fakeEvidence(text: string): RetrievedEvidence {
  return {
    score: 0.7,
    semanticScore: 0.7,
    keywordScore: 0.5,
    rankingSignals: ["test"],
    chunk: {
      id: "11111111-1111-1111-1111-111111111111",
      documentId: "22222222-2222-2222-2222-222222222222",
      documentKind: "earnings_call",
      sourceFile: "sample.txt",
      text,
      section: "Prepared Remarks",
      page: 1,
      pageEnd: 1,
      index: 0,
      tokenEstimate: 20,
      charStart: 0,
      charEnd: text.length,
      metadata: {
        hasTableLikeContent: false,
        lineCount: 1,
        retrievalText: text
      }
    }
  };
}
