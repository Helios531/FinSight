"use client";

import { X } from "lucide-react";
import type { EvidenceCitation } from "@/lib/types";

export function EvidenceDrawer({
  citation,
  onClose
}: {
  citation: EvidenceCitation | null;
  onClose: () => void;
}) {
  if (!citation) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink-950/20">
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-ink-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-ink-200 pb-4">
          <div>
            <p className="font-mono text-xs uppercase text-ink-500">Evidence</p>
            <h2 className="mt-1 text-lg font-semibold">{citation.section}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-ink-200 p-2 hover:bg-ink-50"
            aria-label="Close evidence"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="font-mono text-xs uppercase text-ink-500">Source</dt>
            <dd className="mt-1 font-medium">{citation.sourceFile}</dd>
          </div>
          <div>
            <dt className="font-mono text-xs uppercase text-ink-500">Location</dt>
            <dd className="mt-1 font-medium">
              {citation.page ? `Page ${citation.page}` : "Page unavailable"}
              {citation.timestamp ? ` | ${citation.timestamp}` : ""}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-xs uppercase text-ink-500">Relevance</dt>
            <dd className="mt-1 font-medium">{Math.round(citation.relevanceScore * 100)}%</dd>
          </div>
        </dl>
        <blockquote className="mt-5 whitespace-pre-wrap rounded border border-ink-200 bg-ink-50 p-4 text-sm leading-6 text-ink-800">
          {citation.excerpt}
        </blockquote>
      </aside>
    </div>
  );
}
