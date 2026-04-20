begin;

create extension if not exists vector;

alter table public.messages
  drop constraint if exists messages_sender_type_check;

alter table public.messages
  drop constraint if exists messages_sender_integrity_check;

alter table public.messages
  add constraint messages_sender_type_check
  check (sender_type in ('client', 'manager', 'assistant'));

alter table public.messages
  add constraint messages_sender_integrity_check
  check (
    (
      sender_type = 'client'
      and client_id is not null
      and manager_id is null
    ) or (
      sender_type = 'manager'
      and manager_id is not null
      and client_id is null
    ) or (
      sender_type = 'assistant'
      and client_id is null
      and manager_id is null
    )
  );

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  slug text not null,
  title text not null,
  content text not null,
  content_hash text not null,
  is_published boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create unique index if not exists knowledge_documents_source_key_idx
  on public.knowledge_documents (source_key);

create unique index if not exists knowledge_documents_slug_idx
  on public.knowledge_documents (slug);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536) not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint knowledge_chunks_chunk_index_check check (chunk_index >= 0)
);

create unique index if not exists knowledge_chunks_document_chunk_idx
  on public.knowledge_chunks (document_id, chunk_index);

create index if not exists knowledge_chunks_document_id_idx
  on public.knowledge_chunks (document_id);

create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

drop trigger if exists set_knowledge_documents_updated_at on public.knowledge_documents;
create trigger set_knowledge_documents_updated_at
before update on public.knowledge_documents
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_knowledge_chunks_updated_at on public.knowledge_chunks;
create trigger set_knowledge_chunks_updated_at
before update on public.knowledge_chunks
for each row
execute function public.set_current_timestamp_updated_at();

create or replace function public.match_knowledge_chunks(
  query_embedding_text text,
  match_count integer default 5,
  min_similarity double precision default 0.55
)
returns table (
  chunk_id uuid,
  document_id uuid,
  source_key text,
  slug text,
  title text,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
as $$
  with query as (
    select query_embedding_text::vector(1536) as embedding
  )
  select
    chunks.id as chunk_id,
    documents.id as document_id,
    documents.source_key,
    documents.slug,
    documents.title,
    chunks.content,
    chunks.metadata,
    1 - (chunks.embedding <=> query.embedding) as similarity
  from public.knowledge_chunks chunks
  join public.knowledge_documents documents
    on documents.id = chunks.document_id
  cross join query
  where documents.is_published = true
    and 1 - (chunks.embedding <=> query.embedding) >= min_similarity
  order by chunks.embedding <=> query.embedding asc
  limit greatest(match_count, 1);
$$;

alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;

drop policy if exists "No direct access to knowledge_documents" on public.knowledge_documents;
create policy "No direct access to knowledge_documents"
on public.knowledge_documents
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No direct access to knowledge_chunks" on public.knowledge_chunks;
create policy "No direct access to knowledge_chunks"
on public.knowledge_chunks
for all
to anon, authenticated
using (false)
with check (false);

commit;
