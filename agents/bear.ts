import { z } from "zod";
import { buildClaim, compactEvidence, meanScore, retrievalDiagnostic } from "@/agents/common";
import { enforceGrounding } from "@/agents/grounding";
import { completeJson } from "@/agents/llm";
import type { AgentContext, AgentResult } from "@/agents/types";
import type { AgentClaim } from "@/lib/types";
import type { RetrievedEvidence } from "@/retrieval/store";

const queries = [
  "decline weakness margin pressure revenue slowdown churn demand soft guidance lowered",
  "losses deterioration expense increase cash burn negative free cash flow",
  "inconsistency suspicious narrative miss headwind pricing pressure"
];

const llmClaimsSchema = z.object({
  claims: z.array(
    z.object({
      title: z.string(),
      claim: z.string(),
      citationIds: z.array(z.string()),
      confidence: z.number().min(0).max(1),
      caveats: z.array(z.string()).optional()
    })
  )
});

type LlmClaims = z.infer<typeof llmClaimsSchema>;

export async function runBearAgent(context: AgentContext): Promise<AgentResult> {
  const startedAt = Date.now();
  const retrievals = await Promise.all(
    queries.map((query) => context.store.search(query, 5, { documentId: context.documentId, minScore: 0.18 }))
  );
  const evidence = retrievals.flat();

  const { value, tokenUsage } = await completeJson<LlmClaims>({
    trace: { agent: "Bear Agent" },
    schema: llmClaimsSchema,
    system:
      "You are the Bear Agent. Argue only bearish evidence: weakness, deterioration, inconsistencies, or downside. Do not invent facts. Every claim must cite provided evidence ids.",
    user: JSON.stringify({
      task: "Return JSON with a claims array. Each claim must have title, claim, citationIds, confidence from 0 to 1, and caveats.",
      structuredMetrics: context.structuredMetrics,
      evidence: compactEvidence(evidence)
    }),
    fallback: () => ({
      claims: [
        {
          title: "Downside signal",
          claim: fallbackClaim("downside", evidence[0]?.chunk.text),
          citationIds: evidence.slice(0, 2).map((item) => item.chunk.id),
          confidence: Math.max(0.42, meanScore(evidence.slice(0, 2)))
        }
      ]
    })
  });

  const claims = enforceGrounding(mapLlmClaims(value, evidence), evidence);
  return {
    claims,
    evidence,
    trace: {
      agent: "Bear Agent",
      latencyMs: Date.now() - startedAt,
      tokenUsage,
      retrievalDiagnostics: queries.map((query, index) => retrievalDiagnostic(query, retrievals[index]))
    }
  };
}

function mapLlmClaims(value: LlmClaims, evidence: RetrievedEvidence[]): AgentClaim[] {
  const byId = new Map(evidence.map((item) => [item.chunk.id, item]));
  return value.claims.slice(0, 4).map((claim) => {
    const citedEvidence = claim.citationIds
      .map((id) => byId.get(id))
      .filter((item): item is RetrievedEvidence => Boolean(item));

    return buildClaim({
      title: claim.title,
      claim: claim.claim,
      polarity: "bear",
      evidence: citedEvidence.length > 0 ? citedEvidence : evidence.slice(0, 2),
      confidence: Math.max(0.1, Math.min(0.95, claim.confidence)),
      caveats: claim.caveats ?? []
    });
  });
}

function fallbackClaim(label: string, text?: string) {
  if (!text) return `No ${label} conclusion is supported because retrieval did not return relevant evidence.`;
  return `The strongest ${label} evidence is limited to this retrieved passage: ${text.slice(0, 220)}`;
}
