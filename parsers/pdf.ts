import { createHash } from "node:crypto";
import pdf from "pdf-parse";
import type { DocumentKind } from "@/lib/types";
import type { ParsedDocument, ParsedPage } from "@/parsers/types";

export async function parseUploadedDocument(file: File, kind: DocumentKind): Promise<ParsedDocument> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name;
  const id = stableDocumentId(filename, buffer);

  if (file.type === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
    const pages: ParsedPage[] = [];
    const diagnostics: ParsedDocument["metadata"]["diagnostics"] = [];
    const parsed = await pdf(buffer, {
      pagerender: async (pageData: unknown) => {
        const pageNumber = pages.length + 1;
        const text = normalizeText(await renderPdfPage(pageData));
        pages.push({ pageNumber, text });
        return text;
      }
    });
    const parsedPages = pages.length > 0 ? pages : splitPdfTextIntoPages(parsed.text, parsed.numpages);
    const text = normalizeText(parsedPages.map((page) => page.text).join("\n\n"));

    if (text.length === 0) {
      diagnostics.push({
        level: "warn",
        message: "PDF parser returned no text. The document may be scanned or image-only; OCR is not implemented in this MVP."
      });
    }

    return {
      id,
      filename,
      kind,
      text,
      pages: parsedPages,
      pageCount: parsed.numpages,
      metadata: {
        parser: "pdf-parse",
        byteLength: buffer.byteLength,
        title: getInfoString(parsed.info, "Title"),
        author: getInfoString(parsed.info, "Author"),
        subject: getInfoString(parsed.info, "Subject"),
        createdAt: getInfoString(parsed.info, "CreationDate"),
        modifiedAt: getInfoString(parsed.info, "ModDate"),
        diagnostics
      }
    };
  }

  const text = normalizeText(buffer.toString("utf8"));
  return {
    id,
    filename,
    kind,
    text,
    pages: [{ pageNumber: 1, text }],
    pageCount: 1,
    metadata: {
      parser: "text",
      byteLength: buffer.byteLength,
      diagnostics: []
    }
  };
}

function normalizeText(text: string) {
  const normalized = text
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return removeDuplicateAdjacentLines(normalized);
}

async function renderPdfPage(pageData: unknown) {
  const page = pageData as {
    getTextContent: (options: { normalizeWhitespace: boolean; disableCombineTextItems: boolean }) => Promise<{
      items: Array<{ str?: string; transform?: number[] }>;
    }>;
  };
  const content = await page.getTextContent({
    normalizeWhitespace: false,
    disableCombineTextItems: false
  });

  return content.items
    .map((item) => item.str ?? "")
    .join(" ")
    .replace(/\s+/g, " ");
}

function splitPdfTextIntoPages(text: string, pageCount?: number) {
  const normalized = normalizeText(text);
  if (!pageCount || pageCount <= 1) {
    return [{ pageNumber: 1, text: normalized }];
  }

  const targetLength = Math.ceil(normalized.length / pageCount);
  const pages: ParsedPage[] = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const start = (pageNumber - 1) * targetLength;
    pages.push({
      pageNumber,
      text: normalized.slice(start, start + targetLength).trim()
    });
  }
  return pages;
}

function removeDuplicateAdjacentLines(text: string) {
  const lines = text.split("\n");
  const deduped: string[] = [];
  for (const line of lines) {
    if (line.trim().length === 0 || deduped[deduped.length - 1]?.trim() !== line.trim()) {
      deduped.push(line);
    }
  }
  return deduped.join("\n");
}

function stableDocumentId(filename: string, buffer: Buffer) {
  return hashToUuid(createHash("sha256").update(filename).update(buffer).digest("hex"));
}

function getInfoString(info: unknown, key: string) {
  if (!info || typeof info !== "object") return undefined;
  const value = (info as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function hashToUuid(hash: string) {
  const value = hash.slice(0, 32);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
