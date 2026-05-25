import { NextRequest, NextResponse } from "next/server";
import { reportResourceEnvelope } from "@/api/platform";
import type { AnalysisReport } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const report = (await request.json()) as AnalysisReport;
    if (!report?.document?.id || !report.finalVerdict || !report.confidence) {
      return NextResponse.json({ message: "Request body must be an AnalysisReport." }, { status: 400 });
    }

    return NextResponse.json(reportResourceEnvelope(report));
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to normalize report." },
      { status: 500 }
    );
  }
}
