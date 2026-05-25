import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analyzeUploadedDocument } from "@/api/analyze-document";
import { reportResourceEnvelope } from "@/api/platform";
import { logger } from "@/lib/logger";
import { validateUploadedFile } from "@/lib/upload";

export const runtime = "nodejs";

const requestSchema = z.object({
  kind: z.enum(["earnings_call", "sec_filing", "financial_pdf"]).default("earnings_call"),
  envelope: z.enum(["full", "summary"]).default("full")
});

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const parsed = requestSchema.parse({
      kind: formData.get("kind") ?? "earnings_call",
      envelope: formData.get("envelope") ?? "full"
    });

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "Missing uploaded file." }, { status: 400 });
    }

    const validation = validateUploadedFile(file);
    if (!validation.ok) {
      return NextResponse.json({ message: validation.message }, { status: validation.status });
    }

    const report = await analyzeUploadedDocument(file, parsed.kind);
    return NextResponse.json(parsed.envelope === "summary" ? reportResourceEnvelope(report) : report);
  } catch (error) {
    logger.error("api_platform.analysis_failed", {
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to analyze document." },
      { status: 500 }
    );
  }
}
