import { createHash } from "node:crypto";
import { createPgPool } from "@/db/client";
import { env } from "@/lib/config";
import { logger } from "@/lib/logger";
import type {
  CompetitorComparison,
  CrossCompanyIntelligenceSummary,
  EvidenceCitation,
  IndustryTrendSignal,
  MacroExposureSignal,
  PortfolioCompanyExposure,
  PortfolioIntelligenceSummary,
  SectorTrendSignal,
  WatchlistAlertSeverity
} from "@/lib/types";

const inProcessCrossCompany = new Map<string, CrossCompanyIntelligenceSummary>();

const macroFactors: Array<{
  factor: MacroExposureSignal["factor"];
  label: string;
  patterns: RegExp[];
}> = [
  { factor: "rates", label: "Interest rate and refinancing exposure", patterns: [/rate/i, /interest/i, /debt/i, /refinanc/i] },
  { factor: "demand", label: "Demand sensitivity", patterns: [/demand/i, /consumer/i, /macro/i, /recession/i] },
  { factor: "supply_chain", label: "Supply chain exposure", patterns: [/supply chain/i, /supplier/i, /logistics/i] },
  { factor: "regulatory", label: "Regulatory exposure", patterns: [/regulat/i, /compliance/i, /investigation/i] },
  { factor: "liquidity", label: "Liquidity exposure", patterns: [/liquidity/i, /cash/i, /working capital/i] },
  { factor: "fx", label: "Foreign exchange exposure", patterns: [/\bfx\b/i, /foreign exchange/i, /currency/i] },
  { factor: "energy", label: "Energy cost exposure", patterns: [/energy/i, /oil/i, /gas/i, /fuel/i] }
];

export async function createCrossCompanyIntelligence(
  portfolio: PortfolioIntelligenceSummary
): Promise<CrossCompanyIntelligenceSummary> {
  const summary = buildCrossCompanyIntelligence(portfolio);
  const saved = env.DATABASE_URL ? await saveCrossCompanyWithPg(summary) : saveInProcess(summary);

  logger.info("cross_company.updated", {
    id: saved.id,
    portfolioId: saved.portfolioId,
    competitorComparisons: saved.competitorComparisons.length,
    sectorTrends: saved.sectorTrends.length,
    industryTrends: saved.industryTrends.length,
    macroExposures: saved.macroExposures.length
  });

  return saved;
}

export function buildCrossCompanyIntelligence(
  portfolio: PortfolioIntelligenceSummary
): CrossCompanyIntelligenceSummary {
  const generatedAt = portfolio.updatedAt;
  const competitorComparisons = compareCompetitors(portfolio);
  const sectorTrends = analyzeSectorTrends(portfolio);
  const industryTrends = analyzeIndustryTrends(portfolio);
  const macroExposures = analyzeMacroExposure(portfolio);

  return {
    id: `cross_company_${stableHash(`${portfolio.portfolioId}:${generatedAt}:${portfolio.companyCount}:${portfolio.alertCount}`).slice(0, 24)}`,
    portfolioId: portfolio.portfolioId,
    generatedAt,
    competitorComparisons,
    sectorTrends,
    industryTrends,
    macroExposures,
    limitations: limitations(portfolio)
  };
}

function compareCompetitors(portfolio: PortfolioIntelligenceSummary): CompetitorComparison[] {
  const bySector = groupBy(portfolio.companies, (company) => company.sector);
  return Array.from(bySector.entries())
    .filter(([, companies]) => companies.length > 1)
    .flatMap(([sector, companies]) => pairwise(companies).map(([a, b]) => {
      const sharedRisks = intersect(a.topRisks, b.topRisks);
      const alertSpread = Math.abs(a.alertCount - b.alertCount);
      const assessment =
        sharedRisks.length > 0
          ? `${a.companyName} and ${b.companyName} share ${sharedRisks.length} tracked risk theme(s) in ${sector}.`
          : `${a.companyName} and ${b.companyName} are same-sector peers, but no shared top risk is currently tracked.`;

      return {
        id: `competitor_${stableHash(`${sector}:${a.companyId}:${b.companyId}`).slice(0, 20)}`,
        sector,
        companies: [a.companyName, b.companyName].sort(),
        sharedRisks,
        alertSpread,
        assessment
      };
    }))
    .sort((a, b) => b.sharedRisks.length - a.sharedRisks.length || b.alertSpread - a.alertSpread);
}

function analyzeSectorTrends(portfolio: PortfolioIntelligenceSummary): SectorTrendSignal[] {
  return portfolio.sectorExposure.map((sector) => {
    const companies = portfolio.companies.filter((company) => company.sector === sector.sector);
    const alertPressure = round(companies.reduce((sum, company) => sum + company.alertCount, 0) / Math.max(1, companies.length));
    const dominantRisks = topItems(companies.flatMap((company) => company.topRisks), 4);
    return {
      sector: sector.sector,
      companyCount: sector.companyCount,
      alertPressure,
      dominantRisks,
      trend:
        sector.companyCount < 2
          ? "insufficient_data"
          : alertPressure >= 4 || dominantRisks.length >= 3
            ? "rising_risk"
            : "stable"
    };
  });
}

function analyzeIndustryTrends(portfolio: PortfolioIntelligenceSummary): IndustryTrendSignal[] {
  const sectorsByCompany = new Map(portfolio.companies.map((company) => [company.companyName, company.sector]));
  return portfolio.overlappingRisks.map((risk) => ({
    theme: risk.theme,
    label: risk.label,
    companyCount: risk.companyCount,
    affectedSectors: Array.from(new Set(risk.companies.map((company) => sectorsByCompany.get(company) ?? "Unclassified"))).sort(),
    severity: risk.severity,
    citations: risk.citations
  }));
}

function analyzeMacroExposure(portfolio: PortfolioIntelligenceSummary): MacroExposureSignal[] {
  const signals = new Map<MacroExposureSignal["factor"], MacroExposureSignal>();
  const risks = [
    ...portfolio.overlappingRisks.map((risk) => ({
      label: risk.label,
      companies: risk.companies,
      severity: risk.severity,
      citations: risk.citations
    })),
    ...portfolio.companies.flatMap((company) => company.topRisks.map((risk) => ({
      label: risk,
      companies: [company.companyName],
      severity: "medium" as const,
      citations: [] as EvidenceCitation[]
    })))
  ];

  for (const risk of risks) {
    for (const factor of macroFactors) {
      if (!factor.patterns.some((pattern) => pattern.test(risk.label))) continue;
      const existing = signals.get(factor.factor);
      signals.set(factor.factor, {
        factor: factor.factor,
        label: factor.label,
        companies: Array.from(new Set([...(existing?.companies ?? []), ...risk.companies])).sort(),
        severity: maxSeverity(existing?.severity, risk.severity),
        evidence: Array.from(new Set([...(existing?.evidence ?? []), risk.label])).slice(0, 5),
        citations: uniqueCitations([...(existing?.citations ?? []), ...risk.citations]).slice(0, 6)
      });
    }
  }

  return Array.from(signals.values()).sort((a, b) => b.companies.length - a.companies.length || a.label.localeCompare(b.label));
}

async function saveCrossCompanyWithPg(
  summary: CrossCompanyIntelligenceSummary
): Promise<CrossCompanyIntelligenceSummary> {
  const pool = createPgPool();
  if (!pool) return saveInProcess(summary);
  try {
    await pool.query(
      `insert into cross_company_intelligence (
        id, portfolio_id, generated_at, competitor_comparisons, sector_trends,
        industry_trends, macro_exposures, limitations
      ) values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb)
      on conflict (id) do update set
        competitor_comparisons = excluded.competitor_comparisons,
        sector_trends = excluded.sector_trends,
        industry_trends = excluded.industry_trends,
        macro_exposures = excluded.macro_exposures,
        limitations = excluded.limitations`,
      [
        summary.id,
        summary.portfolioId,
        summary.generatedAt,
        JSON.stringify(summary.competitorComparisons),
        JSON.stringify(summary.sectorTrends),
        JSON.stringify(summary.industryTrends),
        JSON.stringify(summary.macroExposures),
        JSON.stringify(summary.limitations)
      ]
    );
    return summary;
  } catch (error) {
    logger.warn("cross_company.pg_failed", {
      id: summary.id,
      error: error instanceof Error ? error.message : String(error)
    });
    return saveInProcess(summary);
  }
}

function limitations(portfolio: PortfolioIntelligenceSummary) {
  return [
    ...(portfolio.companyCount < 2 ? ["Cross-company comparisons require at least two tracked companies."] : []),
    ...(portfolio.overlappingRisks.length === 0 ? ["No overlapping risk themes are available yet."] : []),
    "Sector and macro exposure labels are deterministic classifications from tracked filings, risks, alerts, and company memory."
  ];
}

function saveInProcess(summary: CrossCompanyIntelligenceSummary) {
  inProcessCrossCompany.set(summary.id, summary);
  return summary;
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    map.set(value, [...(map.get(value) ?? []), item]);
  }
  return map;
}

function pairwise<T>(items: T[]): Array<[T, T]> {
  const pairs: Array<[T, T]> = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      pairs.push([items[i], items[j]]);
    }
  }
  return pairs;
}

function intersect(a: string[], b: string[]) {
  const bSet = new Set(b);
  return Array.from(new Set(a.filter((item) => bSet.has(item)))).sort();
}

function topItems(items: string[], limit: number) {
  const counts = new Map<string, number>();
  for (const item of items.filter(Boolean)) counts.set(item, (counts.get(item) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([item]) => item);
}

function maxSeverity(a: WatchlistAlertSeverity | undefined, b: WatchlistAlertSeverity): WatchlistAlertSeverity {
  const rank = { info: 0, medium: 1, high: 2 };
  return !a || rank[b] > rank[a] ? b : a;
}

function uniqueCitations(citations: EvidenceCitation[]) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    if (seen.has(citation.id)) return false;
    seen.add(citation.id);
    return true;
  });
}

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
