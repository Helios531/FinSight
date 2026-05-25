export type DocumentKind = "earnings_call" | "sec_filing" | "financial_pdf";

export type EvidenceCitation = {
  id: string;
  documentId: string;
  sourceFile: string;
  section: string;
  page?: number;
  timestamp?: string;
  excerpt: string;
  relevanceScore: number;
};

export type ClaimPolarity = "bull" | "bear" | "risk" | "neutral";

export type AgentClaim = {
  id: string;
  title: string;
  claim: string;
  polarity: ClaimPolarity;
  confidence: number;
  citations: EvidenceCitation[];
  caveats: string[];
};

export type KeyMetric = {
  id: string;
  label: string;
  value: string;
  period?: string;
  citations: EvidenceCitation[];
  verification: {
    status: "verified" | "unverified" | "conflict";
    explanation: string;
    computedValue?: string;
  };
};

export type AgentRun = {
  agent: "Bull Agent" | "Bear Agent" | "Risk Agent" | "Referee Agent";
  latencyMs: number;
  tokenUsage?: {
    input: number;
    output: number;
  };
  retrievalDiagnostics: {
    query: string;
    retrievedChunkIds: string[];
    meanRelevance: number;
  }[];
};

export type ConfidenceAssessment = {
  score: number;
  label: "High" | "Medium" | "Low";
  drivers: string[];
  reductions: string[];
};

export type AnalysisReport = {
  document: {
    id: string;
    filename: string;
    kind: DocumentKind;
    chunkCount: number;
    processedAt: string;
  };
  executiveSummary: AgentClaim[];
  bullCase: AgentClaim[];
  bearCase: AgentClaim[];
  riskAnalysis: AgentClaim[];
  keyMetrics: KeyMetric[];
  confidence: ConfidenceAssessment;
  citations: EvidenceCitation[];
  disagreements: {
    id: string;
    issue: string;
    bullPosition: string;
    bearOrRiskPosition: string;
    refereeAssessment: string;
    citations: EvidenceCitation[];
  }[];
  finalVerdict: {
    stance: "Constructive" | "Cautious" | "Mixed" | "Insufficient Evidence";
    rationale: string;
    citations: EvidenceCitation[];
  };
  traces: AgentRun[];
};
