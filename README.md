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
- What Changed
- Company Memory
- Watchlist Alerts
- Portfolio Intelligence
- Cross-Company Intelligence
- Knowledge Graph
- Predictive Risk Signals
- Analyst Workspace
- Audit and Compliance
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
  ranking.ts                  Hybrid semantic and lexical reranking
  embeddings.ts               OpenAI embeddings or deterministic hash embeddings
  indexing.ts                 Embedding generation and vector-store indexing
  store.ts                    In-memory vector store and citation conversion

comparison/
  historical.ts               Quarter/year comparison engine
  narrative.ts                Narrative drift and hidden deterioration detection
  types.ts                    Historical comparison types

memory/
  company.ts                  Persistent company memory
  historical-intelligence.ts  What Changed and prior-filing intelligence
  watchlist.ts                Company watchlist alerts
  portfolio.ts                Portfolio exposure aggregation
  cross-company.ts            Competitor, sector, and macro comparison
  knowledge-graph.ts          Company/risk/executive/product relationship graph

parsers/
  pdf.ts                      PDF and text extraction
  types.ts                    Parsed document and chunk types

verification/
  numbers.ts                  Metric extraction and growth-rate verification
  numbers.test.ts             Numeric verification tests

scoring/
  confidence.ts               Confidence score calculation
  predictive-risk.ts          Early-warning risk signal engine

workspace/
  analyst.ts                  Saved findings, annotations, and export report data

compliance/
  audit.ts                    Evidence tracking, checksums, and report version metadata

evaluation/
  runner.ts                   Benchmark evaluation runner
  metrics.ts                  Hallucination, citation, numeric, and stability scoring

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
11. The workflow writes company memory, then builds historical intelligence from the prior memory snapshot.
12. Watchlist, portfolio, cross-company, knowledge graph, predictive risk, workspace, and compliance summaries are generated from the grounded report.
13. The UI renders the report, citations, metric verification status, confidence drivers, confidence reductions, historical changes, graph relationships, predictive signals, and trace diagnostics.

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

## Intelligence Layers

The MVP now includes several deterministic intelligence layers beyond the initial single-document summary:

- `memory/company.ts` remembers prior filings, recurring risks, management claims, and historical metrics by normalized company identity.
- `memory/historical-intelligence.ts` generates the What Changed panel from prior company memory, excluding the current filing from previous-guidance context.
- `comparison/historical.ts` and `comparison/narrative.ts` provide quarter/year comparison, tone drift, new/removed risks, wording intensity shifts, and hidden deterioration signals.
- `memory/watchlist.ts` creates company, filing, earnings, risk-change, and confidence alerts.
- `memory/portfolio.ts` aggregates tracked companies into sector exposure, overlapping risks, and concentration signals.
- `memory/cross-company.ts` compares competitors, sector trends, industry themes, and macro exposures across the portfolio.
- `memory/knowledge-graph.ts` builds cited relationships among companies, executives, suppliers, products, risks, sectors, and macro factors.
- `scoring/predictive-risk.ts` surfaces early-warning risk indicators for deteriorating fundamentals, accounting/fraud indicators, liquidity stress, and narrative inconsistency.

These layers are evidence-driven heuristics, not forecasts. Predictive risk signals should be interpreted as analyst-review queues.

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
- `document.parsed`
- `document.analysis_completed`
- `document.analysis_failed`
- `llm.completion_fallback`
- `company_memory.updated`
- `historical_intelligence.updated`
- `watchlist.updated`
- `portfolio.updated`
- `knowledge_graph.updated`
- `predictive_risk.updated`
- `compliance.audit_created`

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
- `companies`, `company_filings`, `company_risks`, `company_claims`, `company_metrics`: persistent company memory
- `watchlists`, `watchlist_companies`, `watchlist_alerts`: company tracking and alerts
- `portfolios`, `portfolio_companies`, `cross_company_intelligence`: portfolio and cross-company intelligence
- `historical_intelligence_runs`: What Changed output snapshots
- `knowledge_graphs`, `knowledge_graph_nodes`, `knowledge_graph_edges`: relationship graph summaries
- `predictive_risk_runs`, `predictive_risk_signals`: early-warning risk signals
- `analyst_workspaces`, `workspace_annotations`, `workspace_findings`, `workspace_exports`: analyst workflow artifacts
- `audit_runs`, `audit_events`, `evidence_tracking`, `report_versions`: audit and reproducibility metadata

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

### `POST /api/v1/analyze`

Versioned upload endpoint for integrations. It accepts the same multipart form fields as `/api/documents` and also supports:

- `envelope=full`: return the full `AnalysisReport`
- `envelope=summary`: return an integration-friendly resource envelope

The same 20 MB upload limit is enforced on both upload endpoints.

### `POST /api/v1/reports`

Normalizes an existing `AnalysisReport` JSON body into the API resource envelope without re-running analysis.

### `GET /api/v1/health`

Returns service health, API version, endpoint metadata, and platform capabilities.

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
- Retrieval grounding and debate scoring
- Structured financial extraction
- Historical comparison and narrative drift
- Company memory, watchlists, portfolio, cross-company intelligence, and knowledge graph generation
- Predictive risk signals
- Audit/compliance metadata
- Analyst workspace artifacts
- Evaluation metrics for hallucination, citation precision, numerical correctness, and output stability

## Known MVP Limits

- Agent orchestration is implemented with typed async modules and `Promise.all`, not LangGraph.
- PDF extraction is text-based; scanned PDFs without OCR are not supported.
- Page numbers are approximate because `pdf-parse` text output does not preserve exact per-page chunk coordinates in this implementation.
- Character offsets are approximate when chunks contain overlapping paragraphs.
- Table extraction is not yet structured enough for institutional financial statement reconciliation.
- pgvector persistence is request-driven; there is no separate migration runner or tenant-aware production data lifecycle yet.
- Watchlists, portfolio, workspace, and API platform features are MVP server-side primitives, not full multi-user enterprise workflows.
- The Referee scores multiple disagreement pairs, but the contradiction engine is still heuristic rather than a full claim graph.
- The local fallback path is deterministic and testable, but not semantically equivalent to production embeddings.
- Predictive risk signals are deterministic early-warning indicators, not statistical forecasts.

## Development Notes

- Keep parsing, retrieval, reasoning, verification, scoring, and UI concerns separated.
- Add citations to every important user-facing claim.
- Do not present numeric claims as verified unless `verification/numbers.ts` or a future verifier has checked them.
- Prefer adding tests when expanding metric verification, grounding rules, or confidence scoring.
