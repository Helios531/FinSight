import { describe, expect, it } from "vitest";
import { financialBenchmarks } from "@/evaluation/benchmarks";
import { evaluateAllBenchmarks, evaluateBenchmark, evaluateOutputStability } from "@/evaluation/runner";

describe("financial reasoning evaluation framework", () => {
  it("defines benchmark documents for core MVP document classes", () => {
    expect(financialBenchmarks.map((benchmark) => benchmark.document.kind).sort()).toEqual([
      "earnings_call",
      "financial_pdf",
      "sec_filing"
    ]);
  });

  it("tracks retrieval recall, hallucination rate, citation precision, numerical correctness, and consistency", async () => {
    const [result] = await evaluateAllBenchmarks();

    expect(result.scores).toEqual({
      hallucinationRate: expect.any(Number),
      citationPrecision: expect.any(Number),
      numericalCorrectness: expect.any(Number),
      agentConsistency: expect.any(Number),
      retrievalRecall: expect.any(Number)
    });
    expect(result.scores.retrievalRecall).toBeGreaterThan(0);
    expect(result.scores.hallucinationRate).toBeLessThanOrEqual(1);
  });

  it("flags numerical conflicts in benchmark cases", async () => {
    const benchmark = financialBenchmarks.find(
      (item) => item.document.id === "financial-statement-conflicting-growth"
    );
    expect(benchmark).toBeDefined();

    const result = await evaluateBenchmark(benchmark!);

    expect(result.report.keyMetrics.some((metric) => metric.verification.status === "conflict")).toBe(true);
    expect(result.scores.numericalCorrectness).toBeLessThan(1);
  });

  it("measures deterministic output stability across repeated local runs", async () => {
    const stability = await evaluateOutputStability(financialBenchmarks[0]);

    expect(stability).toBeGreaterThanOrEqual(0.8);
  });
});
