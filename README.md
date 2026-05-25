# Financial Sight

Financial Sight is a grounded financial document intelligence MVP focused first on earnings call and SEC filing analysis. The repository is named `FinSight`, but the product surface uses the full Financial Sight name.

## Stack

- Next.js, TypeScript, Tailwind
- Node.js API route backend
- OpenAI chat and embedding APIs when `OPENAI_API_KEY` is configured
- PostgreSQL and pgvector schema/store when `DATABASE_URL` is configured
- Deterministic local hash embeddings and in-memory retrieval for development without secrets

## Architecture

- `app/`: Next.js app router and upload endpoint
- `components/`: analyst workspace, evidence drawer, confidence, debate, and traces
- `api/`: route-independent document analysis service
- `agents/`: isolated Bull, Bear, Risk, and Referee modules
- `retrieval/`: chunking, embeddings, vector search, indexing
- `parsers/`: PDF/text extraction
- `verification/`: programmatic numeric checks
- `scoring/`: measurable confidence scoring
- `db/`: PostgreSQL client, pgvector schema, pgvector-backed store
- `lib/`: shared config, types, logging, OpenAI client

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY` for model-backed analysis.

To enable pgvector storage, create a PostgreSQL database with pgvector installed and run:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

If OpenAI or PostgreSQL is not configured, the app still runs with deterministic local embeddings and in-memory storage.

## Verification

```bash
npm run typecheck
npm run test
npm run lint
npm run build
```
