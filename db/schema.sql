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

create table if not exists watchlists (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists watchlist_companies (
  watchlist_id text not null references watchlists(id) on delete cascade,
  company_id text not null references companies(id) on delete cascade,
  company_name text not null,
  tracked_at timestamptz not null default now(),
  last_document_id uuid,
  last_checked_at timestamptz,
  primary key (watchlist_id, company_id)
);

create table if not exists watchlist_alerts (
  id text primary key,
  watchlist_id text not null references watchlists(id) on delete cascade,
  company_id text not null references companies(id) on delete cascade,
  category text not null,
  severity text not null,
  title text not null,
  message text not null,
  document_id uuid not null references documents(id) on delete cascade,
  created_at timestamptz not null,
  acknowledged boolean not null default false,
  citations jsonb not null default '[]'::jsonb
);

create index if not exists watchlist_companies_watchlist_idx on watchlist_companies(watchlist_id, tracked_at desc);
create index if not exists watchlist_alerts_watchlist_idx on watchlist_alerts(watchlist_id, created_at desc);
create index if not exists watchlist_alerts_company_idx on watchlist_alerts(company_id, created_at desc);

create table if not exists portfolios (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portfolio_companies (
  portfolio_id text not null references portfolios(id) on delete cascade,
  company_id text not null references companies(id) on delete cascade,
  company_name text not null,
  sector text not null,
  added_at timestamptz not null default now(),
  latest_document_id uuid,
  latest_document_filename text,
  filing_count integer not null default 0,
  risk_count integer not null default 0,
  alert_count integer not null default 0,
  primary key (portfolio_id, company_id)
);

create index if not exists portfolio_companies_portfolio_idx on portfolio_companies(portfolio_id, sector, company_name);

create table if not exists cross_company_intelligence (
  id text primary key,
  portfolio_id text not null references portfolios(id) on delete cascade,
  generated_at timestamptz not null,
  competitor_comparisons jsonb not null default '[]'::jsonb,
  sector_trends jsonb not null default '[]'::jsonb,
  industry_trends jsonb not null default '[]'::jsonb,
  macro_exposures jsonb not null default '[]'::jsonb,
  limitations jsonb not null default '[]'::jsonb
);

create index if not exists cross_company_intelligence_portfolio_idx
  on cross_company_intelligence(portfolio_id, generated_at desc);

create table if not exists analyst_workspaces (
  id text primary key,
  document_id uuid not null references documents(id) on delete cascade,
  company_id text references companies(id) on delete set null,
  title text not null,
  collaborators jsonb not null default '[]'::jsonb,
  analyst_notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspace_annotations (
  id text primary key,
  workspace_id text not null references analyst_workspaces(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  target_type text not null,
  target_id text not null,
  note text not null,
  author text not null,
  created_at timestamptz not null,
  citations jsonb not null default '[]'::jsonb
);

create table if not exists workspace_findings (
  id text primary key,
  workspace_id text not null references analyst_workspaces(id) on delete cascade,
  title text not null,
  summary text not null,
  priority text not null,
  status text not null,
  owner text not null,
  created_at timestamptz not null,
  citations jsonb not null default '[]'::jsonb
);

create table if not exists workspace_exports (
  id text primary key,
  workspace_id text not null references analyst_workspaces(id) on delete cascade,
  format text not null,
  filename text not null,
  generated_at timestamptz not null,
  checksum text not null,
  content text not null
);

create index if not exists analyst_workspaces_document_idx on analyst_workspaces(document_id);
create index if not exists workspace_annotations_workspace_idx on workspace_annotations(workspace_id, created_at desc);
create index if not exists workspace_findings_workspace_idx on workspace_findings(workspace_id, priority, created_at desc);
create index if not exists workspace_exports_workspace_idx on workspace_exports(workspace_id, generated_at desc);

create table if not exists audit_runs (
  id text primary key,
  document_id uuid not null references documents(id) on delete cascade,
  reproducibility_seed text not null,
  report_checksum text not null,
  created_at timestamptz not null
);

create table if not exists audit_events (
  id text primary key,
  audit_id text not null references audit_runs(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  event_type text not null,
  actor text not null,
  occurred_at timestamptz not null,
  details jsonb not null default '{}'::jsonb
);

create table if not exists evidence_tracking (
  id text primary key,
  audit_id text not null references audit_runs(id) on delete cascade,
  citation_id text not null,
  document_id uuid not null references documents(id) on delete cascade,
  section text not null,
  page integer,
  excerpt_hash text not null,
  claim_ids jsonb not null default '[]'::jsonb
);

create table if not exists report_versions (
  id text primary key,
  audit_id text not null references audit_runs(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  version integer not null,
  created_at timestamptz not null,
  checksum text not null,
  reproducibility_seed text not null
);

create index if not exists audit_runs_document_idx on audit_runs(document_id, created_at desc);
create index if not exists audit_events_audit_idx on audit_events(audit_id, occurred_at desc);
create index if not exists evidence_tracking_audit_idx on evidence_tracking(audit_id, citation_id);
create index if not exists report_versions_document_idx on report_versions(document_id, version desc);
