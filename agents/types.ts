import type { AgentClaim, AgentRun, EvidenceCitation, KeyMetric } from "@/lib/types";
import type { RetrievedEvidence, VectorStore } from "@/retrieval/store";

export type AgentRole = "bull" | "bear" | "risk" | "referee";

export type AgentContext = {
  documentId: string;
  filename: string;
  store: VectorStore;
  structuredMetrics: KeyMetric[];
};

export type AgentResult = {
  claims: AgentClaim[];
  evidence: RetrievedEvidence[];
  trace: AgentRun;
};

export type RefereeInput = {
  bull: AgentResult;
  bear: AgentResult;
  risk: AgentResult;
  citations: EvidenceCitation[];
};
