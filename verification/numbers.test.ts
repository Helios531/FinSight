import { describe, expect, it } from "vitest";
import { extractKeyMetrics, verifyGrowthStatement } from "@/verification/numbers";
import type { RetrievedEvidence } from "@/retrieval/store";

describe("verifyGrowthStatement", () => {
  it("verifies reported growth from prior and current values", () => {
    const result = verifyGrowthStatement("Revenue saw 18% growth from $100 million to $118 million.");

    expect(result).toEqual({
      status: "verified",
      explanation: "Reported change matches computed 18.0% within rounding tolerance.",
      computedValue: "18.0%"
    });
  });

  it("verifies verb-first growth phrasing", () => {
    const result = verifyGrowthStatement("Revenue increased 18% from $100 million to $118 million.");

    expect(result?.status).toBe("verified");
    expect(result?.computedValue).toBe("18.0%");
  });

  it("flags inconsistent reported growth", () => {
    const result = verifyGrowthStatement("Revenue saw 18% growth from $100 million to $130 million.");

    expect(result?.status).toBe("conflict");
    expect(result?.computedValue).toBe("30.0%");
  });

  it("returns null when a complete calculation pair is unavailable", () => {
    const result = verifyGrowthStatement("Revenue increased 18% year over year.");

    expect(result).toBeNull();
  });

  it("generates stable metric ids from cited evidence", () => {
    const evidence = [retrievedEvidence()];

    const first = extractKeyMetrics(evidence);
    const second = extractKeyMetrics(evidence);

    expect(first[0]?.id).toBe(second[0]?.id);
  });
});

function retrievedEvidence(): RetrievedEvidence {
  return {
    score: 0.8,
    chunk: {
      id: "11111111-1111-4111-8111-111111111111",
      documentId: "22222222-2222-4222-8222-222222222222",
      documentKind: "sec_filing",
      sourceFile: "metric.txt",
      text: "Revenue increased 18% from $100 million to $118 million in Q2 2026.",
      section: "MD&A",
      page: 1,
      pageEnd: 1,
      index: 0,
      tokenEstimate: 20,
      charStart: 0,
      charEnd: 68,
      metadata: {
        hasTableLikeContent: false,
        lineCount: 1,
        retrievalText: "MD&A\nRevenue increased 18% from $100 million to $118 million in Q2 2026."
      }
    }
  };
}
