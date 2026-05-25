import { createHash } from "node:crypto";
import { createPgPool } from "@/db/client";
import { env } from "@/lib/config";
import { logger } from "@/lib/logger";
import type {
  AnalysisReport,
  EvidenceCitation,
  KnowledgeGraphEdge,
  KnowledgeGraphEdgeType,
  KnowledgeGraphNode,
  KnowledgeGraphNodeType,
  KnowledgeGraphSummary
} from "@/lib/types";

const inProcessGraphs = new Map<string, KnowledgeGraphSummary>();

export async function createKnowledgeGraph(report: AnalysisReport): Promise<KnowledgeGraphSummary> {
  const graph = buildKnowledgeGraph(report);
  const saved = env.DATABASE_URL ? await saveGraphWithPg(graph) : saveInProcess(graph);

  logger.info("knowledge_graph.updated", {
    graphId: saved.graphId,
    documentId: saved.documentId,
    nodeCount: saved.nodeCount,
    edgeCount: saved.edgeCount
  });

  return saved;
}

export function buildKnowledgeGraph(report: AnalysisReport): KnowledgeGraphSummary {
  const builder = new GraphBuilder(report);
  builder.addCompanyMemory();
  builder.addPortfolioContext();
  builder.addCrossCompanyContext();
  builder.addExtractedEntities();

  const nodes = builder.nodes();
  const edges = builder.edges();
  const diagnostics = [
    ...(nodes.some((node) => node.type === "executive") ? [] : ["No executive entity was detected in cited text."]),
    ...(nodes.some((node) => node.type === "supplier") ? [] : ["No supplier entity was detected in cited text."]),
    ...(nodes.some((node) => node.type === "product") ? [] : ["No product entity was detected in cited text."])
  ];

  return {
    graphId: `kg_${stableHash(`${report.document.id}:${nodes.length}:${edges.length}`).slice(0, 24)}`,
    documentId: report.document.id,
    companyId: report.companyMemory?.companyId,
    generatedAt: report.document.processedAt,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes,
    edges,
    diagnostics
  };
}

class GraphBuilder {
  private nodeMap = new Map<string, KnowledgeGraphNode>();
  private edgeMap = new Map<string, KnowledgeGraphEdge>();

  constructor(private report: AnalysisReport) {}

  addCompanyMemory() {
    const memory = this.report.companyMemory;
    if (!memory) return;
    const company = this.addNode("company", memory.companyId, memory.companyName, {
      filingCount: memory.filingCount
    });

    for (const risk of memory.recurringRisks) {
      const riskNode = this.addNode("risk", risk.theme, risk.label, {
        occurrenceCount: risk.occurrenceCount
      }, risk.citations);
      this.addEdge(company.id, riskNode.id, "exposed_to", risk.occurrenceCount, risk.citations);
    }

    for (const claim of memory.managementClaims.slice(0, 6)) {
      this.addTextEntities(company.id, claim.claim, claim.citations);
    }
  }

  addPortfolioContext() {
    const portfolio = this.report.portfolio;
    if (!portfolio) return;

    for (const company of portfolio.companies) {
      const companyNode = this.addNode("company", company.companyId, company.companyName, {
        alertCount: company.alertCount,
        concentrationWeight: company.concentrationWeight
      });
      const sector = this.addNode("sector", company.sector, company.sector, {
        companyCount: portfolio.sectorExposure.find((item) => item.sector === company.sector)?.companyCount ?? 1
      });
      this.addEdge(companyNode.id, sector.id, "operates_in", 1);

      for (const risk of company.topRisks) {
        const riskNode = this.addNode("risk", normalizeKey(risk), risk);
        this.addEdge(companyNode.id, riskNode.id, "exposed_to", 1);
      }
    }

    for (const overlap of portfolio.overlappingRisks) {
      const risk = this.addNode("risk", overlap.theme, overlap.label, {
        companyCount: overlap.companyCount
      }, overlap.citations);
      for (const companyName of overlap.companies) {
        const company = portfolio.companies.find((item) => item.companyName === companyName);
        if (company) this.addEdge(`company:${company.companyId}`, risk.id, "shares_risk", overlap.companyCount, overlap.citations);
      }
    }
  }

  addCrossCompanyContext() {
    const cross = this.report.crossCompany;
    if (!cross) return;

    for (const comparison of cross.competitorComparisons) {
      const companies = comparison.companies
        .map((name) => this.findCompanyNodeByLabel(name))
        .filter((node): node is KnowledgeGraphNode => Boolean(node));
      if (companies.length === 2) {
        this.addEdge(companies[0].id, companies[1].id, "competes_with", 1 + comparison.sharedRisks.length);
      }
    }

    for (const exposure of cross.macroExposures) {
      const macro = this.addNode("macro_factor", exposure.factor, exposure.label, {
        severity: exposure.severity
      }, exposure.citations);
      for (const companyName of exposure.companies) {
        const company = this.findCompanyNodeByLabel(companyName);
        if (company) this.addEdge(company.id, macro.id, "linked_to_macro", exposure.evidence.length || 1, exposure.citations);
      }
    }
  }

  addExtractedEntities() {
    const claims = [
      ...this.report.executiveSummary,
      ...this.report.bullCase,
      ...this.report.bearCase,
      ...this.report.riskAnalysis
    ];
    const companyId = this.report.companyMemory?.companyId ? `company:${this.report.companyMemory.companyId}` : undefined;
    if (!companyId) return;

    for (const claim of claims) {
      this.addTextEntities(companyId, `${claim.title}. ${claim.claim}`, claim.citations);
    }
  }

  nodes() {
    return Array.from(this.nodeMap.values()).sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label));
  }

  edges() {
    return Array.from(this.edgeMap.values()).sort((a, b) => a.type.localeCompare(b.type) || b.weight - a.weight);
  }

  private addTextEntities(companyId: string, text: string, citations: EvidenceCitation[]) {
    for (const executive of extractExecutives(text)) {
      const node = this.addNode("executive", executive, executive, {}, citations);
      this.addEdge(companyId, node.id, "managed_by", 1, citations);
    }
    for (const supplier of extractSuppliers(text)) {
      const node = this.addNode("supplier", supplier, supplier, {}, citations);
      this.addEdge(node.id, companyId, "supplies", 1, citations);
    }
    for (const product of extractProducts(text)) {
      const node = this.addNode("product", product, product, {}, citations);
      this.addEdge(companyId, node.id, "mentions", 1, citations);
    }
  }

  private addNode(
    type: KnowledgeGraphNodeType,
    key: string,
    label: string,
    properties: KnowledgeGraphNode["properties"] = {},
    citations: EvidenceCitation[] = []
  ) {
    const id = `${type}:${normalizeKey(key)}`;
    const existing = this.nodeMap.get(id);
    if (existing) {
      existing.citations = uniqueCitations([...existing.citations, ...citations]).slice(0, 6);
      existing.properties = { ...existing.properties, ...properties };
      return existing;
    }
    const node: KnowledgeGraphNode = {
      id,
      type,
      label,
      properties,
      citations: uniqueCitations(citations).slice(0, 6)
    };
    this.nodeMap.set(id, node);
    return node;
  }

  private addEdge(
    sourceId: string,
    targetId: string,
    type: KnowledgeGraphEdgeType,
    weight: number,
    citations: EvidenceCitation[] = []
  ) {
    if (sourceId === targetId) return;
    const id = `edge:${stableHash(`${sourceId}:${type}:${targetId}`).slice(0, 24)}`;
    const existing = this.edgeMap.get(id);
    if (existing) {
      existing.weight = round(existing.weight + weight);
      existing.evidenceCount += Math.max(1, citations.length);
      existing.citations = uniqueCitations([...existing.citations, ...citations]).slice(0, 6);
      return;
    }
    this.edgeMap.set(id, {
      id,
      sourceId,
      targetId,
      type,
      weight: round(weight),
      evidenceCount: Math.max(1, citations.length),
      citations: uniqueCitations(citations).slice(0, 6)
    });
  }

  private findCompanyNodeByLabel(label: string) {
    return Array.from(this.nodeMap.values()).find((node) => node.type === "company" && node.label === label);
  }
}

async function saveGraphWithPg(graph: KnowledgeGraphSummary): Promise<KnowledgeGraphSummary> {
  const pool = createPgPool();
  if (!pool) return saveInProcess(graph);
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      `insert into knowledge_graphs (id, document_id, company_id, generated_at, diagnostics)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict (id) do update set diagnostics = excluded.diagnostics`,
      [graph.graphId, graph.documentId, graph.companyId ?? null, graph.generatedAt, JSON.stringify(graph.diagnostics)]
    );

    for (const node of graph.nodes) {
      await client.query(
        `insert into knowledge_graph_nodes (id, graph_id, node_type, label, properties, citations)
         values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
         on conflict (id) do update set properties = excluded.properties, citations = excluded.citations`,
        [node.id, graph.graphId, node.type, node.label, JSON.stringify(node.properties), JSON.stringify(node.citations)]
      );
    }

    for (const edge of graph.edges) {
      await client.query(
        `insert into knowledge_graph_edges (
          id, graph_id, source_id, target_id, edge_type, weight, evidence_count, citations
        ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        on conflict (id) do update set weight = excluded.weight, evidence_count = excluded.evidence_count, citations = excluded.citations`,
        [
          edge.id,
          graph.graphId,
          edge.sourceId,
          edge.targetId,
          edge.type,
          edge.weight,
          edge.evidenceCount,
          JSON.stringify(edge.citations)
        ]
      );
    }

    await client.query("commit");
    return graph;
  } catch (error) {
    await client.query("rollback");
    logger.warn("knowledge_graph.pg_failed", {
      graphId: graph.graphId,
      error: error instanceof Error ? error.message : String(error)
    });
    return saveInProcess(graph);
  } finally {
    client.release();
  }
}

function saveInProcess(graph: KnowledgeGraphSummary) {
  inProcessGraphs.set(graph.graphId, graph);
  return graph;
}

function extractExecutives(text: string) {
  const matches = Array.from(text.matchAll(/\b(?:CEO|CFO|COO|CTO|Chief Executive Officer|Chief Financial Officer)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g));
  return Array.from(new Set(matches.map((match) => match[1])));
}

function extractSuppliers(text: string) {
  const matches = Array.from(text.matchAll(/\b(?:supplier|vendor|partner)\s+([A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+){0,2})/g));
  return Array.from(new Set(matches.map((match) => match[1].replace(/[.,;:]$/, ""))));
}

function extractProducts(text: string) {
  const matches = Array.from(text.matchAll(/\b(?:product|platform|service)\s+([A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+){0,2})/g));
  return Array.from(new Set(matches.map((match) => match[1].replace(/[.,;:]$/, ""))));
}

function uniqueCitations(citations: EvidenceCitation[]) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    if (seen.has(citation.id)) return false;
    seen.add(citation.id);
    return true;
  });
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
