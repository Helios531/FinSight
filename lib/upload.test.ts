import { describe, expect, it } from "vitest";
import { maxUploadBytes, validateUploadedFile } from "@/lib/upload";

describe("upload safeguards", () => {
  it("accepts files within the configured MVP limit", () => {
    const file = new File(["ok"], "filing.txt", { type: "text/plain" });

    expect(validateUploadedFile(file)).toEqual({ ok: true });
  });

  it("rejects oversized files consistently across upload routes", () => {
    const oversized = new File([new Uint8Array(maxUploadBytes + 1)], "huge.pdf", { type: "application/pdf" });

    expect(validateUploadedFile(oversized)).toEqual({
      ok: false,
      status: 413,
      message: "File exceeds 20MB MVP limit."
    });
  });
});
