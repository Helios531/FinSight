import type { AgentClaim, EvidenceCitation } from "@/lib/types";

const toneClasses = {
  green: "border-signal-green/30 text-signal-green",
  red: "border-signal-red/30 text-signal-red",
  amber: "border-signal-amber/30 text-signal-amber"
};

export function AgentSection({
  title,
  tone,
  claims,
  onCitation
}: {
  title: string;
  tone: "green" | "red" | "amber";
  claims: AgentClaim[];
  onCitation: (citation: EvidenceCitation) => void;
}) {
  return (
    <section className="rounded border border-ink-200 bg-white p-4 shadow-hairline">
      <div className="mb-3 flex items-center justify-between border-b border-ink-200 pb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className={`rounded border px-2 py-1 font-mono text-[11px] ${toneClasses[tone]}`}>
          {claims.length} claims
        </span>
      </div>
      <div className="space-y-3">
        {claims.map((claim) => (
          <article key={claim.id} className="rounded border border-ink-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold">{claim.title}</h3>
              <span className="rounded border border-ink-200 px-2 py-1 font-mono text-[11px] text-ink-600">
                {Math.round(claim.confidence * 100)}%
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-700">{claim.claim}</p>
            {claim.caveats.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-ink-500">
                {claim.caveats.map((caveat) => (
                  <li key={caveat}>{caveat}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-1">
              {claim.citations.map((citation) => (
                <button
                  key={citation.id}
                  type="button"
                  onClick={() => onCitation(citation)}
                  className="rounded border border-ink-200 px-2 py-1 font-mono text-[11px] text-ink-600 hover:border-ink-500"
                >
                  {citation.section}
                  {citation.page
                    ? ` p.${citation.page}${citation.pageEnd && citation.pageEnd !== citation.page ? `-${citation.pageEnd}` : ""}`
                    : ""}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
