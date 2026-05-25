"use client";

import { useState } from "react";
import { AnalysisDashboard } from "@/components/AnalysisDashboard";
import { ProcessingTimeline } from "@/components/ProcessingTimeline";
import { UploadPanel } from "@/components/UploadPanel";
import type { AnalysisReport } from "@/lib/types";

export default function Home() {
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [stage, setStage] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="min-h-screen px-6 py-5 text-ink-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-ink-200 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-ink-500">
              Financial Sight
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal">
              Earnings Call + SEC Filing Analysis
            </h1>
          </div>
          <div className="grid grid-cols-3 divide-x divide-ink-200 overflow-hidden rounded border border-ink-200 bg-white text-xs shadow-hairline">
            <div className="px-3 py-2">
              <span className="block font-mono text-ink-500">MODE</span>
              <span className="font-medium">Grounded RAG</span>
            </div>
            <div className="px-3 py-2">
              <span className="block font-mono text-ink-500">SCOPE</span>
              <span className="font-medium">MVP</span>
            </div>
            <div className="px-3 py-2">
              <span className="block font-mono text-ink-500">AUDIT</span>
              <span className="font-medium">Cited</span>
            </div>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <aside className="flex flex-col gap-4">
            <UploadPanel onError={setError} onReport={setReport} onStage={setStage} />
            <ProcessingTimeline activeStage={stage} />
            {error ? (
              <div className="rounded border border-signal-red/30 bg-white p-3 text-sm text-signal-red">
                {error}
              </div>
            ) : null}
          </aside>
          <AnalysisDashboard report={report} />
        </div>
      </div>
    </main>
  );
}
