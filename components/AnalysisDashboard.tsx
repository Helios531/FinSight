"use client";

import { useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, FileSearch, Scale } from "lucide-react";
import { AgentSection } from "@/components/AgentSection";
import { EvidenceDrawer } from "@/components/EvidenceDrawer";
import { ObservabilityPanel } from "@/components/ObservabilityPanel";
import type { AnalysisReport, EvidenceCitation } from "@/lib/types";

export function AnalysisDashboard({ report }: { report: AnalysisReport | null }) {
  const [selectedCitation, setSelectedCitation] = useState<EvidenceCitation | null>(null);

  if (!report) {
    return (
      <section className="flex min-h-[680px] items-center justify-center rounded border border-ink-200 bg-white p-6 text-center shadow-hairline">
        <div className="max-w-md">
          <FileSearch className="mx-auto h-9 w-9 text-ink-400" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">No analysis generated</h2>
          <p className="mt-2 text-sm text-ink-600">
            Upload an earnings call transcript or SEC filing to run grounded retrieval,
            specialized agent analysis, numerical checks, and a referee verdict.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="min-w-0 space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <StatusTile label="Document" value={report.document.filename} />
        <StatusTile label="Chunks" value={String(report.document.chunkCount)} />
        <StatusTile label="Confidence" value={`${report.confidence.label} ${report.confidence.score}%`} />
        <StatusTile label="Verdict" value={report.finalVerdict.stance} />
      </div>

      <Panel title="Executive Summary" icon={<Scale className="h-4 w-4" aria-hidden />}>
        <div className="space-y-3">
          {report.executiveSummary.map((claim) => (
            <ClaimRow key={claim.id} claim={claim.claim} citations={claim.citations} onCitation={setSelectedCitation} />
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-3">
        <AgentSection title="Bull Case" tone="green" claims={report.bullCase} onCitation={setSelectedCitation} />
        <AgentSection title="Bear Case" tone="red" claims={report.bearCase} onCitation={setSelectedCitation} />
        <AgentSection title="Risk Analysis" tone="amber" claims={report.riskAnalysis} onCitation={setSelectedCitation} />
      </div>

      <Panel title="Key Metrics" icon={<BarChart3 className="h-4 w-4" aria-hidden />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs uppercase text-ink-500">
                <th className="py-2 pr-3 font-medium">Metric</th>
                <th className="py-2 pr-3 font-medium">Value</th>
                <th className="py-2 pr-3 font-medium">Period</th>
                <th className="py-2 pr-3 font-medium">Verification</th>
                <th className="py-2 pr-3 font-medium">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {report.keyMetrics.map((metric) => (
                <tr key={metric.id} className="border-b border-ink-100">
                  <td className="py-2 pr-3 font-medium">{metric.label}</td>
                  <td className="py-2 pr-3 font-mono">{metric.value}</td>
                  <td className="py-2 pr-3 text-ink-600">{metric.period ?? "Not stated"}</td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1 rounded border border-ink-200 px-2 py-1 text-xs">
                      {metric.verification.status === "verified" ? (
                        <CheckCircle2 className="h-3 w-3 text-signal-green" aria-hidden />
                      ) : (
                        <AlertTriangle className="h-3 w-3 text-signal-amber" aria-hidden />
                      )}
                      {metric.verification.status}
                    </span>
                    <p className="mt-1 max-w-sm text-xs text-ink-500">{metric.verification.explanation}</p>
                  </td>
                  <td className="py-2 pr-3">
                    {metric.citations.map((citation) => (
                      <CitationButton key={citation.id} citation={citation} onCitation={setSelectedCitation} />
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Panel title="Areas of Disagreement" icon={<Scale className="h-4 w-4" aria-hidden />}>
          <div className="space-y-3">
            {report.disagreements.map((item) => (
              <div key={item.id} className="rounded border border-ink-200 p-3">
                <h3 className="text-sm font-semibold">{item.issue}</h3>
                <p className="mt-2 text-xs text-signal-green">{item.bullPosition}</p>
                <p className="mt-1 text-xs text-signal-red">{item.bearOrRiskPosition}</p>
                <p className="mt-2 text-sm text-ink-700">{item.refereeAssessment}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.citations.map((citation) => (
                    <CitationButton key={citation.id} citation={citation} onCitation={setSelectedCitation} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Confidence Assessment" icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}>
          <div className="text-4xl font-semibold">{report.confidence.score}%</div>
          <p className="mt-1 text-sm font-medium">{report.confidence.label}</p>
          <h3 className="mt-4 text-xs font-semibold uppercase text-ink-500">Drivers</h3>
          <ul className="mt-2 space-y-1 text-sm text-ink-700">
            {report.confidence.drivers.map((driver) => (
              <li key={driver}>{driver}</li>
            ))}
          </ul>
          <h3 className="mt-4 text-xs font-semibold uppercase text-ink-500">Reductions</h3>
          <ul className="mt-2 space-y-1 text-sm text-ink-700">
            {report.confidence.reductions.map((reduction) => (
              <li key={reduction}>{reduction}</li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Source Citations" icon={<FileSearch className="h-4 w-4" aria-hidden />}>
        <div className="grid gap-2 md:grid-cols-2">
          {report.citations.map((citation) => (
            <button
              key={citation.id}
              type="button"
              onClick={() => setSelectedCitation(citation)}
              className="rounded border border-ink-200 p-3 text-left hover:border-ink-500"
            >
              <span className="font-mono text-xs text-ink-500">{citation.section}</span>
              <p className="mt-1 line-clamp-3 text-sm text-ink-700">{citation.excerpt}</p>
            </button>
          ))}
        </div>
      </Panel>

      <ObservabilityPanel traces={report.traces} />
      <EvidenceDrawer citation={selectedCitation} onClose={() => setSelectedCitation(null)} />
    </section>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded border border-ink-200 bg-white p-4 shadow-hairline">
      <div className="mb-3 flex items-center gap-2 border-b border-ink-200 pb-3">
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-ink-200 bg-white p-3 shadow-hairline">
      <span className="font-mono text-xs uppercase text-ink-500">{label}</span>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function ClaimRow({
  claim,
  citations,
  onCitation
}: {
  claim: string;
  citations: EvidenceCitation[];
  onCitation: (citation: EvidenceCitation) => void;
}) {
  return (
    <div className="rounded border border-ink-200 p-3">
      <p className="text-sm text-ink-800">{claim}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {citations.map((citation) => (
          <CitationButton key={citation.id} citation={citation} onCitation={onCitation} />
        ))}
      </div>
    </div>
  );
}

function CitationButton({
  citation,
  onCitation
}: {
  citation: EvidenceCitation;
  onCitation: (citation: EvidenceCitation) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onCitation(citation)}
      className="mr-1 inline-flex rounded border border-ink-200 px-2 py-1 font-mono text-[11px] text-ink-600 hover:border-ink-500"
    >
      {citation.section}
      {citation.page
        ? ` p.${citation.page}${citation.pageEnd && citation.pageEnd !== citation.page ? `-${citation.pageEnd}` : ""}`
        : ""}
    </button>
  );
}
