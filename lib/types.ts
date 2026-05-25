export type DocumentKind = "earnings_call" | "sec_filing" | "financial_pdf";

export type EvidenceCitation = {
  id: string;
  documentId: string;
  documentKind: DocumentKind;
  sourceFile: string;
  section: string;
  page?: number;
  pageEnd?: number;
  timestamp?: string;
  excerpt: string;
  relevanceScore: number;
  chunkIndex: number;
  charStart: number;
  charEnd: number;
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
    minRelevance?: number;
    maxRelevance?: number;
    rankingSignals?: Record<string, string[]>;
  }[];
};

export type ConfidenceAssessment = {
  score: number;
  label: "High" | "Medium" | "Low";
  drivers: string[];
  reductions: string[];
};

export type DebateAgentScore = {
  agent: "bull" | "bear" | "risk";
  claimCount: number;
  averageConfidence: number;
  evidenceWeight: number;
  calibratedConfidence: number;
  citationCoverage: number;
};

export type DebateAssessment = {
  contradictionScore: number;
  evidenceWeight: number;
  consensusScore: number;
  confidenceCalibration: number;
  agentScores: DebateAgentScore[];
  findings: string[];
};

export type CompanyMemoryRisk = {
  theme: string;
  label: string;
  firstSeenDocumentId: string;
  lastSeenDocumentId: string;
  occurrenceCount: number;
  lastSeenAt: string;
  citations: EvidenceCitation[];
};

export type CompanyMemoryClaim = {
  id: string;
  claim: string;
  polarity: ClaimPolarity;
  firstSeenDocumentId: string;
  lastSeenDocumentId: string;
  occurrenceCount: number;
  lastSeenAt: string;
  citations: EvidenceCitation[];
};

export type CompanyMemoryMetric = {
  label: string;
  value: string;
  period?: string;
  firstSeenDocumentId: string;
  lastSeenDocumentId: string;
  occurrenceCount: number;
  lastSeenAt: string;
  citations: EvidenceCitation[];
};

export type CompanyMemorySummary = {
  companyId: string;
  companyName: string;
  filingCount: number;
  latestDocumentId: string;
  latestDocumentFilename: string;
  lastUpdatedAt: string;
  pastFilings: Array<{
    documentId: string;
    filename: string;
    kind: DocumentKind;
    processedAt: string;
  }>;
  recurringRisks: CompanyMemoryRisk[];
  managementClaims: CompanyMemoryClaim[];
  historicalMetrics: CompanyMemoryMetric[];
};

export type AnalysisReport = {
  document: {
    id: string;
    filename: string;
    kind: DocumentKind;
    chunkCount: number;
    pageCount?: number;
    parserDiagnostics: string[];
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
    contradictionScore: number;
    evidenceWeight: number;
    confidenceImpact: number;
    citations: EvidenceCitation[];
  }[];
  debateAssessment: DebateAssessment;
  companyMemory?: CompanyMemorySummary;
  finalVerdict: {
    stance: "Constructive" | "Cautious" | "Mixed" | "Insufficient Evidence";
    rationale: string;
    citations: EvidenceCitation[];
  };
  traces: AgentRun[];
};
