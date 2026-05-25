"use client";

import { useState } from "react";
import { AlertTriangle, BarChart3, Bell, CheckCircle2, FileSearch, Scale } from "lucide-react";
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

      {report.companyMemory ? (
        <Panel title="Company Memory" icon={<FileSearch className="h-4 w-4" aria-hidden />}>
          <div className="grid gap-4 xl:grid-cols-3">
            <div>
              <h3 className="text-xs font-semibold uppercase text-ink-500">Filings</h3>
              <p className="mt-1 text-sm font-semibold">{report.companyMemory.companyName}</p>
              <p className="text-xs text-ink-500">{report.companyMemory.filingCount} remembered filing(s)</p>
              <ul className="mt-3 space-y-2 text-xs text-ink-700">
                {report.companyMemory.pastFilings.slice(0, 4).map((filing) => (
                  <li key={filing.documentId} className="border-b border-ink-100 pb-2">
                    <span className="block truncate font-medium">{filing.filename}</span>
                    <span className="font-mono text-ink-500">{filing.kind}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase text-ink-500">Recurring Risks</h3>
              <div className="mt-2 space-y-2">
                {report.companyMemory.recurringRisks.slice(0, 5).map((risk) => (
                  <div key={risk.theme} className="border-b border-ink-100 pb-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{risk.label}</span>
                      <span className="font-mono text-xs text-ink-500">{risk.occurrenceCount}x</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {risk.citations.slice(0, 2).map((citation) => (
                        <CitationButton key={citation.id} citation={citation} onCitation={setSelectedCitation} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase text-ink-500">Historical Metrics</h3>
              <div className="mt-2 space-y-2">
                {report.companyMemory.historicalMetrics.slice(0, 5).map((metric) => (
                  <div key={`${metric.label}-${metric.value}-${metric.period ?? ""}`} className="border-b border-ink-100 pb-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{metric.label}</span>
                      <span className="font-mono text-xs">{metric.value}</span>
                    </div>
                    <p className="text-xs text-ink-500">{metric.period ?? "Not stated"}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      {report.watchlist ? (
        <Panel title="Watchlist Alerts" icon={<Bell className="h-4 w-4" aria-hidden />}>
          <div className="grid gap-4 xl:grid-cols-[220px_1fr]">
            <div className="border-b border-ink-100 pb-3 xl:border-b-0 xl:border-r xl:pb-0 xl:pr-4">
              <h3 className="text-xs font-semibold uppercase text-ink-500">Tracked</h3>
              <p className="mt-1 text-sm font-semibold">{report.watchlist.companyName}</p>
              <p className="mt-1 text-xs text-ink-600">
                {report.watchlist.trackedCompanyCount} company track(s), {report.watchlist.unacknowledgedCount} open alert(s)
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {report.watchlist.alerts.slice(0, 6).map((alert) => (
                <div key={alert.id} className="rounded border border-ink-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="font-mono text-[11px] uppercase text-ink-500">{alert.category.replace("_", " ")}</span>
                      <h3 className="mt-1 text-sm font-semibold">{alert.title}</h3>
                    </div>
                    <Severity severity={alert.severity} />
                  </div>
                  <p className="mt-2 text-xs text-ink-700">{alert.message}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {alert.citations.slice(0, 2).map((citation) => (
                      <CitationButton key={citation.id} citation={citation} onCitation={setSelectedCitation} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      ) : null}

      {report.portfolio ? (
        <Panel title="Portfolio Intelligence" icon={<BarChart3 className="h-4 w-4" aria-hidden />}>
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr]">
            <div>
              <h3 className="text-xs font-semibold uppercase text-ink-500">Company Exposure</h3>
              <div className="mt-2 space-y-2">
                {report.portfolio.companies.slice(0, 6).map((company) => (
                  <div key={company.companyId} className="border-b border-ink-100 pb-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{company.companyName}</span>
                      <span className="font-mono text-xs">{Math.round(company.concentrationWeight * 100)}%</span>
                    </div>
                    <p className="text-xs text-ink-500">
                      {company.sector} · {company.filingCount} filing(s) · {company.alertCount} alert(s)
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase text-ink-500">Sector Exposure</h3>
              <div className="mt-2 space-y-2">
                {report.portfolio.sectorExposure.slice(0, 6).map((sector) => (
                  <div key={sector.sector} className="border-b border-ink-100 pb-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{sector.sector}</span>
                      <span className="font-mono text-xs">{Math.round(sector.concentrationWeight * 100)}%</span>
                    </div>
                    <p className="truncate text-xs text-ink-500">{sector.companies.join(", ")}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase text-ink-500">Overlapping Risks</h3>
              <div className="mt-2 space-y-2">
                {report.portfolio.overlappingRisks.slice(0, 5).map((risk) => (
                  <div key={risk.theme} className="border-b border-ink-100 pb-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{risk.label}</span>
                      <Severity severity={risk.severity} />
                    </div>
                    <p className="text-xs text-ink-500">{risk.companyCount} companies: {risk.companies.join(", ")}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {risk.citations.slice(0, 2).map((citation) => (
                        <CitationButton key={citation.id} citation={citation} onCitation={setSelectedCitation} />
                      ))}
                    </div>
                  </div>
                ))}
                {report.portfolio.overlappingRisks.length === 0 ? (
                  <p className="text-xs text-ink-500">No overlapping risk themes detected yet.</p>
                ) : null}
              </div>
            </div>
          </div>
          {report.portfolio.concentrationSignals.length > 0 ? (
            <div className="mt-4 border-t border-ink-100 pt-3">
              <h3 className="text-xs font-semibold uppercase text-ink-500">Concentration Signals</h3>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {report.portfolio.concentrationSignals.slice(0, 4).map((signal) => (
                  <div key={signal.id} className="rounded border border-ink-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold">{signal.issue}</h4>
                      <Severity severity={signal.severity} />
                    </div>
                    <p className="mt-2 text-xs text-ink-700">{signal.explanation}</p>
                    <p className="mt-1 truncate text-xs text-ink-500">{signal.affectedCompanies.join(", ")}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {report.crossCompany ? (
        <Panel title="Cross-Company Intelligence" icon={<Scale className="h-4 w-4" aria-hidden />}>
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr]">
            <div>
              <h3 className="text-xs font-semibold uppercase text-ink-500">Competitors</h3>
              <div className="mt-2 space-y-2">
                {report.crossCompany.competitorComparisons.slice(0, 5).map((comparison) => (
                  <div key={comparison.id} className="border-b border-ink-100 pb-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{comparison.companies.join(" / ")}</span>
                      <span className="font-mono text-xs text-ink-500">{comparison.sector}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink-700">{comparison.assessment}</p>
                    {comparison.sharedRisks.length > 0 ? (
                      <p className="mt-1 truncate text-xs text-ink-500">{comparison.sharedRisks.join(", ")}</p>
                    ) : null}
                  </div>
                ))}
                {report.crossCompany.competitorComparisons.length === 0 ? (
                  <p className="text-xs text-ink-500">Add more same-sector companies to compare competitors.</p>
                ) : null}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase text-ink-500">Sector Trends</h3>
              <div className="mt-2 space-y-2">
                {report.crossCompany.sectorTrends.slice(0, 6).map((trend) => (
                  <div key={trend.sector} className="border-b border-ink-100 pb-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{trend.sector}</span>
                      <span className="font-mono text-xs text-ink-500">{trend.trend.replace("_", " ")}</span>
                    </div>
                    <p className="text-xs text-ink-500">
                      {trend.companyCount} companies · alert pressure {trend.alertPressure}
                    </p>
                    {trend.dominantRisks.length > 0 ? (
                      <p className="mt-1 truncate text-xs text-ink-700">{trend.dominantRisks.join(", ")}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase text-ink-500">Macro Exposure</h3>
              <div className="mt-2 space-y-2">
                {report.crossCompany.macroExposures.slice(0, 6).map((exposure) => (
                  <div key={exposure.factor} className="border-b border-ink-100 pb-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{exposure.label}</span>
                      <Severity severity={exposure.severity} />
                    </div>
                    <p className="text-xs text-ink-500">{exposure.companies.join(", ")}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {exposure.citations.slice(0, 2).map((citation) => (
                        <CitationButton key={citation.id} citation={citation} onCitation={setSelectedCitation} />
                      ))}
                    </div>
                  </div>
                ))}
                {report.crossCompany.macroExposures.length === 0 ? (
                  <p className="text-xs text-ink-500">No macro exposure cluster detected yet.</p>
                ) : null}
              </div>
            </div>
          </div>
          {report.crossCompany.industryTrends.length > 0 ? (
            <div className="mt-4 border-t border-ink-100 pt-3">
              <h3 className="text-xs font-semibold uppercase text-ink-500">Industry Trends</h3>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {report.crossCompany.industryTrends.slice(0, 4).map((trend) => (
                  <div key={trend.theme} className="rounded border border-ink-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold">{trend.label}</h4>
                      <Severity severity={trend.severity} />
                    </div>
                    <p className="mt-2 text-xs text-ink-700">
                      {trend.companyCount} companies across {trend.affectedSectors.join(", ")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {trend.citations.slice(0, 2).map((citation) => (
                        <CitationButton key={citation.id} citation={citation} onCitation={setSelectedCitation} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {report.workspace ? (
        <Panel title="Analyst Workspace" icon={<FileSearch className="h-4 w-4" aria-hidden />}>
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr_260px]">
            <div>
              <h3 className="text-xs font-semibold uppercase text-ink-500">Saved Findings</h3>
              <div className="mt-2 space-y-2">
                {report.workspace.savedFindings.slice(0, 5).map((finding) => (
                  <div key={finding.id} className="border-b border-ink-100 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold">{finding.title}</h4>
                      <Severity severity={finding.priority === "high" ? "high" : finding.priority === "medium" ? "medium" : "info"} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-ink-700">{finding.summary}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {finding.citations.slice(0, 2).map((citation) => (
                        <CitationButton key={citation.id} citation={citation} onCitation={setSelectedCitation} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase text-ink-500">Annotations</h3>
              <div className="mt-2 space-y-2">
                {report.workspace.annotations.slice(0, 5).map((annotation) => (
                  <div key={annotation.id} className="border-b border-ink-100 pb-2">
                    <span className="font-mono text-[11px] uppercase text-ink-500">{annotation.targetType}</span>
                    <p className="mt-1 text-xs text-ink-700">{annotation.note}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase text-ink-500">Collaboration</h3>
              <div className="mt-2 flex flex-wrap gap-1">
                {report.workspace.collaborators.map((collaborator) => (
                  <span key={collaborator} className="rounded border border-ink-200 px-2 py-1 text-xs">
                    {collaborator}
                  </span>
                ))}
              </div>
              <h3 className="mt-4 text-xs font-semibold uppercase text-ink-500">Exports</h3>
              <div className="mt-2 space-y-2">
                {report.workspace.exports.map((item) => (
                  <div key={item.id} className="rounded border border-ink-200 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">{item.filename}</span>
                      <span className="font-mono text-[11px] uppercase text-ink-500">{item.format}</span>
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-ink-500">{item.checksum.slice(0, 16)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      {report.compliance ? (
        <Panel title="Audit & Compliance" icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}>
          <div className="grid gap-4 xl:grid-cols-[300px_1fr_1fr]">
            <div>
              <h3 className="text-xs font-semibold uppercase text-ink-500">Reproducibility</h3>
              <p className="mt-2 font-mono text-xs text-ink-700">Seed: {report.compliance.reproducibilitySeed.slice(0, 24)}</p>
              <p className="mt-1 font-mono text-xs text-ink-700">Checksum: {report.compliance.reportChecksum.slice(0, 24)}</p>
              <p className="mt-2 text-xs text-ink-500">{report.compliance.evidenceRecordCount} evidence record(s) tracked</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase text-ink-500">Audit Events</h3>
              <div className="mt-2 space-y-2">
                {report.compliance.auditEvents.slice(0, 6).map((event) => (
                  <div key={event.id} className="border-b border-ink-100 pb-2">
                    <span className="font-mono text-[11px] uppercase text-ink-500">{event.eventType}</span>
                    <p className="mt-1 text-xs text-ink-700">{event.actor}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase text-ink-500">Version History</h3>
              <div className="mt-2 space-y-2">
                {report.compliance.versions.map((version) => (
                  <div key={version.id} className="rounded border border-ink-200 p-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">Version {version.version}</span>
                      <span className="font-mono text-ink-500">{version.checksum.slice(0, 12)}</span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-ink-500">{version.createdAt}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Panel title="Areas of Disagreement" icon={<Scale className="h-4 w-4" aria-hidden />}>
          <div className="space-y-3">
            {report.disagreements.map((item) => (
              <div key={item.id} className="rounded border border-ink-200 p-3">
                <h3 className="text-sm font-semibold">{item.issue}</h3>
                <p className="mt-2 text-xs text-signal-green">{item.bullPosition}</p>
                <p className="mt-1 text-xs text-signal-red">{item.bearOrRiskPosition}</p>
                <p className="mt-2 text-sm text-ink-700">{item.refereeAssessment}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-ink-100 pt-2 text-[11px]">
                  <Signal label="Contradiction" value={item.contradictionScore} />
                  <Signal label="Evidence" value={item.evidenceWeight} />
                  <Signal label="Impact" value={item.confidenceImpact} />
                </div>
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
          <div className="mt-4 grid grid-cols-2 gap-2 border-y border-ink-100 py-3 text-xs">
            <Signal label="Contradiction" value={report.debateAssessment.contradictionScore} />
            <Signal label="Evidence Weight" value={report.debateAssessment.evidenceWeight} />
            <Signal label="Consensus" value={report.debateAssessment.consensusScore} />
            <Signal label="Calibration" value={report.debateAssessment.confidenceCalibration} />
          </div>
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

function Severity({ severity }: { severity: "info" | "medium" | "high" }) {
  const className =
    severity === "high"
      ? "border-signal-red/30 text-signal-red"
      : severity === "medium"
        ? "border-signal-amber/30 text-signal-amber"
        : "border-ink-200 text-ink-500";

  return (
    <span className={`rounded border px-2 py-1 font-mono text-[11px] uppercase ${className}`}>
      {severity}
    </span>
  );
}

function Signal({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <span className="block truncate font-mono uppercase text-ink-500">{label}</span>
      <span className="mt-1 block font-semibold text-ink-800">{Math.round(value * 100)}%</span>
    </div>
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
