import { createHash } from "node:crypto";
import { createPgPool } from "@/db/client";
import { env } from "@/lib/config";
import { logger } from "@/lib/logger";
import type {
  CompanyMemoryRisk,
  CompanyMemorySummary,
  EvidenceCitation,
  PortfolioCompanyExposure,
  PortfolioConcentrationSignal,
  PortfolioIntelligenceSummary,
  PortfolioOverlappingRisk,
  PortfolioSectorExposure,
  WatchlistAlert,
  WatchlistSummary
} from "@/lib/types";

type PortfolioCompanyState = {
  memory: CompanyMemorySummary;
  watchlist: WatchlistSummary;
  sector: string;
};

type PortfolioInput = {
  memory: CompanyMemorySummary;
  watchlist: WatchlistSummary;
};

const defaultPortfolioId = "portfolio_default";
const defaultPortfolioName = "Default Intelligence Portfolio";
const inProcessPortfolio = new Map<string, PortfolioCompanyState>();

export async function updatePortfolioForAnalysis({
  memory,
  watchlist
}: PortfolioInput): Promise<PortfolioIntelligenceSummary> {
  const sector = inferSector(memory);
  const summary = env.DATABASE_URL
    ? await updatePortfolioWithPg({ memory, watchlist, sector })
    : updatePortfolioInProcess({ memory, watchlist, sector });

  logger.info("portfolio.updated", {
    portfolioId: summary.portfolioId,
    companyCount: summary.companyCount,
    filingCount: summary.filingCount,
    alertCount: summary.alertCount,
    highSeverityAlertCount: summary.highSeverityAlertCount,
    overlappingRiskCount: summary.overlappingRisks.length
  });

  return summary;
}

export function buildPortfolioSummary(states: PortfolioCompanyState[], updatedAt = new Date().toISOString()): PortfolioIntelligenceSummary {
  const companies = states.map((state) => companyExposure(state, states.length));
  const sectorExposure = buildSectorExposure(companies);
  const overlappingRisks = buildOverlappingRisks(states);
  const concentrationSignals = buildConcentrationSignals({ companies, sectorExposure, overlappingRisks });
  const alerts = states.flatMap((state) => state.watchlist.alerts);

  return {
    portfolioId: defaultPortfolioId,
    companyCount: companies.length,
    filingCount: companies.reduce((sum, company) => sum + company.filingCount, 0),
    alertCount: alerts.length,
    highSeverityAlertCount: alerts.filter((alert) => alert.severity === "high").length,
    sectorExposure,
    overlappingRisks,
    concentrationSignals,
    companies: companies.sort((a, b) => b.concentrationWeight - a.concentrationWeight || a.companyName.localeCompare(b.companyName)),
    updatedAt
  };
}

export function inferSector(memory: CompanyMemorySummary) {
  const text = [
    memory.companyName,
    memory.latestDocumentFilename,
    ...memory.recurringRisks.map((risk) => `${risk.label} ${risk.theme}`),
    ...memory.managementClaims.map((claim) => claim.claim),
    ...memory.historicalMetrics.map((metric) => metric.label)
  ].join(" ").toLowerCase();

  const matches: Array<[string, RegExp]> = [
    ["Financials", /\bbank|lending|loan|credit|insurance|asset management|broker|fintech\b/],
    ["Technology", /\bsoftware|cloud|platform|semiconductor|chip|data center|cyber|ai\b/],
    ["Healthcare", /\bhealth|biotech|pharma|clinical|patient|medical|drug\b/],
    ["Energy", /\boil|gas|energy|renewable|solar|pipeline|utility\b/],
    ["Consumer", /\bretail|consumer|store|restaurant|brand|apparel|demand\b/],
    ["Industrials", /\bindustrial|manufacturing|supply chain|logistics|aerospace|transport\b/],
    ["Real Estate", /\breal estate|reit|property|lease|occupancy\b/],
    ["Communications", /\bmedia|advertising|telecom|subscriber|streaming\b/]
  ];

  return matches.find(([, pattern]) => pattern.test(text))?.[0] ?? "Unclassified";
}

async function updatePortfolioWithPg({
  memory,
  watchlist,
  sector
}: PortfolioInput & { sector: string }): Promise<PortfolioIntelligenceSummary> {
  const pool = createPgPool();
  if (!pool) return updatePortfolioInProcess({ memory, watchlist, sector });
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      `insert into portfolios (id, name, updated_at)
       values ($1, $2, $3)
       on conflict (id) do update set name = excluded.name, updated_at = excluded.updated_at`,
      [defaultPortfolioId, defaultPortfolioName, memory.lastUpdatedAt]
    );
    await client.query(
      `insert into portfolio_companies (
        portfolio_id, company_id, company_name, sector, added_at, latest_document_id,
        latest_document_filename, filing_count, risk_count, alert_count
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict (portfolio_id, company_id) do update set
        company_name = excluded.company_name,
        sector = excluded.sector,
        latest_document_id = excluded.latest_document_id,
        latest_document_filename = excluded.latest_document_filename,
        filing_count = excluded.filing_count,
        risk_count = excluded.risk_count,
        alert_count = excluded.alert_count`,
      [
        defaultPortfolioId,
        memory.companyId,
        memory.companyName,
        sector,
        memory.lastUpdatedAt,
        memory.latestDocumentId,
        memory.latestDocumentFilename,
        memory.filingCount,
        memory.recurringRisks.length,
        watchlist.alertCount
      ]
    );
    await client.query("commit");
    return await loadPortfolioFromPg();
  } catch (error) {
    await client.query("rollback");
    logger.warn("portfolio.pg_failed", {
      companyId: memory.companyId,
      error: error instanceof Error ? error.message : String(error)
    });
    return updatePortfolioInProcess({ memory, watchlist, sector });
  } finally {
    client.release();
  }
}

async function loadPortfolioFromPg(): Promise<PortfolioIntelligenceSummary> {
  const pool = createPgPool();
  if (!pool) return buildPortfolioSummary(Array.from(inProcessPortfolio.values()));

  const [companies, risks, alerts] = await Promise.all([
    pool.query(
      `select company_id, company_name, sector, latest_document_id, latest_document_filename,
        filing_count, risk_count, alert_count
       from portfolio_companies
       where portfolio_id = $1
       order by company_name`,
      [defaultPortfolioId]
    ),
    pool.query(
      `select company_id, theme, label, occurrence_count, citations
       from company_risks
       where company_id in (select company_id from portfolio_companies where portfolio_id = $1)`,
      [defaultPortfolioId]
    ),
    pool.query(
      `select company_id, severity, id, category, title, message, document_id, created_at, acknowledged, citations
       from watchlist_alerts
       where watchlist_id = 'watchlist_default'
        and company_id in (select company_id from portfolio_companies where portfolio_id = $1)
       order by created_at desc
       limit 200`,
      [defaultPortfolioId]
    )
  ]);

  const riskByCompany = groupRows(risks.rows, "company_id");
  const companyCount = Math.max(1, companies.rows.length);
  const exposures: PortfolioCompanyExposure[] = companies.rows.map((row) => ({
    companyId: row.company_id,
    companyName: row.company_name,
    sector: row.sector,
    filingCount: Number(row.filing_count),
    riskCount: Number(row.risk_count),
    alertCount: Number(row.alert_count),
    concentrationWeight: round(1 / companyCount),
    latestDocumentId: row.latest_document_id ?? "",
    latestDocumentFilename: row.latest_document_filename ?? "",
    topRisks: (riskByCompany.get(row.company_id) ?? []).slice(0, 3).map((risk) => String(risk.label))
  }));
  const sectorExposure = buildSectorExposure(exposures);
  const overlappingRisks = buildOverlappingRisksFromRows(risks.rows, companies.rows);
  const concentrationSignals = buildConcentrationSignals({ companies: exposures, sectorExposure, overlappingRisks });
  const parsedAlerts = alerts.rows.map((row) => ({
    severity: row.severity
  })) as WatchlistAlert[];

  return {
    portfolioId: defaultPortfolioId,
    companyCount: companies.rows.length,
    filingCount: exposures.reduce((sum, company) => sum + company.filingCount, 0),
    alertCount: parsedAlerts.length,
    highSeverityAlertCount: parsedAlerts.filter((alert) => alert.severity === "high").length,
    sectorExposure,
    overlappingRisks,
    concentrationSignals,
    companies: exposures,
    updatedAt: new Date().toISOString()
  };
}

function updatePortfolioInProcess({
  memory,
  watchlist,
  sector
}: PortfolioInput & { sector: string }) {
  inProcessPortfolio.set(memory.companyId, { memory, watchlist, sector });
  return buildPortfolioSummary(Array.from(inProcessPortfolio.values()), memory.lastUpdatedAt);
}

function companyExposure(state: PortfolioCompanyState, trackedCompanyCount: number): PortfolioCompanyExposure {
  const companyCount = Math.max(1, trackedCompanyCount);
  return {
    companyId: state.memory.companyId,
    companyName: state.memory.companyName,
    sector: state.sector,
    filingCount: state.memory.filingCount,
    riskCount: state.memory.recurringRisks.length,
    alertCount: state.watchlist.alertCount,
    concentrationWeight: round(1 / companyCount),
    latestDocumentId: state.memory.latestDocumentId,
    latestDocumentFilename: state.memory.latestDocumentFilename,
    topRisks: state.memory.recurringRisks.slice(0, 3).map((risk) => risk.label)
  };
}

function buildSectorExposure(companies: PortfolioCompanyExposure[]): PortfolioSectorExposure[] {
  const map = new Map<string, PortfolioSectorExposure>();
  for (const company of companies) {
    const current = map.get(company.sector) ?? {
      sector: company.sector,
      companyCount: 0,
      concentrationWeight: 0,
      companies: []
    };
    current.companyCount += 1;
    current.concentrationWeight = round(current.concentrationWeight + company.concentrationWeight);
    current.companies.push(company.companyName);
    map.set(company.sector, current);
  }
  return Array.from(map.values()).sort((a, b) => b.concentrationWeight - a.concentrationWeight || a.sector.localeCompare(b.sector));
}

function buildOverlappingRisks(states: PortfolioCompanyState[]): PortfolioOverlappingRisk[] {
  const map = new Map<string, { label: string; companies: Set<string>; citations: EvidenceCitation[]; highAlerts: number }>();
  for (const state of states) {
    for (const risk of state.memory.recurringRisks) {
      const current = map.get(risk.theme) ?? {
        label: risk.label,
        companies: new Set<string>(),
        citations: [],
        highAlerts: 0
      };
      current.companies.add(state.memory.companyName);
      current.citations = uniqueCitations([...current.citations, ...risk.citations]).slice(0, 6);
      current.highAlerts += state.watchlist.alerts.filter(
        (alert) => alert.category === "risk_change" && alert.severity === "high" && alert.message.includes(risk.label)
      ).length;
      map.set(risk.theme, current);
    }
  }

  return Array.from(map.entries())
    .filter(([, risk]) => risk.companies.size > 1)
    .map(([theme, risk]) => {
      const severity = risk.highAlerts > 0 ? ("high" as const) : ("medium" as const);
      return {
        theme,
        label: risk.label,
        companyCount: risk.companies.size,
        companies: Array.from(risk.companies).sort(),
        severity,
        citations: risk.citations
      };
    })
    .sort((a, b) => b.companyCount - a.companyCount || a.label.localeCompare(b.label));
}

function buildOverlappingRisksFromRows(riskRows: Record<string, unknown>[], companyRows: Record<string, unknown>[]): PortfolioOverlappingRisk[] {
  const companyNames = new Map(companyRows.map((row) => [String(row.company_id), String(row.company_name)]));
  const map = new Map<string, { label: string; companies: Set<string>; citations: EvidenceCitation[] }>();
  for (const row of riskRows) {
    const theme = String(row.theme);
    const current = map.get(theme) ?? {
      label: String(row.label),
      companies: new Set<string>(),
      citations: []
    };
    current.companies.add(companyNames.get(String(row.company_id)) ?? String(row.company_id));
    current.citations = uniqueCitations([...current.citations, ...parseCitations(row.citations)]).slice(0, 6);
    map.set(theme, current);
  }

  return Array.from(map.entries())
    .filter(([, risk]) => risk.companies.size > 1)
    .map(([theme, risk]) => ({
      theme,
      label: risk.label,
      companyCount: risk.companies.size,
      companies: Array.from(risk.companies).sort(),
      severity: "medium" as const,
      citations: risk.citations
    }))
    .sort((a, b) => b.companyCount - a.companyCount || a.label.localeCompare(b.label));
}

function buildConcentrationSignals({
  companies,
  sectorExposure,
  overlappingRisks
}: {
  companies: PortfolioCompanyExposure[];
  sectorExposure: PortfolioSectorExposure[];
  overlappingRisks: PortfolioOverlappingRisk[];
}): PortfolioConcentrationSignal[] {
  const signals: PortfolioConcentrationSignal[] = [];
  const largestSector = sectorExposure[0];
  if (largestSector && largestSector.concentrationWeight >= 0.5 && companies.length > 1) {
    signals.push({
      id: stableId(`sector:${largestSector.sector}`),
      issue: `${largestSector.sector} sector concentration`,
      severity: largestSector.concentrationWeight >= 0.67 ? "high" : "medium",
      explanation: `${Math.round(largestSector.concentrationWeight * 100)}% of tracked companies are in ${largestSector.sector}.`,
      affectedCompanies: largestSector.companies
    });
  }

  const alertHeavy = companies.filter((company) => company.alertCount >= 4);
  if (alertHeavy.length > 0) {
    signals.push({
      id: stableId(`alerts:${alertHeavy.map((company) => company.companyId).join("|")}`),
      issue: "Alert concentration",
      severity: alertHeavy.length > 1 ? "high" : "medium",
      explanation: `${alertHeavy.length} tracked company or companies have elevated watchlist alert volume.`,
      affectedCompanies: alertHeavy.map((company) => company.companyName)
    });
  }

  for (const risk of overlappingRisks.slice(0, 3)) {
    signals.push({
      id: stableId(`risk:${risk.theme}:${risk.companies.join("|")}`),
      issue: `Overlapping ${risk.label.toLowerCase()}`,
      severity: risk.companyCount >= 3 ? "high" : "medium",
      explanation: `${risk.label} appears across ${risk.companyCount} tracked companies.`,
      affectedCompanies: risk.companies
    });
  }

  return signals;
}

function groupRows(rows: Record<string, unknown>[], key: string) {
  const map = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const value = String(row[key]);
    map.set(value, [...(map.get(value) ?? []), row]);
  }
  return map;
}

function uniqueCitations(citations: EvidenceCitation[]) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    if (seen.has(citation.id)) return false;
    seen.add(citation.id);
    return true;
  });
}

function parseCitations(value: unknown): EvidenceCitation[] {
  if (Array.isArray(value)) return value as EvidenceCitation[];
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stableId(value: string) {
  return `portfolio_${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
