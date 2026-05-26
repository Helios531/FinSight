"use client";

import { FormEvent, useRef, useState } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import type { AnalysisReport } from "@/lib/types";

type UploadPanelProps = {
  onReport: (report: AnalysisReport) => void;
  onStage: (stage: string) => void;
  onError: (error: string | null) => void;
};

const stages = ["upload", "parse", "retrieve", "agents", "referee"];

export function UploadPanel({ onReport, onStage, onError }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [documentKind, setDocumentKind] = useState("earnings_call");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];

    if (!file) {
      onError("Choose an earnings call transcript, SEC filing, or financial PDF.");
      return;
    }

    setIsSubmitting(true);
    onError(null);

    try {
      for (const stage of stages) {
        onStage(stage);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      const body = new FormData();
      body.append("file", file);
      body.append("kind", documentKind);

      const response = await fetch("/api/documents", {
        method: "POST",
        body
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message ?? "Analysis failed.");
      }

      onReport((await response.json()) as AnalysisReport);
      onStage("complete");
    } catch (error) {
      onStage("error");
      onError(error instanceof Error ? error.message : "Unexpected analysis failure.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-elevated">
      <div className="border-b border-ink-200 bg-luxury-graphite px-4 py-4 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-luxury-gold/35 bg-white/5">
            <FileText className="h-4 w-4 text-luxury-gold" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Document Intake</h2>
            <p className="mt-1 text-xs text-white/55">Upload, classify, and run grounded analysis.</p>
          </div>
        </div>
      </div>

      <div className="p-4">
      <label className="block text-xs font-medium uppercase text-ink-500">Document type</label>
      <select
        value={documentKind}
        onChange={(event) => setDocumentKind(event.target.value)}
        className="mt-1 w-full rounded-lg border-ink-200 bg-ink-50 text-sm focus:border-luxury-mint focus:ring-luxury-mint"
      >
        <option value="earnings_call">Earnings call transcript</option>
        <option value="sec_filing">SEC filing</option>
        <option value="financial_pdf">Financial PDF</option>
      </select>

      <label
        htmlFor="file"
        className="mt-4 flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-ink-300 bg-luxury-pearl px-4 text-center hover:border-luxury-gold hover:bg-white"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-ink-200 bg-white shadow-hairline">
          <Upload className="h-5 w-5 text-luxury-mint" aria-hidden />
        </span>
        <span className="mt-3 text-sm font-semibold">{filename || "Upload PDF or text file"}</span>
        <span className="mt-1 text-xs text-ink-500">
          Earnings calls and SEC filings are prioritized in this MVP.
        </span>
      </label>
      <input
        ref={inputRef}
        id="file"
        name="file"
        type="file"
        accept=".pdf,.txt,.md"
        className="sr-only"
        onChange={(event) => setFilename(event.target.files?.[0]?.name ?? "")}
      />

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-luxury-graphite px-3 py-2.5 text-sm font-medium text-white shadow-elevated hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-500"
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
        Generate Analysis
      </button>
      </div>
    </form>
  );
}
