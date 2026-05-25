import { describe, expect, it } from "vitest";
import { rejectGenericFluff, sanitizeClaimText } from "@/agents/grounding";

describe("claim grounding guards", () => {
  it("detects banned generic finance language", () => {
    expect(rejectGenericFluff("The business has strong fundamentals.")).toBe(true);
  });

  it("sanitizes generic finance language", () => {
    expect(sanitizeClaimText("The business has strong fundamentals.")).toBe(
      "The business has evidence-supported signal."
    );
  });
});
