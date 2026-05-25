create extension if not exists vector;

create table if not exists documents (
  id uuid primary key,
  filename text not null,
  kind text not null,
  processed_at timestamptz not null default now(),
  page_count integer
);

create table if not exists document_chunks (
  id uuid primary key,
  document_id uuid not null references documents(id) on delete cascade,
  document_kind text not null,
  source_file text not null,
  section text not null,
  page integer,
  page_end integer,
  timestamp text,
  chunk_index integer not null,
  token_estimate integer not null,
  char_start integer not null,
  char_end integer not null,
  has_table_like_content boolean not null default false,
  content text not null,
  embedding vector(1536)
);

create index if not exists document_chunks_document_idx on document_chunks(document_id);
create index if not exists document_chunks_embedding_idx
  on document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table if not exists companies (
  id text primary key,
  name text not null,
  normalized_name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists company_filings (
  company_id text not null references companies(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  filename text not null,
  kind text not null,
  processed_at timestamptz not null,
  primary key (company_id, document_id)
);

create table if not exists company_risks (
  company_id text not null references companies(id) on delete cascade,
  theme text not null,
  label text not null,
  first_seen_document_id uuid not null references documents(id) on delete cascade,
  last_seen_document_id uuid not null references documents(id) on delete cascade,
  occurrence_count integer not null default 1,
  last_seen_at timestamptz not null,
  citations jsonb not null default '[]'::jsonb,
  primary key (company_id, theme)
);

create table if not exists company_claims (
  company_id text not null references companies(id) on delete cascade,
  id text not null,
  claim text not null,
  polarity text not null,
  first_seen_document_id uuid not null references documents(id) on delete cascade,
  last_seen_document_id uuid not null references documents(id) on delete cascade,
  occurrence_count integer not null default 1,
  last_seen_at timestamptz not null,
  citations jsonb not null default '[]'::jsonb,
  primary key (company_id, id)
);

create table if not exists company_metrics (
  company_id text not null references companies(id) on delete cascade,
  metric_key text not null,
  label text not null,
  value text not null,
  period text,
  period_key text not null,
  first_seen_document_id uuid not null references documents(id) on delete cascade,
  last_seen_document_id uuid not null references documents(id) on delete cascade,
  occurrence_count integer not null default 1,
  last_seen_at timestamptz not null,
  citations jsonb not null default '[]'::jsonb,
  primary key (company_id, metric_key, value, period_key)
);

create index if not exists company_filings_company_idx on company_filings(company_id, processed_at desc);
create index if not exists company_risks_company_idx on company_risks(company_id, occurrence_count desc, last_seen_at desc);
create index if not exists company_claims_company_idx on company_claims(company_id, last_seen_at desc);
create index if not exists company_metrics_company_idx on company_metrics(company_id, last_seen_at desc);
