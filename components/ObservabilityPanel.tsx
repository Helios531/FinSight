import { Activity } from "lucide-react";
import type { AgentRun } from "@/lib/types";

export function ObservabilityPanel({ traces }: { traces: AgentRun[] }) {
  return (
    <section className="rounded border border-ink-200 bg-white p-4 shadow-hairline">
      <div className="mb-3 flex items-center gap-2 border-b border-ink-200 pb-3">
        <Activity className="h-4 w-4" aria-hidden />
        <h2 className="text-sm font-semibold">Agent Trace</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-xs uppercase text-ink-500">
              <th className="py-2 pr-3 font-medium">Agent</th>
              <th className="py-2 pr-3 font-medium">Latency</th>
              <th className="py-2 pr-3 font-medium">Tokens</th>
              <th className="py-2 pr-3 font-medium">Retrieval diagnostics</th>
            </tr>
          </thead>
          <tbody>
            {traces.map((trace) => (
              <tr key={trace.agent} className="border-b border-ink-100 align-top">
                <td className="py-2 pr-3 font-medium">{trace.agent}</td>
                <td className="py-2 pr-3 font-mono">{trace.latencyMs}ms</td>
                <td className="py-2 pr-3 font-mono">
                  {trace.tokenUsage ? `${trace.tokenUsage.input} in / ${trace.tokenUsage.output} out` : "fallback/local"}
                </td>
                <td className="py-2 pr-3">
                  <div className="space-y-2">
                    {trace.retrievalDiagnostics.length === 0 ? (
                      <span className="text-ink-500">No retrieval step</span>
                    ) : (
                      trace.retrievalDiagnostics.map((diagnostic) => (
                        <div key={diagnostic.query} className="rounded border border-ink-200 p-2">
                          <p className="text-xs text-ink-700">{diagnostic.query}</p>
                          <p className="mt-1 font-mono text-[11px] text-ink-500">
                            relevance {Math.round(diagnostic.meanRelevance * 100)}% | chunks{" "}
                            {diagnostic.retrievedChunkIds.length}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
