import pdf from "pdf-parse";
import type { DocumentKind } from "@/lib/types";
import type { ParsedDocument } from "@/parsers/types";

export async function parseUploadedDocument(file: File, kind: DocumentKind): Promise<ParsedDocument> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name;
  const id = crypto.randomUUID();

  if (file.type === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
    const parsed = await pdf(buffer);
    return {
      id,
      filename,
      kind,
      text: normalizeText(parsed.text),
      pageCount: parsed.numpages
    };
  }

  return {
    id,
    filename,
    kind,
    text: normalizeText(buffer.toString("utf8"))
  };
}

function normalizeText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
