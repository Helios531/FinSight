import { CheckCircle2, Circle, CircleAlert } from "lucide-react";

const steps = [
  { id: "upload", label: "Upload received" },
  { id: "parse", label: "Parse and chunk" },
  { id: "retrieve", label: "Embed and retrieve" },
  { id: "agents", label: "Agent analysis" },
  { id: "referee", label: "Referee synthesis" }
];

export function ProcessingTimeline({ activeStage }: { activeStage: string }) {
  const activeIndex = steps.findIndex((step) => step.id === activeStage);
  const isComplete = activeStage === "complete";
  const isError = activeStage === "error";

  return (
    <section className="rounded border border-ink-200 bg-white p-4 shadow-hairline">
      <h2 className="text-sm font-semibold">Processing Status</h2>
      <ol className="mt-3 space-y-2">
        {steps.map((step, index) => {
          const done = isComplete || (activeIndex >= 0 && index < activeIndex);
          const current = step.id === activeStage;
          return (
            <li key={step.id} className="flex items-center gap-2 text-sm">
              {done ? (
                <CheckCircle2 className="h-4 w-4 text-signal-green" aria-hidden />
              ) : isError && index === Math.max(activeIndex, 0) ? (
                <CircleAlert className="h-4 w-4 text-signal-red" aria-hidden />
              ) : (
                <Circle className={`h-4 w-4 ${current ? "text-signal-blue" : "text-ink-300"}`} aria-hidden />
              )}
              <span className={current ? "font-medium text-ink-950" : "text-ink-600"}>{step.label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
