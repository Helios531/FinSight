import { describe, expect, it } from "vitest";
import { verifyGrowthStatement } from "@/verification/numbers";

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
});
