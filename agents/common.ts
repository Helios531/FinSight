import type { AgentClaim, ClaimPolarity, EvidenceCitation } from "@/lib/types";
import { evidenceToCitation, type RetrievedEvidence } from "@/retrieval/store";

export function buildClaim({
  title,
  claim,
  polarity,
  evidence,
  confidence,
  caveats = []
}: {
  title: string;
  claim: string;
  polarity: ClaimPolarity;
  evidence: RetrievedEvidence[];
  confidence: number;
  caveats?: string[];
}): AgentClaim {
  return {
    id: crypto.randomUUID(),
    title,
    claim,
    polarity,
    confidence,
    citations: evidence.slice(0, 2).map(evidenceToCitation),
    caveats
  };
}

export function compactEvidence(evidence: RetrievedEvidence[]) {
  return evidence.map((item, index) => ({
    id: item.chunk.id,
    rank: index + 1,
    section: item.chunk.section,
    page: item.chunk.page,
    pageEnd: item.chunk.pageEnd,
    timestamp: item.chunk.timestamp,
    score: Number(item.score.toFixed(3)),
    keywordScore: item.keywordScore,
    semanticScore: item.semanticScore,
    rankingSignals: item.rankingSignals ?? [],
    excerpt: item.chunk.text.slice(0, 900)
  }));
}

export function dedupeCitations(citations: EvidenceCitation[]) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    if (seen.has(citation.id)) return false;
    seen.add(citation.id);
    return true;
  });
}

export function meanScore(evidence: RetrievedEvidence[]) {
  if (evidence.length === 0) return 0;
  return evidence.reduce((sum, item) => sum + item.score, 0) / evidence.length;
}

export function retrievalDiagnostic(query: string, evidence: RetrievedEvidence[]) {
  const scores = evidence.map((item) => item.score);
  return {
    query,
    retrievedChunkIds: evidence.map((item) => item.chunk.id),
    meanRelevance: meanScore(evidence),
    minRelevance: scores.length > 0 ? Math.min(...scores) : undefined,
    maxRelevance: scores.length > 0 ? Math.max(...scores) : undefined,
    rankingSignals: Object.fromEntries(evidence.map((item) => [item.chunk.id, item.rankingSignals ?? []]))
  };
}
