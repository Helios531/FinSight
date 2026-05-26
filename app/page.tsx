"use client";

import { useState } from "react";
import { Activity, BarChart3, Bell, Building2, FileSearch, Landmark, Network, ShieldCheck } from "lucide-react";
import { AnalysisDashboard } from "@/components/AnalysisDashboard";
import { ProcessingTimeline } from "@/components/ProcessingTimeline";
import { UploadPanel } from "@/components/UploadPanel";
import type { AnalysisReport } from "@/lib/types";

export default function Home() {
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [stage, setStage] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="min-h-screen text-ink-950">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-luxury-graphite text-white lg:flex lg:flex-col">
          <div className="border-b border-white/10 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-luxury-gold/40 bg-white/5">
                <Landmark className="h-5 w-5 text-luxury-gold" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold">Financial Sight</p>
                <p className="font-mono text-[11px] uppercase text-white/45">Institutional AI</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-4 py-5 text-sm">
            <SidebarItem icon={<Activity className="h-4 w-4" aria-hidden />} label="Analysis Desk" active />
            <SidebarItem icon={<FileSearch className="h-4 w-4" aria-hidden />} label="Evidence Library" />
            <SidebarItem icon={<Building2 className="h-4 w-4" aria-hidden />} label="Company Memory" />
            <SidebarItem icon={<Network className="h-4 w-4" aria-hidden />} label="Knowledge Graph" />
            <SidebarItem icon={<Bell className="h-4 w-4" aria-hidden />} label="Risk Alerts" />
            <SidebarItem icon={<ShieldCheck className="h-4 w-4" aria-hidden />} label="Audit Trail" />
          </nav>
          <div className="m-4 rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <p className="font-mono text-[11px] uppercase text-white/45">Current posture</p>
            <p className="mt-2 text-sm font-medium">Cited, deterministic, analyst-review ready.</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-white/10 bg-black/10 p-2">
                <span className="block font-mono text-white/45">MODE</span>
                <span>RAG</span>
              </div>
              <div className="rounded border border-white/10 bg-black/10 p-2">
                <span className="block font-mono text-white/45">AUDIT</span>
                <span>On</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-ink-200/70 bg-luxury-pearl/90 px-4 py-4 backdrop-blur md:px-6">
            <div className="mx-auto flex max-w-[1500px] flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="font-mono text-xs uppercase text-ink-500">Financial Intelligence Workspace</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-normal">Earnings Call + SEC Filing Analysis</h1>
              </div>
              <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-elevated">
                <TopMetric label="Grounding" value="Citation-first" />
                <TopMetric label="Confidence" value={report ? `${report.confidence.score}%` : "Pending"} />
                <TopMetric label="Review" value={stage === "complete" ? "Ready" : stage === "error" ? "Blocked" : "Open"} />
              </div>
            </div>
          </header>

          <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 md:px-6 xl:grid-cols-[380px_1fr]">
            <aside className="flex flex-col gap-4">
              <UploadPanel onError={setError} onReport={setReport} onStage={setStage} />
              <ProcessingTimeline activeStage={stage} />
              {error ? (
                <div className="rounded-lg border border-signal-red/25 bg-white p-3 text-sm text-signal-red shadow-elevated">
                  {error}
                </div>
              ) : null}
              <section className="rounded-lg border border-ink-200 bg-white p-4 shadow-elevated">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-luxury-mint" aria-hidden />
                  <h2 className="text-sm font-semibold">Desk Profile</h2>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <DeskStat label="Agents" value="4" />
                  <DeskStat label="Signals" value={report?.predictiveRisk ? String(report.predictiveRisk.signals.length) : "0"} />
                  <DeskStat label="Memory" value={report?.companyMemory ? String(report.companyMemory.filingCount) : "0"} />
                  <DeskStat label="Evidence" value={report ? String(report.citations.length) : "0"} />
                </div>
              </section>
            </aside>
            <AnalysisDashboard report={report} />
          </div>
        </div>
      </div>
    </main>
  );
}

function SidebarItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
        active
          ? "border border-luxury-gold/30 bg-white/10 text-white"
          : "text-white/62 hover:bg-white/[0.04] hover:text-white"
      }`}
    >
      <span className={active ? "text-luxury-gold" : "text-white/45"}>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function TopMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-r border-ink-100 px-4 py-3 last:border-r-0">
      <span className="block font-mono text-[11px] uppercase text-ink-500">{label}</span>
      <span className="mt-1 block truncate text-sm font-semibold">{value}</span>
    </div>
  );
}

function DeskStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
      <span className="block font-mono text-[11px] uppercase text-ink-500">{label}</span>
      <span className="mt-1 block text-lg font-semibold">{value}</span>
    </div>
  );
}
