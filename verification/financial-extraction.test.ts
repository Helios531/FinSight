import { describe, expect, it } from "vitest";
import { extractStructuredFinancials, structuredMetricsToKeyMetrics } from "@/verification/financial-extraction";
import type { RetrievedEvidence } from "@/retrieval/store";

describe("structured financial extraction", () => {
  it("extracts and normalizes income statement metrics", () => {
    const metrics = extractStructuredFinancials([
      fakeEvidence("Income Statement\nRevenue increased 18% from $100 million to $118 million. Gross margin was 42%.")
    ]);

    expect(metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          statementType: "income_statement",
          normalizedLabel: "revenue",
          rawValue: "$100 million to $118 million",
          unit: "usd",
          scale: 1_000_000,
          verification: expect.objectContaining({ status: "verified", computedValue: "18.0%" })
        }),
        expect.objectContaining({
          normalizedLabel: "gross_margin",
          unit: "percent"
        })
      ])
    );
  });

  it("extracts balance sheet and cash flow metrics", () => {
    const metrics = extractStructuredFinancials([
      fakeEvidence("Balance Sheet\nCash and cash equivalents were $45 million. Total debt was $160 million."),
      fakeEvidence("Cash Flow Statement\nOperating cash flow was $30 million and capital expenditures were $8 million.")
    ]);

    expect(metrics.map((metric) => metric.normalizedLabel)).toEqual(
      expect.arrayContaining(["cash", "total_debt", "operating_cash_flow", "capital_expenditures"])
    );
    expect(metrics.find((metric) => metric.normalizedLabel === "total_debt")?.numericValue).toBe(160_000_000);
  });

  it("extracts guidance and risk factor disclosures", () => {
    const metrics = extractStructuredFinancials([
      fakeEvidence("Guidance\nManagement expects revenue of $500 million to $520 million in FY 2026."),
      fakeEvidence("Risk Factors\nCustomer concentration risk may reduce revenue and cash flow.")
    ]);

    expect(metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          statementType: "guidance",
          normalizedLabel: "guidance",
          direction: "range"
        }),
        expect.objectContaining({
          statementType: "risk_factor",
          normalizedLabel: "risk_factor",
          rawValue: "Risk disclosed"
        })
      ])
    );
  });

  it("converts normalized metrics into existing key metric shape", () => {
    const metrics = extractStructuredFinancials([
      fakeEvidence("Free cash flow was $12 million and capital expenditures were $8 million.")
    ]);
    const keyMetrics = structuredMetricsToKeyMetrics(metrics);

    expect(keyMetrics[0]).toMatchObject({
      label: expect.any(String),
      value: expect.any(String),
      citations: expect.any(Array),
      verification: expect.objectContaining({ status: expect.any(String) })
    });
  });
});

function fakeEvidence(text: string): RetrievedEvidence {
  return {
    score: 0.8,
    semanticScore: 0.8,
    keywordScore: 0.8,
    rankingSignals: ["test"],
    chunk: {
      id: "11111111-1111-1111-1111-111111111111",
      documentId: "22222222-2222-2222-2222-222222222222",
      documentKind: "sec_filing",
      sourceFile: "sample.txt",
      text,
      section: "Financial Statements",
      page: 1,
      pageEnd: 1,
      index: 0,
      tokenEstimate: 50,
      charStart: 0,
      charEnd: text.length,
      metadata: {
        hasTableLikeContent: true,
        lineCount: 2,
        retrievalText: text
      }
    }
  };
}
