import { createHash } from "node:crypto";
import type { DocumentChunk, ParsedDocument } from "@/parsers/types";

const maxChars = 1800;
const overlapParagraphs = 1;

export function chunkDocument(document: ParsedDocument): DocumentChunk[] {
  const blocks = document.pages.flatMap((page) =>
    page.text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((text) => ({
        text,
        pageNumber: page.pageNumber,
        section: detectSection(text)
      }))
  );

  const chunks: DocumentChunk[] = [];
  let current: typeof blocks = [];
  let section = "Document";
  let charCursor = 0;

  for (const block of blocks) {
    section = block.section ?? section;
    const currentText = joinBlocks(current);

    if ((currentText + "\n\n" + block.text).length > maxChars && current.length > 0) {
      const chunkText = joinBlocks(current);
      chunks.push(toChunk(document, chunkText, section, chunks.length, current, charCursor));
      charCursor += chunkText.length;
      current = current.slice(Math.max(0, current.length - overlapParagraphs));
    }

    current.push({ ...block, section });
  }

  if (current.length > 0) {
    const chunkText = joinBlocks(current);
    chunks.push(toChunk(document, chunkText, section, chunks.length, current, charCursor));
  }

  return chunks.length > 0
    ? chunks
    : [toChunk(document, document.text, section, 0, [{ text: document.text, pageNumber: 1, section }], 0)];
}

function toChunk(
  document: ParsedDocument,
  text: string,
  section: string,
  index: number,
  blocks: Array<{ text: string; pageNumber: number; section: string | null }>,
  charStart: number
): DocumentChunk {
  const pages = blocks.map((block) => block.pageNumber);
  const id = stableChunkId(document.id, index, section, text);
  const lineCount = text.split("\n").length;
  return {
    id,
    documentId: document.id,
    documentKind: document.kind,
    sourceFile: document.filename,
    text,
    section,
    page: Math.min(...pages),
    pageEnd: Math.max(...pages),
    timestamp: text.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)?.[0],
    index,
    tokenEstimate: Math.ceil(text.length / 4),
    charStart,
    charEnd: charStart + text.length,
    metadata: {
      hasTableLikeContent: hasTableLikeContent(text),
      lineCount,
      retrievalText: `${section}\n${text}`.slice(0, 2200)
    }
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

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase()).slice(0, 80);
}

function joinBlocks(blocks: Array<{ text: string }>) {
  return blocks.map((block) => block.text).join("\n\n");
}

function stableChunkId(documentId: string, index: number, section: string, text: string) {
  const hash = createHash("sha256")
    .update(documentId)
    .update(String(index))
    .update(section)
    .update(text)
    .digest("hex");
  return hashToUuid(hash);
}

function hasTableLikeContent(text: string) {
  const lines = text.split("\n");
  return lines.some((line) => {
    const numericCells = line.match(/(?:\$?\(?-?\d[\d,.]*\)?%?)/g) ?? [];
    return numericCells.length >= 3 || /\s{2,}/.test(line);
  });
}

function hashToUuid(hash: string) {
  const value = hash.slice(0, 32);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
