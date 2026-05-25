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

export type WatchlistAlertCategory = "company" | "filing" | "earnings" | "risk_change" | "confidence";

export type WatchlistAlertSeverity = "info" | "medium" | "high";

export type WatchlistAlert = {
  id: string;
  companyId: string;
  category: WatchlistAlertCategory;
  severity: WatchlistAlertSeverity;
  title: string;
  message: string;
  documentId: string;
  createdAt: string;
  acknowledged: boolean;
  citations: EvidenceCitation[];
};

export type WatchlistSummary = {
  watchlistId: string;
  companyId: string;
  companyName: string;
  trackedCompanyCount: number;
  alertCount: number;
  unacknowledgedCount: number;
  alerts: WatchlistAlert[];
};

export type PortfolioCompanyExposure = {
  companyId: string;
  companyName: string;
  sector: string;
  filingCount: number;
  riskCount: number;
  alertCount: number;
  concentrationWeight: number;
  latestDocumentId: string;
  latestDocumentFilename: string;
  topRisks: string[];
};

export type PortfolioSectorExposure = {
  sector: string;
  companyCount: number;
  concentrationWeight: number;
  companies: string[];
};

export type PortfolioOverlappingRisk = {
  theme: string;
  label: string;
  companyCount: number;
  companies: string[];
  severity: WatchlistAlertSeverity;
  citations: EvidenceCitation[];
};

export type PortfolioConcentrationSignal = {
  id: string;
  issue: string;
  severity: WatchlistAlertSeverity;
  explanation: string;
  affectedCompanies: string[];
};

export type PortfolioIntelligenceSummary = {
  portfolioId: string;
  companyCount: number;
  filingCount: number;
  alertCount: number;
  highSeverityAlertCount: number;
  sectorExposure: PortfolioSectorExposure[];
  overlappingRisks: PortfolioOverlappingRisk[];
  concentrationSignals: PortfolioConcentrationSignal[];
  companies: PortfolioCompanyExposure[];
  updatedAt: string;
};

export type CompetitorComparison = {
  id: string;
  sector: string;
  companies: string[];
  sharedRisks: string[];
  alertSpread: number;
  assessment: string;
};

export type SectorTrendSignal = {
  sector: string;
  companyCount: number;
  alertPressure: number;
  dominantRisks: string[];
  trend: "rising_risk" | "stable" | "insufficient_data";
};

export type IndustryTrendSignal = {
  theme: string;
  label: string;
  companyCount: number;
  affectedSectors: string[];
  severity: WatchlistAlertSeverity;
  citations: EvidenceCitation[];
};

export type MacroExposureSignal = {
  factor: "rates" | "demand" | "supply_chain" | "regulatory" | "liquidity" | "fx" | "energy";
  label: string;
  companies: string[];
  severity: WatchlistAlertSeverity;
  evidence: string[];
  citations: EvidenceCitation[];
};

export type CrossCompanyIntelligenceSummary = {
  id: string;
  portfolioId: string;
  generatedAt: string;
  competitorComparisons: CompetitorComparison[];
  sectorTrends: SectorTrendSignal[];
  industryTrends: IndustryTrendSignal[];
  macroExposures: MacroExposureSignal[];
  limitations: string[];
};

export type HistoricalChangeSignalType =
  | "new_risk"
  | "recurring_risk"
  | "guidance_change"
  | "narrative_pattern"
  | "metric_deterioration";

export type HistoricalChangeSignal = {
  id: string;
  type: HistoricalChangeSignalType;
  severity: WatchlistAlertSeverity;
  title: string;
  summary: string;
  citations: EvidenceCitation[];
};

export type HistoricalIntelligenceSummary = {
  id: string;
  companyId?: string;
  documentId: string;
  generatedAt: string;
  priorFilingCount: number;
  previousGuidance: CompanyMemoryMetric[];
  historicalRisks: CompanyMemoryRisk[];
  recurringNarratives: CompanyMemoryClaim[];
  signals: HistoricalChangeSignal[];
  limitations: string[];
};

export type KnowledgeGraphNodeType = "company" | "executive" | "supplier" | "product" | "risk" | "sector" | "macro_factor";

export type KnowledgeGraphEdgeType =
  | "operates_in"
  | "exposed_to"
  | "mentions"
  | "supplies"
  | "managed_by"
  | "competes_with"
  | "shares_risk"
  | "linked_to_macro";

export type KnowledgeGraphNode = {
  id: string;
  type: KnowledgeGraphNodeType;
  label: string;
  properties: Record<string, string | number | boolean>;
  citations: EvidenceCitation[];
};

export type KnowledgeGraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  type: KnowledgeGraphEdgeType;
  weight: number;
  evidenceCount: number;
  citations: EvidenceCitation[];
};

export type KnowledgeGraphSummary = {
  graphId: string;
  documentId: string;
  companyId?: string;
  generatedAt: string;
  nodeCount: number;
  edgeCount: number;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  diagnostics: string[];
};

export type PredictiveRiskSignalType =
  | "deteriorating_fundamentals"
  | "fraud_indicator"
  | "liquidity_stress"
  | "narrative_inconsistency";

export type PredictiveRiskSignal = {
  id: string;
  type: PredictiveRiskSignalType;
  severity: WatchlistAlertSeverity;
  confidence: number;
  title: string;
  rationale: string;
  drivers: string[];
  citations: EvidenceCitation[];
};

export type PredictiveRiskSummary = {
  id: string;
  documentId: string;
  generatedAt: string;
  overallRisk: WatchlistAlertSeverity;
  score: number;
  signals: PredictiveRiskSignal[];
  limitations: string[];
};

export type WorkspaceAnnotation = {
  id: string;
  documentId: string;
  targetType: "citation" | "claim" | "metric" | "disagreement" | "portfolio_signal";
  targetId: string;
  note: string;
  author: string;
  createdAt: string;
  citations: EvidenceCitation[];
};

export type WorkspaceSavedFinding = {
  id: string;
  title: string;
  summary: string;
  priority: "low" | "medium" | "high";
  status: "open" | "reviewed";
  owner: string;
  createdAt: string;
  citations: EvidenceCitation[];
};

export type WorkspaceExport = {
  id: string;
  format: "markdown" | "json";
  filename: string;
  generatedAt: string;
  checksum: string;
  content: string;
};

export type AnalystWorkspaceSummary = {
  workspaceId: string;
  documentId: string;
  companyId?: string;
  analystNotes: string[];
  annotations: WorkspaceAnnotation[];
  savedFindings: WorkspaceSavedFinding[];
  collaborators: string[];
  exports: WorkspaceExport[];
  updatedAt: string;
};

export type AuditEvent = {
  id: string;
  documentId: string;
  eventType: "ingest" | "retrieval" | "agent_analysis" | "memory_update" | "workspace_export" | "report_version";
  actor: string;
  occurredAt: string;
  details: Record<string, string | number | boolean>;
};

export type EvidenceTrackingRecord = {
  citationId: string;
  documentId: string;
  section: string;
  page?: number;
  excerptHash: string;
  claimIds: string[];
};

export type ReportVersion = {
  id: string;
  documentId: string;
  version: number;
  createdAt: string;
  checksum: string;
  reproducibilitySeed: string;
};

export type ComplianceSummary = {
  auditId: string;
  documentId: string;
  reproducibilitySeed: string;
  reportChecksum: string;
  evidenceRecordCount: number;
  auditEvents: AuditEvent[];
  evidenceTracking: EvidenceTrackingRecord[];
  versions: ReportVersion[];
  createdAt: string;
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
  watchlist?: WatchlistSummary;
  portfolio?: PortfolioIntelligenceSummary;
  crossCompany?: CrossCompanyIntelligenceSummary;
  historicalIntelligence?: HistoricalIntelligenceSummary;
  knowledgeGraph?: KnowledgeGraphSummary;
  predictiveRisk?: PredictiveRiskSummary;
  workspace?: AnalystWorkspaceSummary;
  compliance?: ComplianceSummary;
  finalVerdict: {
    stance: "Constructive" | "Cautious" | "Mixed" | "Insufficient Evidence";
    rationale: string;
    citations: EvidenceCitation[];
  };
  traces: AgentRun[];
};
