import { describe, expect, it } from "vitest";
import { citationSupportScore, rejectGenericFluff, sanitizeClaimText } from "@/agents/grounding";

describe("claim grounding guards", () => {
  it("detects banned generic finance language", () => {
    expect(rejectGenericFluff("The business has strong fundamentals.")).toBe(true);
  });

  it("sanitizes generic finance language", () => {
    expect(sanitizeClaimText("The business has strong fundamentals.")).toBe(
      "The business has evidence-supported signal."
    );
  });

  it("scores claim support against cited evidence", () => {
    const score = citationSupportScore(
      "Revenue growth improved as margin expanded.",
      "Revenue growth improved from customer demand. Gross margin expanded during the quarter."
    );

    expect(score).toBeGreaterThan(0.6);
  });
});
