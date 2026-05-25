import { createHash } from "node:crypto";
import type { AgentClaim, AnalysisReport, EvidenceCitation } from "@/lib/types";
import type {
  HiddenDeteriorationSignal,
  MetricDelta,
  NarrativeChangeDetection,
  NarrativeRiskChange,
  NarrativeToneShift,
  NarrativeWordingChange,
  RiskFactorDrift,
  SentimentDrift
} from "@/comparison/types";

type NarrativeItem = {
  area: "executive" | "bull" | "bear" | "risk" | "verdict";
  text: string;
  normalizedText: string;
  citations: EvidenceCitation[];
};

type ThemeDefinition = {
  key: string;
  label: string;
  patterns: RegExp[];
};

type ThemeMentions = {
  theme: ThemeDefinition;
  items: NarrativeItem[];
  mentions: number;
  intensity: number;
  representativeLanguage: string;
  citations: EvidenceCitation[];
};

const riskThemes: ThemeDefinition[] = [
  {
    key: "supply_chain",
    label: "Supply chain risk",
    patterns: [/\bsupply\s+chain\b/i, /\bsupplier\b/i, /\bcomponent\b/i, /\blogistics\b/i]
  },
  {
    key: "liquidity",
    label: "Liquidity risk",
    patterns: [/\bliquidity\b/i, /\bcash\s+runway\b/i, /\bworking\s+capital\b/i]
  },
  {
    key: "debt_refinancing",
    label: "Debt and refinancing risk",
    patterns: [/\bdebt\b/i, /\brefinanc/i, /\bcovenant\b/i, /\bleverage\b/i, /\binterest\s+expense\b/i]
  },
  {
    key: "customer_concentration",
    label: "Customer concentration risk",
    patterns: [/\bcustomer\s+concentration\b/i, /\bconcentrat(?:ed|ion)\b/i, /\btop\s+customer\b/i]
  },
  {
    key: "regulatory",
    label: "Regulatory risk",
    patterns: [/\bregulat/i, /\bcompliance\b/i, /\binvestigation\b/i, /\bsanction\b/i]
  },
  {
    key: "litigation",
    label: "Litigation risk",
    patterns: [/\blitigation\b/i, /\blawsuit\b/i, /\blegal\s+proceeding\b/i, /\bclaim\b/i]
  },
  {
    key: "macro_demand",
    label: "Macro and demand risk",
    patterns: [/\bmacro\b/i, /\bdemand\b/i, /\brecession\b/i, /\bconsumer\s+spending\b/i, /\bheadwind\b/i]
  },
  {
    key: "accounting_controls",
    label: "Accounting and control risk",
    patterns: [/\baccounting\b/i, /\binternal\s+control\b/i, /\bmaterial\s+weakness\b/i, /\bimpairment\b/i]
  },
  {
    key: "cybersecurity",
    label: "Cybersecurity risk",
    patterns: [/\bcyber/i, /\bdata\s+breach\b/i, /\bsecurity\s+incident\b/i]
  },
  {
    key: "margin_pressure",
    label: "Margin pressure",
    patterns: [/\bmargin\b/i, /\bpricing\b/i, /\bcost\s+pressure\b/i, /\bgross\s+profit\b/i]
  },
  {
    key: "guidance",
    label: "Guidance risk",
    patterns: [/\bguidance\b/i, /\boutlook\b/i, /\bforecast\b/i, /\bexpect(?:s|ed|ation)?\b/i]
  },
  {
    key: "going_concern",
    label: "Going concern risk",
    patterns: [/\bgoing\s+concern\b/i, /\bsubstantial\s+doubt\b/i]
  }
];

const constructiveTerms = [
  "accelerat",
  "expand",
  "growth",
  "improv",
  "raised",
  "record",
  "resilient",
  "stabiliz",
  "outperform",
  "profitability"
];

const cautiousTerms = [
  "declin",
  "deteriorat",
  "decrease",
  "pressure",
  "weak",
  "headwind",
  "risk",
  "loss",
  "shortfall",
  "impairment",
  "delay",
  "constraint",
  "disrupt",
  "investigation",
  "compliance"
];

const uncertaintyTerms = [
  "uncertain",
  "volatil",
  "may",
  "could",
  "potential",
  "subject to",
  "unable",
  "depends",
  "not assured",
  "substantial doubt"
];

const intensifierTerms = [
  "significant",
  "material",
  "substantial",
  "severe",
  "elevated",
  "increased",
  "worsen",
  "persistent",
  "heightened",
  "acute"
];

const softenerTerms = ["limited", "manageable", "temporary", "moderate", "reduced", "improved", "mitigated", "lower"];

const deteriorationFlags = [
  "despite",
  "however",
  "offset by",
  "excluding",
  "one-time",
  "non-gaap",
  "adjusted",
  "normalizing",
  "temporary benefit",
  "pull-forward",
  "delayed",
  "weaker demand",
  "margin pressure"
];

export function detectNarrativeChanges({
  current,
  prior,
  metricDeltas,
  riskFactorDrift,
  sentimentDrift
}: {
  current: AnalysisReport;
  prior: AnalysisReport;
  metricDeltas: MetricDelta[];
  riskFactorDrift: RiskFactorDrift;
  sentimentDrift: SentimentDrift;
}): NarrativeChangeDetection {
  const currentItems = narrativeItems(current);
  const priorItems = narrativeItems(prior);
  const currentThemes = mentionsByTheme(currentItems);
  const priorThemes = mentionsByTheme(priorItems);
  const toneShift = detectToneShift(currentItems, priorItems);
  const newRisks = riskChanges(currentThemes, priorThemes, "new");
  const removedRisks = riskChanges(priorThemes, currentThemes, "removed");
  const wordingChanges = detectWordingChanges(currentThemes, priorThemes);
  const hiddenDeterioration = detectHiddenDeterioration({
    currentItems,
    metricDeltas,
    riskFactorDrift,
    sentimentDrift,
    toneShift
  });

  return {
    toneShift,
    newRisks,
    removedRisks,
    wordingChanges,
    hiddenDeterioration,
    summary: buildNarrativeSummary({ toneShift, newRisks, removedRisks, wordingChanges, hiddenDeterioration })
  };
}

function narrativeItems(report: AnalysisReport): NarrativeItem[] {
  const fromClaims = (area: NarrativeItem["area"], claims: AgentClaim[]): NarrativeItem[] =>
    claims.map((claim) => ({
      area,
      text: [claim.title, claim.claim, ...claim.caveats].filter(Boolean).join(". "),
      normalizedText: normalizeText([claim.title, claim.claim, ...claim.caveats].filter(Boolean).join(". ")),
      citations: claim.citations
    }));

  const verdictItem: NarrativeItem = {
    area: "verdict",
    text: report.finalVerdict.rationale,
    normalizedText: normalizeText(report.finalVerdict.rationale),
    citations: report.finalVerdict.citations
  };

  return [
    ...fromClaims("executive", report.executiveSummary),
    ...fromClaims("bull", report.bullCase),
    ...fromClaims("bear", report.bearCase),
    ...fromClaims("risk", report.riskAnalysis),
    verdictItem
  ].filter((item) => item.normalizedText.length > 0);
}

function mentionsByTheme(items: NarrativeItem[]) {
  const map = new Map<string, ThemeMentions>();

  for (const theme of riskThemes) {
    const matchingItems = items.filter((item) => theme.patterns.some((pattern) => pattern.test(item.text)));
    if (matchingItems.length === 0) continue;
    const combinedText = matchingItems.map((item) => item.text).join(" ");
    const citations = uniqueCitations(matchingItems.flatMap((item) => item.citations)).slice(0, 4);
    map.set(theme.key, {
      theme,
      items: matchingItems,
      mentions: matchingItems.length,
      intensity: languageIntensity(combinedText),
      representativeLanguage: representativeLanguage(matchingItems),
      citations
    });
  }

  return map;
}

function detectToneShift(currentItems: NarrativeItem[], priorItems: NarrativeItem[]): NarrativeToneShift {
  const currentTone = toneScore(currentItems);
  const priorTone = toneScore(priorItems);
  const scoreChange = round(currentTone.net - priorTone.net);
  const uncertaintyChange = currentTone.uncertainty - priorTone.uncertainty;
  const direction =
    Math.abs(scoreChange) < 0.05 && Math.abs(uncertaintyChange) < 0.03
      ? "flat"
      : Math.abs(scoreChange) >= 0.05
        ? scoreChange > 0
          ? "more_constructive"
          : "more_cautious"
        : uncertaintyChange > 0.05
          ? "more_uncertain"
          : "flat";

  return {
    direction,
    currentToneScore: round(currentTone.net),
    priorToneScore: round(priorTone.net),
    scoreChange,
    drivers: toneDrivers(currentTone, priorTone),
    citations: uniqueCitations([
      ...currentTone.driverItems.flatMap((item) => item.citations),
      ...priorTone.driverItems.flatMap((item) => item.citations)
    ]).slice(0, 6)
  };
}

function toneScore(items: NarrativeItem[]) {
  const weightedText = items
    .map((item) => {
      const weight = item.area === "risk" ? 1.35 : item.area === "bear" ? 1.15 : item.area === "bull" ? 0.95 : 1;
      return `${item.normalizedText} `.repeat(Math.max(1, Math.round(weight)));
    })
    .join(" ");
  const constructive = termCount(weightedText, constructiveTerms);
  const cautious = termCount(weightedText, cautiousTerms);
  const uncertainty = termCount(weightedText, uncertaintyTerms);
  const denominator = Math.max(6, constructive + cautious + uncertainty);
  const net = (constructive - cautious - uncertainty * 0.45) / denominator;
  const driverItems = items.filter((item) =>
    [...constructiveTerms, ...cautiousTerms, ...uncertaintyTerms].some((term) => item.normalizedText.includes(term))
  );

  return {
    constructive,
    cautious,
    uncertainty: uncertainty / denominator,
    net,
    driverItems
  };
}

function toneDrivers(
  current: ReturnType<typeof toneScore>,
  prior: ReturnType<typeof toneScore>
) {
  const drivers: string[] = [];
  if (current.cautious > prior.cautious) drivers.push("Cautious risk and pressure language increased.");
  if (current.constructive > prior.constructive) drivers.push("Constructive improvement language increased.");
  if (current.uncertainty > prior.uncertainty) drivers.push("Uncertainty qualifiers increased.");
  if (drivers.length === 0) drivers.push("Tone language was broadly stable.");
  return drivers;
}

function riskChanges(
  changed: Map<string, ThemeMentions>,
  baseline: Map<string, ThemeMentions>,
  changeType: "new" | "removed"
): NarrativeRiskChange[] {
  return Array.from(changed.values())
    .filter((entry) => !baseline.has(entry.theme.key))
    .map((entry) => ({
      theme: entry.theme.key,
      label: entry.theme.label,
      changeType,
      currentMentions: changeType === "new" ? entry.mentions : 0,
      priorMentions: changeType === "removed" ? entry.mentions : 0,
      confidence: confidenceFromEvidence(entry.citations, entry.mentions),
      citations: entry.citations
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function detectWordingChanges(
  currentThemes: Map<string, ThemeMentions>,
  priorThemes: Map<string, ThemeMentions>
): NarrativeWordingChange[] {
  return Array.from(currentThemes.entries())
    .flatMap(([theme, current]) => {
      const prior = priorThemes.get(theme);
      if (!prior) return [];
      const intensityDelta = round(current.intensity - prior.intensity);
      if (Math.abs(intensityDelta) < 0.2) return [];

      return [
        {
          theme,
          label: current.theme.label,
          changeType: intensityDelta > 0 ? ("intensified" as const) : ("softened" as const),
          priorLanguage: prior.representativeLanguage,
          currentLanguage: current.representativeLanguage,
          intensityDelta,
          confidence: confidenceFromEvidence([...current.citations, ...prior.citations], current.mentions + prior.mentions),
          citations: uniqueCitations([...current.citations, ...prior.citations]).slice(0, 6)
        }
      ];
    })
    .sort((a, b) => Math.abs(b.intensityDelta) - Math.abs(a.intensityDelta));
}

function detectHiddenDeterioration({
  currentItems,
  metricDeltas,
  riskFactorDrift,
  sentimentDrift,
  toneShift
}: {
  currentItems: NarrativeItem[];
  metricDeltas: MetricDelta[];
  riskFactorDrift: RiskFactorDrift;
  sentimentDrift: SentimentDrift;
  toneShift: NarrativeToneShift;
}): HiddenDeteriorationSignal[] {
  const signals: HiddenDeteriorationSignal[] = [];
  const flaggedItems = currentItems.filter((item) => deteriorationFlags.some((flag) => item.normalizedText.includes(flag)));
  const deterioratingMetrics = metricDeltas.filter((delta) => delta.direction === "deteriorated");

  if (flaggedItems.length > 0) {
    signals.push({
      id: stableId("flagged-language", flaggedItems.map((item) => item.text).join("|")),
      issue: "Offset or adjustment language increased scrutiny need",
      explanation: "Current-period narrative uses adjustment, offset, or exception language that can mask operating deterioration.",
      severity: flaggedItems.length > 1 ? "high" : "medium",
      confidence: confidenceFromEvidence(flaggedItems.flatMap((item) => item.citations), flaggedItems.length),
      citations: uniqueCitations(flaggedItems.flatMap((item) => item.citations)).slice(0, 4)
    });
  }

  if (toneShift.direction === "more_constructive" && deterioratingMetrics.length > 0) {
    signals.push({
      id: stableId("constructive-tone-deteriorating-metrics", deterioratingMetrics.map((delta) => delta.normalizedLabel).join("|")),
      issue: "Constructive tone conflicts with deteriorating metrics",
      explanation: `Management narrative became more constructive while ${deterioratingMetrics.length} comparable metric(s) deteriorated.`,
      severity: deterioratingMetrics.length > 1 ? "high" : "medium",
      confidence: confidenceFromEvidence(deterioratingMetrics.flatMap((delta) => delta.citations), deterioratingMetrics.length),
      citations: uniqueCitations(deterioratingMetrics.flatMap((delta) => delta.citations)).slice(0, 4)
    });
  }

  if (sentimentDrift.direction !== "more_cautious" && riskFactorDrift.severityChange === "increased") {
    signals.push({
      id: stableId("risk-severity-without-cautious-tone", riskFactorDrift.addedTerms.join("|")),
      issue: "Risk severity rose without matching cautious tone shift",
      explanation: "Risk exposure increased, but the aggregate narrative did not become more cautious.",
      severity: riskFactorDrift.addedTerms.length > 1 ? "high" : "medium",
      confidence: confidenceFromEvidence(riskFactorDrift.citations, riskFactorDrift.addedTerms.length),
      citations: riskFactorDrift.citations.slice(0, 4)
    });
  }

  return signals;
}

function buildNarrativeSummary({
  toneShift,
  newRisks,
  removedRisks,
  wordingChanges,
  hiddenDeterioration
}: {
  toneShift: NarrativeToneShift;
  newRisks: NarrativeRiskChange[];
  removedRisks: NarrativeRiskChange[];
  wordingChanges: NarrativeWordingChange[];
  hiddenDeterioration: HiddenDeteriorationSignal[];
}): AgentClaim[] {
  const citations = uniqueCitations([
    ...toneShift.citations,
    ...newRisks.flatMap((risk) => risk.citations),
    ...removedRisks.flatMap((risk) => risk.citations),
    ...wordingChanges.flatMap((change) => change.citations),
    ...hiddenDeterioration.flatMap((signal) => signal.citations)
  ]).slice(0, 6);
  const intensified = wordingChanges.filter((change) => change.changeType === "intensified");
  const softened = wordingChanges.filter((change) => change.changeType === "softened");
  const claim = [
    `Management narrative tone was ${toneShift.direction}.`,
    `${newRisks.length} new risk theme(s) and ${removedRisks.length} removed risk theme(s) were detected.`,
    `${intensified.length} theme(s) intensified and ${softened.length} softened.`,
    `${hiddenDeterioration.length} hidden deterioration signal(s) were flagged.`
  ].join(" ");

  return [
    {
      id: stableId("narrative-summary", claim),
      title: "Narrative change summary",
      claim,
      polarity: toneShift.direction === "more_constructive" ? "bull" : toneShift.direction === "flat" ? "neutral" : "risk",
      confidence: citations.length > 0 ? 0.74 : 0.4,
      citations,
      caveats: citations.length > 0 ? [] : ["Narrative drift has limited citation coverage."]
    }
  ];
}

function languageIntensity(text: string) {
  const normalized = normalizeText(text);
  return termCount(normalized, intensifierTerms) - termCount(normalized, softenerTerms) * 0.8;
}

function termCount(text: string, terms: string[]) {
  return terms.reduce((sum, term) => sum + occurrences(text, term), 0);
}

function occurrences(text: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(text.matchAll(new RegExp(escaped, "g"))).length;
}

function representativeLanguage(items: NarrativeItem[]) {
  const sorted = [...items].sort((a, b) => b.text.length - a.text.length);
  return sorted[0]?.text.slice(0, 320) ?? "";
}

function confidenceFromEvidence(citations: EvidenceCitation[], count: number) {
  if (citations.length === 0) return 0.35;
  const citationQuality = citations.reduce((sum, citation) => sum + citation.relevanceScore, 0) / citations.length;
  const support = Math.min(0.18, Math.max(0, count - 1) * 0.04);
  return Math.min(0.9, Math.max(0.45, round(citationQuality * 0.75 + support)));
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function uniqueCitations(citations: EvidenceCitation[]) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    if (seen.has(citation.id)) return false;
    seen.add(citation.id);
    return true;
  });
}

function stableId(prefix: string, text: string) {
  return `${prefix}-${createHash("sha256").update(text).digest("hex").slice(0, 16)}`;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
