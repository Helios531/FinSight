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
    <form onSubmit={handleSubmit} className="rounded border border-ink-200 bg-white p-4 shadow-hairline">
      <div className="flex items-center gap-2 border-b border-ink-200 pb-3">
        <FileText className="h-4 w-4 text-ink-600" aria-hidden />
        <h2 className="text-sm font-semibold">Document Intake</h2>
      </div>

      <label className="mt-4 block text-xs font-medium uppercase text-ink-500">Document type</label>
      <select
        value={documentKind}
        onChange={(event) => setDocumentKind(event.target.value)}
        className="mt-1 w-full rounded border-ink-200 text-sm focus:border-signal-blue focus:ring-signal-blue"
      >
        <option value="earnings_call">Earnings call transcript</option>
        <option value="sec_filing">SEC filing</option>
        <option value="financial_pdf">Financial PDF</option>
      </select>

      <label
        htmlFor="file"
        className="mt-4 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded border border-dashed border-ink-300 bg-ink-50 px-4 text-center hover:bg-white"
      >
        <Upload className="h-5 w-5 text-ink-500" aria-hidden />
        <span className="mt-2 text-sm font-medium">{filename || "Upload PDF or text file"}</span>
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
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded bg-ink-950 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-ink-500"
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
        Generate Analysis
      </button>
    </form>
  );
}
