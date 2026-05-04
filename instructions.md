# Incubot Restore Instructions

Документ описывает полное восстановление проекта `incubot` с нуля: Next.js админка, Supabase PostgreSQL, RLS, pgvector, Supabase Edge Function на Deno, Telegram Bot API, OpenRouter с OpenAI chat model и OpenAI embeddings.

Продакшен URL: `https://incubot.vercel.app/`

Supabase project ref: `mxobymjsqoprdudiiayk`

## 1. Что должно работать

- Telegram webhook принимает входящие сообщения через Supabase Edge Function `telegram-webhook`.
- Все входящие сообщения сохраняются в Supabase в цепочке `clients -> dialogs -> messages`.
- Админка Next.js показывает inbox, историю сообщений, менеджеров и базу знаний.
- База знаний хранится в Supabase и управляется из админки.
- Админ может создавать, редактировать, удалять, публиковать и переиндексировать статьи.
- Для статей строятся embeddings через `openai/text-embedding-3-small`.
- Бот ищет релевантные chunks через `pgvector` и SQL RPC `match_knowledge_chunks`.
- Бот отвечает через OpenRouter chat completions с моделью `openai/gpt-4o-mini`.
- Для каждого клиента есть флаг `clients.ai_enabled`.
- Если AI выключен, менеджер назначен, контекст слабый, пользователь просит менеджера или AI упал, работает fallback на менеджера.
- Бот отдельно обрабатывает типовые интенты: приветствие, благодарность, согласие, прощание, запрос менеджера.
- История AI-решений пишется в `ai_decisions`.
- RLS включён на всех бизнес-таблицах.

## 2. Структура проекта

```text
incubot/
├── .env.example
├── .env.local
├── docs/
│   ├── erd.md
│   └── erd.puml
├── instructions.md
├── knowledge/
│   └── faq.md
├── next.config.ts
├── package.json
├── package-lock.json
├── scripts/
│   └── sync-knowledge.mjs
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   ├── clients/[clientId]/ai/route.ts
│   │   │   ├── dialogs/[dialogId]/
│   │   │   ├── inbox/route.ts
│   │   │   ├── knowledge/route.ts
│   │   │   ├── knowledge/[documentId]/route.ts
│   │   │   ├── knowledge/[documentId]/reindex/route.ts
│   │   │   └── managers/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── auth-shell.tsx
│   │   ├── inbox.tsx
│   │   ├── knowledge-modal.tsx
│   │   └── managers-modal.tsx
│   └── lib/
│       ├── auth.ts
│       ├── dialogs.ts
│       ├── knowledge.ts
│       ├── supabase.ts
│       └── server/
│           ├── auth.ts
│           ├── dialogs.ts
│           ├── knowledge.ts
│           ├── password.ts
│           ├── session.ts
│           └── supabase-admin.ts
├── supabase/
│   ├── config.toml
│   ├── functions/
│   │   ├── .env.example
│   │   └── telegram-webhook/
│   │       ├── deno.json
│   │       ├── deno.lock
│   │       └── index.ts
│   ├── migrations/
│   │   ├── 20260323234000_create_messages.sql
│   │   ├── 20260323234100_enable_rls_and_policies.sql
│   │   ├── 20260323235500_alter_messages_add_names_and_varchar.sql
│   │   ├── 20260406110000_add_message_direction.sql
│   │   ├── 20260406170000_create_admin_users.sql
│   │   ├── 20260414090000_restructure_for_dialogs_and_realtime.sql
│   │   ├── 20260420110000_add_ai_fallback_and_knowledge_base.sql
│   │   └── 20260504180000_admin_kb_ai_controls_and_decisions.sql
│   └── seed.sql
├── tasks/
│   └── todo.md
├── tsconfig.json
└── eslint.config.mjs
```

## 3. ENV

Нельзя коммитить реальные секреты.

### 3.1. `.env.local`

Создать файл:

```bash
cp .env.example .env.local
```

Содержимое:

```env
TELEGRAM_BOT_TOKEN=replace_with_telegram_bot_token
NEXT_PUBLIC_SUPABASE_URL=https://mxobymjsqoprdudiiayk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace_with_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=replace_with_supabase_service_role_key
AUTH_SESSION_SECRET=replace_with_long_random_secret
OPENROUTER_API_KEY=replace_with_openrouter_api_key
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small
```

### 3.2. `supabase/functions/.env`

Создать файл:

```bash
cp supabase/functions/.env.example supabase/functions/.env
```

Содержимое:

```env
SUPABASE_URL=https://mxobymjsqoprdudiiayk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace_with_supabase_service_role_key
TELEGRAM_BOT_TOKEN=replace_with_telegram_bot_token
OPENROUTER_API_KEY=replace_with_openrouter_api_key
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small
```

### 3.3. Vercel Environment Variables

В Vercel добавить:

```text
TELEGRAM_BOT_TOKEN
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
AUTH_SESSION_SECRET
OPENROUTER_API_KEY
OPENROUTER_MODEL
OPENROUTER_EMBEDDING_MODEL
```

## 4. Установка

```bash
brew install supabase/tap/supabase
curl -fsSL https://deno.land/install.sh | sh
npm install
supabase login
supabase link --project-ref mxobymjsqoprdudiiayk
```

Проверить:

```bash
node --version
npm --version
supabase --version
deno --version
```

## 5. База данных

Применить миграции:

```bash
supabase db push --linked --include-all
supabase migration list --linked
```

Обязательные таблицы:

```text
auth_users
managers
clients
dialogs
messages
dialog_assignments
realtime_events
knowledge_documents
knowledge_chunks
ai_decisions
```

Обязательные расширения:

```text
pgcrypto
vector
```

RLS должен быть включён:

```sql
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'auth_users',
    'managers',
    'clients',
    'dialogs',
    'messages',
    'dialog_assignments',
    'realtime_events',
    'knowledge_documents',
    'knowledge_chunks',
    'ai_decisions'
  )
order by tablename;
```

Ожидаемо: `rowsecurity = true` для каждой таблицы.

## 6. SQL: AI, KB, RLS

Файл: `supabase/migrations/20260420110000_add_ai_fallback_and_knowledge_base.sql`

```sql
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
```

Файл: `supabase/migrations/20260504180000_admin_kb_ai_controls_and_decisions.sql`

```sql
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
```

## 7. Основные файлы с кодом

### 7.1. `supabase/functions/telegram-webhook/index.ts`

Файл реализует Deno webhook: сохранение входящих сообщений, типовые интенты, per-client AI toggle, vector search, OpenRouter answer, fallback, запись `ai_decisions`.

Проверить код в репозитории:

```bash
sed -n '1,260p' supabase/functions/telegram-webhook/index.ts
sed -n '261,620p' supabase/functions/telegram-webhook/index.ts
```

### 7.2. `src/lib/server/knowledge.ts`

Файл реализует CRUD helper и reindex:

```bash
sed -n '1,260p' src/lib/server/knowledge.ts
sed -n '261,620p' src/lib/server/knowledge.ts
```

Обязательная логика:

- `listKnowledgeDocuments`
- `findKnowledgeDocument`
- `createKnowledgeDocument`
- `updateKnowledgeDocument`
- `deleteKnowledgeDocument`
- `reindexKnowledgeDocument`
- chunking по абзацам
- embeddings через `https://openrouter.ai/api/v1/embeddings`
- `index_status = indexed | pending | failed`

### 7.3. API routes

```text
src/app/api/knowledge/route.ts
src/app/api/knowledge/[documentId]/route.ts
src/app/api/knowledge/[documentId]/reindex/route.ts
src/app/api/clients/[clientId]/ai/route.ts
```

Проверить:

```bash
sed -n '1,220p' src/app/api/knowledge/route.ts
sed -n '1,260p' 'src/app/api/knowledge/[documentId]/route.ts'
sed -n '1,220p' 'src/app/api/knowledge/[documentId]/reindex/route.ts'
sed -n '1,220p' 'src/app/api/clients/[clientId]/ai/route.ts'
```

### 7.4. UI

```text
src/components/inbox.tsx
src/components/knowledge-modal.tsx
src/app/globals.css
```

В UI должно быть:

- кнопка `База знаний` для admin;
- список KB статей;
- создание/редактирование/удаление статьи;
- кнопка `Reindex`;
- checkbox `Опубликована`;
- checkbox `AI для клиента` в диалоге.

### 7.5. Bootstrap import из файлов

Файл `scripts/sync-knowledge.mjs` оставлен как bootstrap-импорт из `knowledge/`. Основной runtime-путь теперь через админку.

```bash
npm run sync:knowledge
```

## 8. Локальный запуск Next.js

```bash
npm run dev
```

Открыть:

```text
http://localhost:3000
```

Проверить:

- логин admin/manager работает;
- inbox открывается;
- admin видит `Менеджеры`;
- admin видит `База знаний`;
- можно создать статью;
- после сохранения у статьи `index_status = indexed`;
- в диалоге можно включить/выключить `AI для клиента`.

## 9. Supabase Edge Function

Локальная проверка Deno:

```bash
deno check --config supabase/functions/telegram-webhook/deno.json supabase/functions/telegram-webhook/index.ts
```

Локальный запуск Supabase:

```bash
supabase start
supabase functions serve telegram-webhook --env-file supabase/functions/.env
```

Деплой функции:

```bash
supabase functions deploy telegram-webhook --project-ref mxobymjsqoprdudiiayk
```

Продакшен URL функции:

```text
https://mxobymjsqoprdudiiayk.supabase.co/functions/v1/telegram-webhook
```

## 10. Telegram webhook

Установить webhook на Supabase Edge Function:

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://mxobymjsqoprdudiiayk.supabase.co/functions/v1/telegram-webhook"}'
```

Проверить webhook:

```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

Удалить webhook при необходимости:

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook"
```

## 11. Проверка AI и KB

Создать статью в админке:

```text
Заголовок: Стоимость и условия
Текст: Incubot принимает обращения из Telegram, сохраняет историю в Supabase и передаёт диалоги менеджерам. Если менеджер не назначен, бот отвечает по базе знаний.
Опубликована: да
```

Проверить SQL:

```sql
select
  id,
  title,
  is_published,
  index_status,
  last_indexed_at
from public.knowledge_documents
order by updated_at desc;

select
  documents.title,
  count(chunks.id) as chunks_count
from public.knowledge_documents documents
left join public.knowledge_chunks chunks
  on chunks.document_id = documents.id
group by documents.id, documents.title
order by documents.title;
```

Написать боту в Telegram:

```text
Что умеет Incubot?
```

Проверить:

```sql
select sender_type, text, created_at
from public.messages
order by created_at desc
limit 10;

select
  decision_type,
  intent,
  ai_enabled,
  manager_assigned,
  max_similarity,
  fallback_reason,
  error_message,
  created_at
from public.ai_decisions
order by created_at desc
limit 10;
```

Ожидаемо:

- входящее сообщение сохранено как `sender_type = client`;
- ответ бота сохранён как `sender_type = assistant`;
- в `ai_decisions` есть `decision_type = kb_answer` или корректный fallback;
- `matched_chunk_ids` содержит найденные chunks, если был KB answer.

## 12. Проверка типовых интентов

Отправить в Telegram:

```text
Привет
Спасибо
Да
Пока
Позовите менеджера
```

Ожидаемо:

- `Привет` -> `intent_reply`, `intent = greeting`;
- `Спасибо` -> `intent_reply`, `intent = thanks`;
- `Да` -> `intent_reply`, `intent = agreement`;
- `Пока` -> `intent_reply`, `intent = goodbye`;
- `Позовите менеджера` -> `manager_fallback`, `intent = manager_request`.

SQL:

```sql
select decision_type, intent, fallback_reason, assistant_text
from public.ai_decisions
order by created_at desc
limit 20;
```

## 13. Проверка AI toggle

В админке открыть диалог и выключить `AI для клиента`.

SQL:

```sql
select id, telegram_chat_id, ai_enabled
from public.clients
order by updated_at desc
limit 10;
```

Написать боту вопрос.

Ожидаемо:

- бот отвечает fallback-сообщением о передаче менеджеру;
- `ai_decisions.ai_enabled = false`;
- `fallback_reason = client_ai_disabled`.

## 14. Проверка менеджера

Назначить менеджера на диалог в админке.

Написать клиентом новое сообщение.

Ожидаемо:

- входящее сообщение сохраняется;
- AI-ответ не отправляется;
- `ai_decisions.decision_type = skipped`;
- `ai_decisions.fallback_reason = manager_assigned`.

## 15. Проверки перед деплоем

```bash
npm run typecheck
deno check --config supabase/functions/telegram-webhook/deno.json supabase/functions/telegram-webhook/index.ts
npm run build
```

Если `npm run build` не проходит из-за отсутствующих production env, заполнить `.env.local` или задать env в shell.

## 16. Деплой Supabase

```bash
supabase db push --linked --include-all
supabase functions deploy telegram-webhook --project-ref mxobymjsqoprdudiiayk
```

Установить секреты Edge Function:

```bash
supabase secrets set --project-ref mxobymjsqoprdudiiayk \
  SUPABASE_URL="https://mxobymjsqoprdudiiayk.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="replace_with_supabase_service_role_key" \
  TELEGRAM_BOT_TOKEN="replace_with_telegram_bot_token" \
  OPENROUTER_API_KEY="replace_with_openrouter_api_key" \
  OPENROUTER_MODEL="openai/gpt-4o-mini" \
  OPENROUTER_EMBEDDING_MODEL="openai/text-embedding-3-small"
```

Проверить секреты:

```bash
supabase secrets list --project-ref mxobymjsqoprdudiiayk
```

## 17. Деплой Vercel через git

Проверить diff:

```bash
git status --short
git diff --stat
```

Коммит:

```bash
git add .env.example supabase/functions/.env.example instructions.md tasks/todo.md \
  src/lib/knowledge.ts src/lib/server/knowledge.ts src/components/knowledge-modal.tsx \
  src/components/inbox.tsx src/app/globals.css scripts/sync-knowledge.mjs \
  src/app/api/knowledge src/app/api/clients \
  supabase/functions/telegram-webhook/index.ts \
  supabase/migrations/20260504180000_admin_kb_ai_controls_and_decisions.sql

git commit -m "Add admin-managed knowledge base AI fallback"
git push
```

Vercel автоматически задеплоит проект из git.

Проверить:

```text
https://incubot.vercel.app/
```

## 18. Definition of Done

- `npm run typecheck` проходит.
- `deno check --config supabase/functions/telegram-webhook/deno.json supabase/functions/telegram-webhook/index.ts` проходит.
- `npm run build` проходит.
- `supabase db push --linked --include-all` применяет миграции.
- `supabase functions deploy telegram-webhook --project-ref mxobymjsqoprdudiiayk` проходит.
- Telegram webhook указывает на Supabase function.
- В админке работает CRUD базы знаний.
- Reindex создаёт rows в `knowledge_chunks`.
- Бот отвечает по KB.
- Типовые интенты обрабатываются без AI generation.
- AI toggle клиента работает.
- При назначенном менеджере AI не отвечает.
- `ai_decisions` заполняется.
- RLS включён и прямой доступ к закрытым таблицам запрещён.
