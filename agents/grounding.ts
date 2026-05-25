import type { AgentClaim } from "@/lib/types";
import { evidenceToCitation, type RetrievedEvidence } from "@/retrieval/store";
import { stableClaimId } from "@/agents/common";

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
  const grounded = claims
    .filter((claim) => claim.citations.length > 0)
    .map((claim) => {
      const supportScore = citationSupportScore(claim.claim, claim.citations.map((citation) => citation.excerpt).join("\n"));
      return {
        ...claim,
        claim: sanitizeClaimText(claim.claim),
        title: sanitizeClaimText(claim.title),
        confidence: supportScore < 0.16 ? Math.min(claim.confidence, 0.42) : claim.confidence,
        caveats: [
          ...claim.caveats,
          ...(rejectGenericFluff(claim.claim)
            ? ["Generic finance language was removed because it was not evidence-specific."]
            : []),
          ...(supportScore < 0.16
            ? [`Evidence overlap is weak (${Math.round(supportScore * 100)}%), so confidence was reduced.`]
            : [])
        ]
      };
    })
    .filter((claim) => citationSupportScore(claim.claim, claim.citations.map((citation) => citation.excerpt).join("\n")) >= 0.08);

  if (grounded.length > 0) return grounded;

  return [insufficientEvidenceClaim(claims[0]?.polarity ?? "neutral", fallbackEvidence)];
}

export function citationSupportScore(claim: string, evidenceText: string) {
  const claimTokens = contentTokens(claim);
  if (claimTokens.length === 0) return 0;
  const evidence = evidenceText.toLowerCase();
  const supported = claimTokens.filter((token) => evidence.includes(token)).length;
  return supported / claimTokens.length;
}

function insufficientEvidenceClaim(polarity: AgentClaim["polarity"], fallbackEvidence: RetrievedEvidence[]): AgentClaim {
  const citations = fallbackEvidence.slice(0, 2).map(evidenceToCitation);
  const title = "Insufficient retrieved evidence";
  const claim =
    citations.length > 0
      ? "Retrieved evidence was not specific enough to support a stronger agent conclusion."
      : "No supported conclusion is available because retrieval returned no evidence.";
  return {
    id: stableClaimId(title, claim, citations),
    title,
    claim,
    polarity,
    confidence: 0.1,
    citations,
    caveats: ["Unsupported or weakly supported claims were rejected by the grounding layer."]
  };
}

function contentTokens(text: string) {
  const stopwords = new Set([
    "the",
    "and",
    "or",
    "to",
    "of",
    "in",
    "for",
    "a",
    "an",
    "with",
    "on",
    "by",
    "as",
    "is",
    "are",
    "was",
    "were",
    "this",
    "that",
    "from",
    "because"
  ]);
  return Array.from(new Set(text.toLowerCase().match(/[a-z0-9$%.]+/g) ?? []))
    .filter((token) => token.length > 2)
    .filter((token) => !stopwords.has(token));
}
