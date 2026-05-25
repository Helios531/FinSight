import { NextResponse } from "next/server";
import { platformManifest } from "@/api/platform";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    generatedAt: new Date().toISOString(),
    platform: platformManifest()
  });
}
