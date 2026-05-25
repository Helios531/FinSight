import type { AgentClaim } from "@/lib/types";
import type { RetrievedEvidence } from "@/retrieval/store";

const bannedPhrases = [
  "strong fundamentals",
  "transformational growth",
  "industry-leading innovation",
  "robust performance",
  "solid momentum"
];

export function rejectGenericFluff(text: string) {
  const lower = text.toLowerCase();
  return bannedPhrases.some((phrase) => lower.includes(phrase));
}

export function sanitizeClaimText(text: string) {
  let sanitized = text.trim();
  for (const phrase of bannedPhrases) {
    sanitized = sanitized.replace(new RegExp(phrase, "gi"), "evidence-supported signal");
  }
  return sanitized;
}

export function enforceGrounding(claims: AgentClaim[], fallbackEvidence: RetrievedEvidence[]) {
  return claims
    .filter((claim) => claim.citations.length > 0)
    .map((claim) => ({
      ...claim,
      claim: sanitizeClaimText(claim.claim),
      title: sanitizeClaimText(claim.title),
      caveats: [
        ...claim.caveats,
        ...(rejectGenericFluff(claim.claim)
          ? ["Generic finance language was removed because it was not evidence-specific."]
          : [])
      ]
    }))
    .concat(
      claims.length === 0 && fallbackEvidence.length === 0
        ? [
            {
              id: crypto.randomUUID(),
              title: "Insufficient retrieved evidence",
              claim: "No supported conclusion is available because retrieval returned no evidence.",
              polarity: "neutral" as const,
              confidence: 0.1,
              citations: [],
              caveats: ["Analyst review required before drawing conclusions."]
            }
          ]
        : []
    );
}
