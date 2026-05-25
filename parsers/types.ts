import type { DocumentKind } from "@/lib/types";

export type ParsedDocument = {
  id: string;
  filename: string;
  kind: DocumentKind;
  text: string;
  pageCount?: number;
};

export type DocumentChunk = {
  id: string;
  documentId: string;
  sourceFile: string;
  text: string;
  section: string;
  page?: number;
  timestamp?: string;
  index: number;
  tokenEstimate: number;
};
