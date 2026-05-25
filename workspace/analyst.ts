import { createHash } from "node:crypto";
import { createPgPool } from "@/db/client";
import { env } from "@/lib/config";
import { logger } from "@/lib/logger";
import type {
  AnalysisReport,
  AnalystWorkspaceSummary,
  EvidenceCitation,
  WorkspaceAnnotation,
  WorkspaceExport,
  WorkspaceSavedFinding
} from "@/lib/types";

const defaultCollaborators = ["Lead Analyst", "Risk Reviewer"];
const inProcessWorkspaces = new Map<string, AnalystWorkspaceSummary>();

export async function createAnalystWorkspace(report: AnalysisReport): Promise<AnalystWorkspaceSummary> {
  const workspace = buildAnalystWorkspace(report);
  const saved = env.DATABASE_URL ? await saveWorkspaceWithPg(workspace) : saveWorkspaceInProcess(workspace);

  logger.info("workspace.updated", {
    workspaceId: saved.workspaceId,
    documentId: saved.documentId,
    annotationCount: saved.annotations.length,
    findingCount: saved.savedFindings.length,
    exportCount: saved.exports.length
  });

  return saved;
}

export function buildAnalystWorkspace(report: AnalysisReport): AnalystWorkspaceSummary {
  const generatedAt = report.document.processedAt;
  const workspaceId = stableId("workspace", report.document.id);
  const analystNotes = buildNotes(report);
  const annotations = buildAnnotations(report, generatedAt);
  const savedFindings = buildSavedFindings(report, generatedAt);
  const exports = buildExports({ report, workspaceId, analystNotes, annotations, savedFindings, generatedAt });

  return {
    workspaceId,
    documentId: report.document.id,
    companyId: report.companyMemory?.companyId,
    analystNotes,
    annotations,
    savedFindings,
    collaborators: defaultCollaborators,
    exports,
    updatedAt: generatedAt
  };
}

function buildNotes(report: AnalysisReport) {
  return [
    `${report.finalVerdict.stance} verdict with ${report.confidence.score}% confidence.`,
    `${report.disagreements.length} disagreement area(s) require review.`,
    report.companyMemory
      ? `${report.companyMemory.companyName} has ${report.companyMemory.filingCount} remembered filing(s).`
      : "Company memory is not attached to this analysis.",
    report.portfolio
      ? `${report.portfolio.overlappingRisks.length} overlapping portfolio risk theme(s) detected.`
      : "Portfolio context is not attached to this analysis."
  ];
}

function buildAnnotations(report: AnalysisReport, createdAt: string): WorkspaceAnnotation[] {
  const annotations: WorkspaceAnnotation[] = [];
  for (const claim of [...report.executiveSummary, ...report.riskAnalysis].slice(0, 4)) {
    annotations.push({
      id: stableId("annotation", `${report.document.id}:${claim.id}`),
      documentId: report.document.id,
      targetType: "claim",
      targetId: claim.id,
      note: `Review cited support for: ${claim.title}.`,
      author: "Financial Sight",
      createdAt,
      citations: claim.citations
    });
  }

  for (const disagreement of report.disagreements.slice(0, 3)) {
    annotations.push({
      id: stableId("annotation", `${report.document.id}:${disagreement.id}`),
      documentId: report.document.id,
      targetType: "disagreement",
      targetId: disagreement.id,
      note: `Contradiction ${Math.round(disagreement.contradictionScore * 100)}%; inspect both sides before publication.`,
      author: "Financial Sight",
      createdAt,
      citations: disagreement.citations
    });
  }

  return annotations;
}

function buildSavedFindings(report: AnalysisReport, createdAt: string): WorkspaceSavedFinding[] {
  const findings: WorkspaceSavedFinding[] = [
    {
      id: stableId("finding", `${report.document.id}:verdict`),
      title: `${report.finalVerdict.stance} referee verdict`,
      summary: report.finalVerdict.rationale,
      priority: report.confidence.score < 50 ? "high" : "medium",
      status: "open",
      owner: "Lead Analyst",
      createdAt,
      citations: report.finalVerdict.citations
    }
  ];

  for (const risk of report.riskAnalysis.slice(0, 3)) {
    findings.push({
      id: stableId("finding", `${report.document.id}:${risk.id}`),
      title: risk.title,
      summary: risk.claim,
      priority: risk.confidence >= 0.7 ? "high" : "medium",
      status: "open",
      owner: "Risk Reviewer",
      createdAt,
      citations: risk.citations
    });
  }

  return findings;
}

function buildExports({
  report,
  workspaceId,
  analystNotes,
  annotations,
  savedFindings,
  generatedAt
}: {
  report: AnalysisReport;
  workspaceId: string;
  analystNotes: string[];
  annotations: WorkspaceAnnotation[];
  savedFindings: WorkspaceSavedFinding[];
  generatedAt: string;
}): WorkspaceExport[] {
  const markdown = [
    `# Financial Sight Report: ${report.document.filename}`,
    "",
    `Verdict: ${report.finalVerdict.stance}`,
    `Confidence: ${report.confidence.score}% (${report.confidence.label})`,
    "",
    "## Analyst Notes",
    ...analystNotes.map((note) => `- ${note}`),
    "",
    "## Saved Findings",
    ...savedFindings.map((finding) => `- [${finding.priority}] ${finding.title}: ${finding.summary}`),
    "",
    "## Annotations",
    ...annotations.map((annotation) => `- ${annotation.targetType}:${annotation.targetId} - ${annotation.note}`)
  ].join("\n");

  const json = JSON.stringify(
    {
      document: report.document,
      finalVerdict: report.finalVerdict,
      confidence: report.confidence,
      analystNotes,
      annotations,
      savedFindings
    },
    null,
    2
  );

  return [
    exportArtifact(workspaceId, "markdown", `${report.document.filename}.report.md`, markdown, generatedAt),
    exportArtifact(workspaceId, "json", `${report.document.filename}.report.json`, json, generatedAt)
  ];
}

function exportArtifact(
  workspaceId: string,
  format: WorkspaceExport["format"],
  filename: string,
  content: string,
  generatedAt: string
): WorkspaceExport {
  const checksum = createHash("sha256").update(content).digest("hex");
  return {
    id: stableId("export", `${workspaceId}:${format}:${checksum}`),
    format,
    filename,
    generatedAt,
    checksum,
    content
  };
}

async function saveWorkspaceWithPg(workspace: AnalystWorkspaceSummary): Promise<AnalystWorkspaceSummary> {
  const pool = createPgPool();
  if (!pool) return saveWorkspaceInProcess(workspace);
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      `insert into analyst_workspaces (id, document_id, company_id, title, collaborators, analyst_notes, updated_at)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       on conflict (id) do update set
        company_id = excluded.company_id,
        collaborators = excluded.collaborators,
        analyst_notes = excluded.analyst_notes,
        updated_at = excluded.updated_at`,
      [
        workspace.workspaceId,
        workspace.documentId,
        workspace.companyId ?? null,
        `Workspace for ${workspace.documentId}`,
        JSON.stringify(workspace.collaborators),
        JSON.stringify(workspace.analystNotes),
        workspace.updatedAt
      ]
    );

    for (const annotation of workspace.annotations) {
      await client.query(
        `insert into workspace_annotations (
          id, workspace_id, document_id, target_type, target_id, note, author, created_at, citations
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        on conflict (id) do update set note = excluded.note, citations = excluded.citations`,
        [
          annotation.id,
          workspace.workspaceId,
          annotation.documentId,
          annotation.targetType,
          annotation.targetId,
          annotation.note,
          annotation.author,
          annotation.createdAt,
          JSON.stringify(annotation.citations)
        ]
      );
    }

    for (const finding of workspace.savedFindings) {
      await client.query(
        `insert into workspace_findings (
          id, workspace_id, title, summary, priority, status, owner, created_at, citations
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        on conflict (id) do update set
          summary = excluded.summary,
          priority = excluded.priority,
          status = excluded.status,
          citations = excluded.citations`,
        [
          finding.id,
          workspace.workspaceId,
          finding.title,
          finding.summary,
          finding.priority,
          finding.status,
          finding.owner,
          finding.createdAt,
          JSON.stringify(finding.citations)
        ]
      );
    }

    for (const item of workspace.exports) {
      await client.query(
        `insert into workspace_exports (id, workspace_id, format, filename, generated_at, checksum, content)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (id) do update set content = excluded.content, checksum = excluded.checksum`,
        [item.id, workspace.workspaceId, item.format, item.filename, item.generatedAt, item.checksum, item.content]
      );
    }

    await client.query("commit");
    return workspace;
  } catch (error) {
    await client.query("rollback");
    logger.warn("workspace.pg_failed", {
      workspaceId: workspace.workspaceId,
      error: error instanceof Error ? error.message : String(error)
    });
    return saveWorkspaceInProcess(workspace);
  } finally {
    client.release();
  }
}

function saveWorkspaceInProcess(workspace: AnalystWorkspaceSummary) {
  inProcessWorkspaces.set(workspace.workspaceId, workspace);
  return workspace;
}

function stableId(prefix: string, value: string) {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}
