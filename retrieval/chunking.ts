import type { DocumentChunk, ParsedDocument } from "@/parsers/types";

const maxChars = 1800;
const overlapChars = 220;

export function chunkDocument(document: ParsedDocument): DocumentChunk[] {
  const paragraphs = document.text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: DocumentChunk[] = [];
  let current = "";
  let section = "Document";

  for (const paragraph of paragraphs) {
    section = detectSection(paragraph) ?? section;

    if ((current + "\n\n" + paragraph).length > maxChars && current.length > 0) {
      chunks.push(toChunk(document, current, section, chunks.length));
      current = current.slice(Math.max(0, current.length - overlapChars));
    }

    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }

  if (current.length > 0) chunks.push(toChunk(document, current, section, chunks.length));
  return chunks.length > 0 ? chunks : [toChunk(document, document.text, section, 0)];
}

function toChunk(document: ParsedDocument, text: string, section: string, index: number): DocumentChunk {
  return {
    id: crypto.randomUUID(),
    documentId: document.id,
    sourceFile: document.filename,
    text,
    section,
    page: inferPage(index, document.pageCount),
    timestamp: text.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)?.[0],
    index,
    tokenEstimate: Math.ceil(text.length / 4)
  };
}

function detectSection(paragraph: string) {
  const firstLine = paragraph.split("\n")[0]?.trim() ?? "";
  const lower = firstLine.toLowerCase();

  if (/^item\s+1a\.?\s+risk factors/i.test(firstLine)) return "Risk Factors";
  if (/^item\s+7\.?\s+management/i.test(firstLine)) return "MD&A";
  if (/^item\s+8\.?\s+financial statements/i.test(firstLine)) return "Financial Statements";
  if (lower.includes("question-and-answer") || lower === "q&a") return "Q&A";
  if (lower.includes("prepared remarks")) return "Prepared Remarks";
  if (lower.includes("liquidity")) return "Liquidity";
  if (lower.includes("debt")) return "Debt";
  if (lower.includes("cash flow")) return "Cash Flow";
  if (lower.includes("revenue")) return "Revenue Discussion";
  if (firstLine.length < 80 && /^[A-Z0-9 ,&().-]+$/.test(firstLine) && /[A-Z]/.test(firstLine)) {
    return titleCase(firstLine);
  }

  return null;
}

function inferPage(index: number, pageCount?: number) {
  if (!pageCount || pageCount < 1) return undefined;
  return Math.min(pageCount, Math.max(1, Math.ceil(((index + 1) / 12) * pageCount)));
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase()).slice(0, 80);
}
