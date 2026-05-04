begin;

create extension if not exists vector;

alter table public.clients
  add column if not exists ai_enabled boolean not null default true;

alter table public.knowledge_documents
  add column if not exists source_type text not null default 'admin';

alter table public.knowledge_documents
  add column if not exists created_by uuid references public.managers(user_id) on delete set null;

alter table public.knowledge_documents
  add column if not exists updated_by uuid references public.managers(user_id) on delete set null;

alter table public.knowledge_documents
  add column if not exists last_indexed_at timestamp with time zone;

alter table public.knowledge_documents
  add column if not exists index_status text not null default 'pending';

alter table public.knowledge_documents
  add column if not exists index_error text;

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_source_type_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_source_type_check
  check (source_type in ('admin', 'file'));

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_index_status_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_index_status_check
  check (index_status in ('pending', 'indexed', 'failed'));

create table if not exists public.ai_decisions (
  id uuid primary key default gen_random_uuid(),
  dialog_id uuid not null references public.dialogs(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  response_message_id uuid references public.messages(id) on delete set null,
  decision_type text not null,
  intent text not null,
  ai_enabled boolean not null,
  manager_assigned boolean not null default false,
  model text,
  embedding_model text,
  matched_chunk_ids uuid[] not null default '{}'::uuid[],
  matched_document_ids uuid[] not null default '{}'::uuid[],
  max_similarity double precision,
  user_text text not null,
  assistant_text text,
  fallback_reason text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint ai_decisions_decision_type_check check (
    decision_type in ('intent_reply', 'kb_answer', 'manager_fallback', 'skipped')
  )
);

create index if not exists ai_decisions_dialog_created_at_idx
  on public.ai_decisions (dialog_id, created_at desc);

create index if not exists ai_decisions_client_created_at_idx
  on public.ai_decisions (client_id, created_at desc);

create index if not exists ai_decisions_message_id_idx
  on public.ai_decisions (message_id);

alter table public.ai_decisions enable row level security;

drop policy if exists "No direct access to ai_decisions" on public.ai_decisions;
create policy "No direct access to ai_decisions"
on public.ai_decisions
for all
to anon, authenticated
using (false)
with check (false);

commit;
