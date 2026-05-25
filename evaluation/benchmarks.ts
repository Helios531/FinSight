import type { FinancialBenchmarkCase } from "@/evaluation/types";

export const financialBenchmarks: FinancialBenchmarkCase[] = [
  {
    document: {
      id: "earnings-call-revenue-risk",
      name: "Earnings call with revenue growth and refinancing risk",
      filename: "earnings-call-revenue-risk.txt",
      kind: "earnings_call",
      content: `Prepared Remarks
Revenue saw 18% growth from $100 million to $118 million in Q1 2026. Gross margin improved due to lower infrastructure costs.

Risk Factors
Management noted customer concentration and refinancing risk due to debt maturities. Demand may soften if macro conditions weaken.

Q&A 00:12:04
Analysts asked about margin pressure and cash flow. Management said free cash flow was positive but expenses increased.`
    },
    expectations: [
      {
        query: "revenue growth gross margin",
        mustContain: ["revenue", "118", "gross margin"],
        metricLabels: ["Revenue", "Gross margin"],
        forbiddenClaimTerms: ["dominate", "industry-leading innovation"]
      },
      {
        query: "refinancing risk debt maturities concentration",
        mustContain: ["refinancing", "debt", "concentration"]
      }
    ]
  },
  {
    document: {
      id: "sec-filing-liquidity-risk",
      name: "SEC filing style liquidity and risk excerpt",
      filename: "sec-filing-liquidity-risk.txt",
      kind: "sec_filing",
      content: `Item 7. Management's Discussion and Analysis
Net revenue increased 10% from $200 million to $220 million in fiscal 2026. Operating margin declined due to higher fulfillment expense.

Item 1A. Risk Factors
We depend on two customers for a substantial portion of revenue. If either customer reduces purchases, revenue and cash flow could decline.

Liquidity
The company had $45 million of cash and $160 million of debt outstanding as of year end.`
    },
    expectations: [
      {
        query: "liquidity cash debt outstanding",
        mustContain: ["cash", "debt", "160"],
        metricLabels: ["Revenue", "Debt"]
      },
      {
        query: "customer concentration revenue risk",
        mustContain: ["customers", "revenue", "cash flow"]
      }
    ]
  },
  {
    document: {
      id: "financial-statement-conflicting-growth",
      name: "Financial statement excerpt with incorrect reported growth",
      filename: "financial-statement-conflicting-growth.txt",
      kind: "financial_pdf",
      content: `Financial Statements
Revenue saw 18% growth from $100 million to $130 million. Gross margin was 42% compared with 40% last year.

Cash Flow
Free cash flow was $12 million. Capital expenditures were $8 million.`
    },
    expectations: [
      {
        query: "revenue growth gross margin",
        mustContain: ["revenue", "130", "gross margin"],
        metricLabels: ["Revenue", "Gross margin"]
      }
    ]
  }
];
