# Financial Sight

Financial Sight is a grounded financial document intelligence MVP for earnings call and SEC filing analysis. The repository is named `FinSight`, while the product UI uses the full Financial Sight name.

The app is intentionally not a generic chatbot. It ingests a document, chunks and indexes the text, retrieves targeted evidence, runs specialized analysis agents, verifies supported numeric claims where possible, and returns a citation-backed verdict with explicit confidence drivers and reductions.

## Current MVP Scope

This implementation is focused on:

- Earnings call transcripts
- SEC filings
- General financial PDFs or text files that fit the same analysis flow

The upload UI accepts `.pdf`, `.txt`, and `.md` files. The backend enforces a 20 MB upload limit.

The UI exposes:

- Executive Summary
- Bull Case
- Bear Case
- Risk Analysis
- Key Metrics
- Confidence Assessment
- Source Citations
- Areas of Disagreement
- Agent Trace diagnostics

## Core Design Principles

Financial Sight optimizes for auditability over conversational breadth.

- Claims are built from retrieved evidence, not unrestricted document context.
- Important claims carry citations with source file, section, excerpt, relevance score, and page or timestamp when available.
- Numeric metrics are extracted separately from narrative claims and marked as `verified`, `unverified`, or `conflict`.
- Confidence is calculated from measurable signals: citation coverage, retrieval quality, metric consistency, agent consensus, and contradiction count.
- Generic finance phrasing such as "strong fundamentals" is detected and sanitized before claims are returned.
- Local development can run without OpenAI or PostgreSQL, but production-quality retrieval needs configured OpenAI embeddings and pgvector.

## Tech Stack

- Next.js App Router
- React 19
- TypeScript with strict checking
- Tailwind CSS
- Node.js API route backend
- OpenAI API for chat completions and embeddings when configured
- PostgreSQL with pgvector when configured
- `pdf-parse` for PDF text extraction
- Vitest for focused tests

## Repository Layout

```text
app/
  page.tsx                    Main analyst workspace
  api/documents/route.ts      Upload and analysis HTTP endpoint

components/
  UploadPanel.tsx             File upload and document kind selection
  ProcessingTimeline.tsx      Client-side processing stage indicator
  AnalysisDashboard.tsx       Report layout and tables
  AgentSection.tsx            Bull, Bear, and Risk sections
  EvidenceDrawer.tsx          Click-to-inspect citation drawer
  ObservabilityPanel.tsx      Agent trace, token, latency, retrieval diagnostics

api/
  analyze-document.ts         Route-independent orchestration entrypoint

agents/
  bull.ts                     Bull-only evidence analysis
  bear.ts                     Bear-only evidence analysis
  risk.ts                     Risk-only evidence analysis
  referee.ts                  Final synthesis, disagreements, confidence
  workflow.ts                 End-to-end agent workflow
  llm.ts                      OpenAI JSON completion wrapper with fallback
  grounding.ts                Generic-language and citation guardrails
  common.ts                   Shared claim, citation, and scoring helpers
  types.ts                    Agent interfaces

retrieval/
  chunking.ts                 Section-aware text chunking
  embeddings.ts               OpenAI embeddings or deterministic hash embeddings
  indexing.ts                 Embedding generation and vector-store indexing
  store.ts                    In-memory vector store and citation conversion

parsers/
  pdf.ts                      PDF and text extraction
  types.ts                    Parsed document and chunk types

verification/
  numbers.ts                  Metric extraction and growth-rate verification
  numbers.test.ts             Numeric verification tests

scoring/
  confidence.ts               Confidence score calculation

db/
  client.ts                   PostgreSQL pool creation
  schema.sql                  pgvector schema
  vector-store.ts             PostgreSQL-backed vector store

lib/
  config.ts                   Environment validation
  logger.ts                   Structured JSON logging
  openai.ts                   OpenAI client factory
  types.ts                    Shared report and citation types
```

## End-to-End Flow

1. The user uploads a PDF or text file in the web UI.
2. `app/api/documents/route.ts` validates the request and file size.
3. `api/analyze-document.ts` parses the document, chunks it, selects a vector store, indexes embeddings, and runs the workflow.
4. `parsers/pdf.ts` extracts text from PDFs with `pdf-parse`; text-like files are read as UTF-8.
5. `retrieval/chunking.ts` splits text into overlapping chunks and assigns metadata such as section, estimated page, timestamp, token estimate, and source file.
6. `retrieval/embeddings.ts` generates OpenAI embeddings when available, otherwise deterministic local hash embeddings.
7. `retrieval/indexing.ts` writes chunks and vectors into either pgvector or an in-memory store.
8. `agents/workflow.ts` retrieves metric evidence first, extracts structured metrics, then runs Bull, Bear, and Risk agents in parallel.
9. Each specialized agent retrieves its own evidence with role-specific queries and produces cited claims.
10. `agents/referee.ts` aggregates claims, surfaces disagreement, scores confidence, and produces the final verdict.
11. The UI renders the report, citations, metric verification status, confidence drivers, confidence reductions, and trace diagnostics.

## Agent Behavior

### Bull Agent

`agents/bull.ts` searches for positive operating evidence such as revenue growth, margin expansion, cash flow improvement, demand signals, retention, backlog, and guidance support. It is instructed to argue only bullish evidence and cite retrieved evidence IDs.

### Bear Agent

`agents/bear.ts` searches for downside evidence such as revenue slowdown, margin pressure, churn, lowered guidance, cash burn, expense growth, losses, and suspicious narrative inconsistencies. It is instructed to argue only bearish evidence.

### Risk Agent

`agents/risk.ts` searches for legal, regulatory, debt, liquidity, covenant, refinancing, concentration, macro, accounting, internal control, and operational risks. It caps confidence more conservatively and includes caveats when evidence is weak.

### Referee Agent

`agents/referee.ts` is deterministic TypeScript synthesis, not an LLM call. It compares the first bull claim against the first bear or risk claim, retains both sides when cited, computes confidence, selects a stance, and generates the executive summary.

Possible final stances:

- `Constructive`
- `Cautious`
- `Mixed`
- `Insufficient Evidence`

## Retrieval and Storage Modes

The app has two retrieval modes.

### Local Fallback Mode

Used when OpenAI or PostgreSQL is not configured.

- Embeddings are deterministic 256-dimensional hash vectors.
- Vectors are stored in memory for the lifetime of the request.
- This mode is useful for development and smoke testing.
- It is not intended to provide production-grade semantic retrieval.

### OpenAI + pgvector Mode

Used when both `OPENAI_API_KEY` and `DATABASE_URL` are configured.

- Embeddings are generated with `OPENAI_EMBEDDING_MODEL`.
- Chunks are stored in PostgreSQL using pgvector.
- Similarity search uses pgvector cosine distance.

Important: `db/schema.sql` currently defines `embedding vector(1536)`, which matches common 1536-dimensional embedding models such as `text-embedding-3-small`. If you change to a model with a different embedding dimension, update the schema accordingly.

## Numeric Verification

The MVP never treats LLM-generated numbers as verified by default.

`verification/numbers.ts` extracts metrics from retrieved evidence and attempts programmatic checks for simple growth statements in this form:

```text
Revenue saw 18% growth from $100 million to $118 million.
```

When enough information is present, it computes:

```text
(current - prior) / abs(prior) * 100
```

Metric verification statuses:

- `verified`: the reported percentage matches the computed value within the rounding tolerance.
- `conflict`: the reported percentage differs from the computed value, or a calculation cannot be performed safely.
- `unverified`: the value is cited, but the source excerpt does not contain enough structured information to recalculate it.

Current numeric verification is intentionally narrow. It does not yet parse full financial statements, multi-row tables, debt ratios, margin bridges, or multi-period cash flow reconciliations.

## Confidence Model

`scoring/confidence.ts` computes a bounded confidence score from 10 to 92.

Positive inputs:

- Citation coverage across claims
- Mean retrieval relevance
- Verified metric share
- Agent consensus signal

Negative inputs:

- Disagreement count
- Conflicted metric count
- Weak retrieval relevance
- Low metric consistency

The UI shows both confidence drivers and confidence reductions so analysts can see why a conclusion is more or less reliable.

## Citation Model

Citations include:

- `sourceFile`
- `section`
- `page` when available
- `timestamp` when detected
- `excerpt`
- `relevanceScore`

Notes:

- PDF page numbers are estimated from chunk position and total page count. They are useful as directional metadata, not page-perfect PDF coordinates.
- Transcript timestamps are detected from simple `HH:MM` or `HH:MM:SS` patterns inside chunk text.
- Source excerpts are clipped to the first 900 characters of the retrieved chunk.

## Observability

The app emits structured JSON logs through `lib/logger.ts`.

Logged events include:

- `document.upload_received`
- `document.analysis_completed`
- `document.analysis_failed`
- `llm.completion_fallback`

The report also includes agent traces:

- Agent name
- Latency in milliseconds
- Token usage when OpenAI chat completions run
- Retrieval query text
- Retrieved chunk IDs
- Mean relevance by query

The UI renders these traces in the Agent Trace panel.

## Environment Variables

Create `.env.local` from `.env.example`.

```bash
cp .env.example .env.local
```

Supported variables:

```text
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
DATABASE_URL=postgres://postgres:postgres@localhost:5432/financial_sight
```

Behavior by configuration:

- No `OPENAI_API_KEY`: LLM calls and embeddings use deterministic local fallbacks.
- `OPENAI_API_KEY` only: agent claims can use OpenAI, but vector storage remains in memory unless `DATABASE_URL` is also set.
- `OPENAI_API_KEY` plus `DATABASE_URL`: embeddings use OpenAI and chunks are stored in pgvector.
- `DATABASE_URL` without `OPENAI_API_KEY`: document records may be inserted, but vector retrieval falls back to memory because pgvector storage is only selected when OpenAI embeddings are available.

## Database Setup

Install PostgreSQL with pgvector, create a database, then run:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

Schema summary:

- `documents`: uploaded document metadata
- `document_chunks`: chunk text, source metadata, token estimates, and vector embeddings

## Running Locally

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

The dev script binds to `0.0.0.0`, so it is also reachable from the network address shown by Next.js.

## API

### `POST /api/documents`

Uploads and analyzes one document.

Form fields:

- `file`: required PDF, text, or Markdown file
- `kind`: `earnings_call`, `sec_filing`, or `financial_pdf`

Example:

```bash
curl -s \
  -F "kind=earnings_call" \
  -F "file=@sample-transcript.txt;type=text/plain" \
  http://localhost:3000/api/documents
```

Response:

The endpoint returns an `AnalysisReport` matching `lib/types.ts`, including document metadata, agent claims, key metrics, confidence assessment, citations, disagreements, final verdict, and traces.

## Verification

Run all local checks:

```bash
npm run typecheck
npm run test
npm run lint
npm run build
```

Focused tests currently cover:

- Growth-rate verification
- Detection and sanitization of generic finance language

## Known MVP Limits

- Agent orchestration is implemented with typed async modules and `Promise.all`, not LangGraph.
- PDF extraction is text-based; scanned PDFs without OCR are not supported.
- Page numbers are approximate because `pdf-parse` text output does not preserve exact per-page chunk coordinates in this implementation.
- Table extraction is not yet structured enough for institutional financial statement reconciliation.
- pgvector persistence is request-driven and does not yet expose document history, multi-document comparison, watchlists, or portfolio workflows.
- The Referee currently surfaces one primary disagreement pair rather than a full contradiction graph.
- The local fallback path is deterministic and testable, but not semantically equivalent to production embeddings.

## Development Notes

- Keep parsing, retrieval, reasoning, verification, scoring, and UI concerns separated.
- Add citations to every important user-facing claim.
- Do not present numeric claims as verified unless `verification/numbers.ts` or a future verifier has checked them.
- Prefer adding tests when expanding metric verification, grounding rules, or confidence scoring.
