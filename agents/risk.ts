import { z } from "zod";
import { buildClaim, compactEvidence, meanScore, retrievalDiagnostic } from "@/agents/common";
import { enforceGrounding } from "@/agents/grounding";
import { completeJson } from "@/agents/llm";
import type { AgentContext, AgentResult } from "@/agents/types";
import type { AgentClaim } from "@/lib/types";
import type { RetrievedEvidence } from "@/retrieval/store";

const queries = [
  "risk factors legal regulatory litigation investigation compliance exposure",
  "debt liquidity covenant going concern cash maturity refinancing concentration risk",
  "macro sensitivity accounting estimate impairment internal control uncertainty"
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

export async function runRiskAgent(context: AgentContext): Promise<AgentResult> {
  const startedAt = Date.now();
  const retrievals = await Promise.all(
    queries.map((query) => context.store.search(query, 5, { documentId: context.documentId, minScore: 0.16 }))
  );
  const evidence = retrievals.flat();

  const { value, tokenUsage } = await completeJson<LlmClaims>({
    trace: { agent: "Risk Agent" },
    schema: llmClaimsSchema,
    system:
      "You are the Risk Agent. Focus only on risk exposure, uncertainty, regulatory/legal, debt/liquidity, concentration, macro, accounting, and operational risks. Reduce confidence when evidence is weak. Cite evidence ids.",
    user: JSON.stringify({
      task: "Return JSON with a claims array. Each claim must have title, claim, citationIds, confidence from 0 to 1, and caveats explaining weak evidence.",
      structuredMetrics: context.structuredMetrics,
      evidence: compactEvidence(evidence)
    }),
    fallback: () => ({
      claims: [
        {
          title: "Risk exposure requiring review",
          claim: fallbackClaim(evidence[0]?.chunk.text),
          citationIds: evidence.slice(0, 2).map((item) => item.chunk.id),
          confidence: Math.min(0.62, Math.max(0.35, meanScore(evidence.slice(0, 2)))),
          caveats: ["Confidence is reduced because fallback analysis cannot infer unstated risk materiality."]
        }
      ]
    })
  });

  const claims = enforceGrounding(mapLlmClaims(value, evidence), evidence);
  return {
    claims,
    evidence,
    trace: {
      agent: "Risk Agent",
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
      polarity: "risk",
      evidence: citedEvidence.length > 0 ? citedEvidence : evidence.slice(0, 2),
      confidence: Math.max(0.1, Math.min(0.85, claim.confidence)),
      caveats: claim.caveats ?? []
    });
  });
}

function fallbackClaim(text?: string) {
  if (!text) return "No risk conclusion is supported because retrieval did not return relevant evidence.";
  return `The most relevant retrieved risk passage is: ${text.slice(0, 220)}`;
}
