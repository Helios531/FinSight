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
