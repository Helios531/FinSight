import type { RetrievedEvidence } from "@/retrieval/store";

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
  "were"
]);

export type RankingOptions = {
  limit: number;
  minScore?: number;
  diversityBySection?: boolean;
};

export function rankEvidence(
  query: string,
  candidates: RetrievedEvidence[],
  options: RankingOptions
): RetrievedEvidence[] {
  const queryTokens = tokenize(query);
  const reranked = candidates
    .map((candidate) => scoreCandidate(candidate, queryTokens))
    .filter((candidate) => candidate.score >= (options.minScore ?? 0))
    .sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index || a.chunk.id.localeCompare(b.chunk.id));

  return diversify(dedupeByText(reranked), options).slice(0, options.limit);
}

export function lexicalScore(query: string, text: string) {
  return scoreTokens(tokenize(query), text);
}

function scoreCandidate(candidate: RetrievedEvidence, queryTokens: string[]): RetrievedEvidence {
  const keywordScore = scoreTokens(queryTokens, candidate.chunk.metadata.retrievalText);
  const sectionBoost = queryTokens.some((token) => candidate.chunk.section.toLowerCase().includes(token)) ? 0.08 : 0;
  const tableBoost = candidate.chunk.metadata.hasTableLikeContent && queryTokens.some(isFinancialToken) ? 0.05 : 0;
  const timestampBoost = candidate.chunk.timestamp ? 0.02 : 0;
  const semanticScore = candidate.semanticScore ?? candidate.score;
  const score = semanticScore * 0.68 + keywordScore * 0.24 + sectionBoost + tableBoost + timestampBoost;

  return {
    ...candidate,
    score: Number(Math.max(0, Math.min(1, score)).toFixed(6)),
    semanticScore: Number(semanticScore.toFixed(6)),
    keywordScore: Number(keywordScore.toFixed(6)),
    rankingSignals: [
      `semantic:${semanticScore.toFixed(3)}`,
      `keyword:${keywordScore.toFixed(3)}`,
      ...(sectionBoost > 0 ? ["section-match"] : []),
      ...(tableBoost > 0 ? ["table-like"] : []),
      ...(timestampBoost > 0 ? ["timestamp"] : [])
    ]
  };
}

function scoreTokens(tokens: string[], text: string) {
  if (tokens.length === 0) return 0;
  const normalized = text.toLowerCase();
  const matches = tokens.filter((token) => normalized.includes(token)).length;
  return matches / tokens.length;
}

function tokenize(text: string) {
  return Array.from(new Set(text.toLowerCase().match(/[a-z0-9$%.]+/g) ?? []))
    .filter((token) => token.length > 1)
    .filter((token) => !stopwords.has(token));
}

function dedupeByText(candidates: RetrievedEvidence[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.chunk.text.slice(0, 240).toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function diversify(candidates: RetrievedEvidence[], options: RankingOptions) {
  if (!options.diversityBySection) return candidates;

  const selected: RetrievedEvidence[] = [];
  const sectionCounts = new Map<string, number>();

  for (const candidate of candidates) {
    const count = sectionCounts.get(candidate.chunk.section) ?? 0;
    if (count < 2 || selected.length < Math.ceil(options.limit / 2)) {
      selected.push(candidate);
      sectionCounts.set(candidate.chunk.section, count + 1);
    }
  }

  for (const candidate of candidates) {
    if (selected.length >= options.limit) break;
    if (!selected.some((item) => item.chunk.id === candidate.chunk.id)) {
      selected.push(candidate);
    }
  }

  return selected;
}

function isFinancialToken(token: string) {
  return [
    "revenue",
    "margin",
    "cash",
    "flow",
    "debt",
    "liquidity",
    "eps",
    "growth",
    "increase",
    "decrease",
    "percent",
    "%"
  ].includes(token);
}
