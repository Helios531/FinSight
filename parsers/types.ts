import type { DocumentKind } from "@/lib/types";

export type ParsedPage = {
  pageNumber: number;
  text: string;
};

export type ParserDiagnostic = {
  level: "info" | "warn";
  message: string;
};

export type ParsedDocument = {
  id: string;
  filename: string;
  kind: DocumentKind;
  text: string;
  pages: ParsedPage[];
  pageCount?: number;
  metadata: {
    parser: "pdf-parse" | "text";
    byteLength: number;
    title?: string;
    author?: string;
    subject?: string;
    createdAt?: string;
    modifiedAt?: string;
    diagnostics: ParserDiagnostic[];
  };
};

export type DocumentChunk = {
  id: string;
  documentId: string;
  documentKind: DocumentKind;
  sourceFile: string;
  text: string;
  section: string;
  page?: number;
  pageEnd?: number;
  timestamp?: string;
  index: number;
  tokenEstimate: number;
  charStart: number;
  charEnd: number;
  metadata: {
    hasTableLikeContent: boolean;
    lineCount: number;
    retrievalText: string;
  };
};
