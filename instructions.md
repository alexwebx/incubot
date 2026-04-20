# Incubot Restore Instructions

## 1. Цель

Нужно восстановить проект в рабочем состоянии со следующими обязательными функциями:

- Telegram webhook на Supabase Edge Functions принимает входящие сообщения
- все входящие и исходящие сообщения сохраняются в PostgreSQL через `clients -> dialogs -> messages`
- если на диалог не назначен менеджер, бот отвечает автоматически через OpenRouter с моделью DeepSeek
- перед генерацией ответа выполняется векторный поиск по базе знаний через `pgvector`
- если на диалог назначен менеджер, автоответ отключается
- фронт на Next.js показывает историю диалога, назначение менеджера и сообщения `assistant`
- RLS включён на всех бизнес-таблицах, в том числе на knowledge base

По состоянию на 2026-04-20 в проекте используются:

- chat model: `deepseek/deepseek-chat`
- embeddings model: `openai/text-embedding-3-small`

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
├── package-lock.json
├── package.json
├── scripts/
│   └── sync-knowledge.mjs
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── change-password/route.ts
│   │   │   │   ├── login/route.ts
│   │   │   │   ├── logout/route.ts
│   │   │   │   ├── recover/route.ts
│   │   │   │   └── register/route.ts
│   │   │   ├── dialogs/
│   │   │   │   └── [dialogId]/
│   │   │   │       ├── assign/route.ts
│   │   │   │       └── messages/route.ts
│   │   │   ├── inbox/route.ts
│   │   │   └── managers/
│   │   │       ├── [managerId]/approve/route.ts
│   │   │       ├── [managerId]/password/route.ts
│   │   │       └── route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── auth-shell.tsx
│   │   ├── inbox.tsx
│   │   └── managers-modal.tsx
│   └── lib/
│       ├── auth.ts
│       ├── dialogs.ts
│       ├── supabase.ts
│       └── server/
│           ├── auth.ts
│           ├── dialogs.ts
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
│   │   └── 20260420110000_add_ai_fallback_and_knowledge_base.sql
│   └── seed.sql
└── tsconfig.json
```

Ключевые рабочие файлы:

- [supabase/functions/telegram-webhook/index.ts](/Users/alex/Desktop/incubator/incubot/supabase/functions/telegram-webhook/index.ts:1)
- [supabase/migrations/20260420110000_add_ai_fallback_and_knowledge_base.sql](/Users/alex/Desktop/incubator/incubot/supabase/migrations/20260420110000_add_ai_fallback_and_knowledge_base.sql:1)
- [scripts/sync-knowledge.mjs](/Users/alex/Desktop/incubator/incubot/scripts/sync-knowledge.mjs:1)
- [knowledge/faq.md](/Users/alex/Desktop/incubator/incubot/knowledge/faq.md:1)
- [src/components/inbox.tsx](/Users/alex/Desktop/incubator/incubot/src/components/inbox.tsx:1)
- [src/lib/dialogs.ts](/Users/alex/Desktop/incubator/incubot/src/lib/dialogs.ts:1)

## 3. ENV

### 3.1. Next.js `.env.local`

```env
TELEGRAM_BOT_TOKEN=replace_with_telegram_bot_token
NEXT_PUBLIC_SUPABASE_URL=https://mxobymjsqoprdudiiayk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace_with_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=replace_with_supabase_service_role_key
AUTH_SESSION_SECRET=replace_with_long_random_secret
OPENROUTER_API_KEY=replace_with_openrouter_api_key
OPENROUTER_MODEL=deepseek/deepseek-chat
OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small
```

### 3.2. Edge Functions `supabase/functions/.env`

Создать файл `supabase/functions/.env` на основе [supabase/functions/.env.example](/Users/alex/Desktop/incubator/incubot/supabase/functions/.env.example:1)

```env
SUPABASE_URL=https://mxobymjsqoprdudiiayk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace_with_supabase_service_role_key
TELEGRAM_BOT_TOKEN=replace_with_telegram_bot_token
OPENROUTER_API_KEY=replace_with_openrouter_api_key
OPENROUTER_MODEL=deepseek/deepseek-chat
OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small
```

### 3.3. Vercel Environment Variables

В Vercel должны быть добавлены:

- `TELEGRAM_BOT_TOKEN`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH_SESSION_SECRET`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `OPENROUTER_EMBEDDING_MODEL`

## 4. Установка и первичная инициализация

### 4.1. Локальные зависимости

```bash
brew install supabase/tap/supabase
brew install cloudflared
curl -fsSL https://deno.land/install.sh | sh
npm install
```

### 4.2. Логин и линковка Supabase проекта

```bash
supabase login
supabase link --project-ref mxobymjsqoprdudiiayk
```

### 4.3. Создание env файлов

```bash
cp .env.example .env.local
cp supabase/functions/.env.example supabase/functions/.env
```

После копирования вручную заполнить секреты.

## 5. База данных и миграции

### 5.1. Применение всех миграций

```bash
supabase db push --linked --include-all
```

### 5.2. Проверка, что миграции применились

```bash
supabase migration list --linked
```

### 5.3. Что обязательно должно существовать после миграций

Таблицы:

- `auth_users`
- `managers`
- `clients`
- `dialogs`
- `messages`
- `dialog_assignments`
- `realtime_events`
- `knowledge_documents`
- `knowledge_chunks`

Расширения:

- `pgcrypto`
- `vector`

RLS:

- включён на `auth_users`
- включён на `managers`
- включён на `clients`
- включён на `dialogs`
- включён на `messages`
- включён на `dialog_assignments`
- включён на `realtime_events`
- включён на `knowledge_documents`
- включён на `knowledge_chunks`

### 5.4. Полный SQL новой миграции knowledge base и AI fallback

Файл: [supabase/migrations/20260420110000_add_ai_fallback_and_knowledge_base.sql](/Users/alex/Desktop/incubator/incubot/supabase/migrations/20260420110000_add_ai_fallback_and_knowledge_base.sql:1)

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

## 6. База знаний

### 6.1. Источник базы знаний

Все markdown и txt файлы из папки `knowledge/` попадают в Postgres через скрипт синхронизации.

Пример файла: [knowledge/faq.md](/Users/alex/Desktop/incubator/incubot/knowledge/faq.md:1)

```md
# База знаний Incubot

## Кто вы

Мы принимаем обращения из Telegram и передаём их в CRM-поток менеджеров.

## Когда отвечает бот

Если менеджер ещё не назначен на диалог, бот отвечает автоматически на основе базы знаний.

## Когда отвечает менеджер

Как только диалог назначен менеджеру, автоответ отключается и дальше пишет только человек.

## Что можно спросить

- стоимость и условия работы
- сроки обратной связи
- порядок запуска проекта
- контакты и формат передачи информации

## Ограничение

Если в базе знаний нет надёжного ответа, бот должен честно сказать, что передаст вопрос менеджеру.
```

### 6.2. Синхронизация базы знаний в Supabase

```bash
npm run sync:knowledge
```

Скрипт:

- читает `knowledge/**/*.md|txt`
- режет тексты на чанки
- строит embeddings через OpenRouter
- upsert-ит `knowledge_documents`
- полностью переиндексирует `knowledge_chunks` для изменённых документов
- удаляет документы из БД, которых больше нет в папке `knowledge/`

### 6.3. Полный код скрипта синхронизации

Файл: [scripts/sync-knowledge.mjs](/Users/alex/Desktop/incubator/incubot/scripts/sync-knowledge.mjs:1)

```js
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const knowledgeRoot = path.join(repoRoot, "knowledge");

function loadEnvFile(filename) {
  const absolutePath = path.join(repoRoot, filename);

  return readFile(absolutePath, "utf8")
    .then((content) => {
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();

        if (!line || line.startsWith("#")) {
          continue;
        }

        const separatorIndex = line.indexOf("=");

        if (separatorIndex === -1) {
          continue;
        }

        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

        if (!(key in process.env)) {
          process.env[key] = value;
        }
      }
    })
    .catch(() => undefined);
}

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

async function listKnowledgeFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listKnowledgeFiles(absolutePath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!/\.(md|mdx|txt)$/i.test(entry.name)) {
      continue;
    }

    files.push(absolutePath);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function normalizeWhitespace(value) {
  return value.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function createSlug(relativePath) {
  return relativePath
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");
}

function extractTitle(content, fallbackName) {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();

  if (heading) {
    return heading;
  }

  return fallbackName.replace(/\.[^.]+$/, "");
}

function estimateTokens(value) {
  return Math.max(1, Math.ceil(value.length / 4));
}

function chunkContent(content, maxChars = 1200, overlapChars = 200) {
  const normalized = normalizeWhitespace(content);

  if (!normalized) {
    return [];
  }

  const paragraphs = normalized.split("\n\n");
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;

    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }

    let start = 0;
    while (start < paragraph.length) {
      const end = Math.min(start + maxChars, paragraph.length);
      const slice = paragraph.slice(start, end).trim();
      if (slice) {
        chunks.push(slice);
      }
      start = Math.max(end - overlapChars, start + 1);
    }

    current = "";
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.map((chunk) => chunk.trim()).filter(Boolean);
}

async function generateEmbeddings(apiKey, model, values) {
  if (values.length === 0) {
    return [];
  }

  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://incubot.vercel.app",
      "X-Title": "Incubot Knowledge Sync",
    },
    body: JSON.stringify({
      model,
      input: values,
      encoding_format: "float",
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `OpenRouter embeddings failed: ${response.status} ${JSON.stringify(payload)}`,
    );
  }

  const data = payload?.data;

  if (!Array.isArray(data) || data.length !== values.length) {
    throw new Error("OpenRouter embeddings response shape is invalid");
  }

  return data.map((item) => item.embedding);
}

async function main() {
  await loadEnvFile(".env.local");
  await loadEnvFile(".env");

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const openRouterApiKey = requireEnv("OPENROUTER_API_KEY");
  const embeddingModel = process.env.OPENROUTER_EMBEDDING_MODEL ?? "openai/text-embedding-3-small";

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const files = await listKnowledgeFiles(knowledgeRoot);

  if (files.length === 0) {
    throw new Error(`No knowledge files found in ${knowledgeRoot}`);
  }

  const sourceKeys = [];
  const summary = [];

  for (const absolutePath of files) {
    const relativePath = path.relative(repoRoot, absolutePath).replace(/\\/g, "/");
    const rawContent = await readFile(absolutePath, "utf8");
    const content = normalizeWhitespace(rawContent);

    if (!content) {
      continue;
    }

    const title = extractTitle(content, path.basename(relativePath));
    const slug = createSlug(relativePath);
    const contentHash = createHash("sha256").update(content).digest("hex");
    const chunks = chunkContent(content);

    if (chunks.length === 0) {
      continue;
    }

    sourceKeys.push(relativePath);

    const { data: existingDocument, error: existingDocumentError } = await supabase
      .from("knowledge_documents")
      .select("id, content_hash")
      .eq("source_key", relativePath)
      .maybeSingle();

    if (existingDocumentError) {
      throw new Error(existingDocumentError.message);
    }

    if (existingDocument?.content_hash === contentHash) {
      summary.push(`${relativePath}: skipped`);
      continue;
    }

    const { data: document, error: upsertDocumentError } = await supabase
      .from("knowledge_documents")
      .upsert(
        {
          source_key: relativePath,
          slug,
          title,
          content,
          content_hash: contentHash,
          is_published: true,
          metadata: {
            source_path: relativePath,
            synced_at: new Date().toISOString(),
          },
        },
        { onConflict: "source_key" },
      )
      .select("id")
      .single();

    if (upsertDocumentError) {
      throw new Error(upsertDocumentError.message);
    }

    const embeddings = await generateEmbeddings(openRouterApiKey, embeddingModel, chunks);

    const { error: deleteChunksError } = await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("document_id", document.id);

    if (deleteChunksError) {
      throw new Error(deleteChunksError.message);
    }

    const { error: insertChunksError } = await supabase.from("knowledge_chunks").insert(
      chunks.map((chunk, index) => ({
        document_id: document.id,
        chunk_index: index,
        content: chunk,
        token_count: estimateTokens(chunk),
        metadata: {
          source_path: relativePath,
          title,
        },
        embedding: embeddings[index],
      })),
    );

    if (insertChunksError) {
      throw new Error(insertChunksError.message);
    }

    summary.push(`${relativePath}: ${chunks.length} chunks`);
  }

  const { data: existingDocuments, error: existingDocumentsError } = await supabase
    .from("knowledge_documents")
    .select("id, source_key");

  if (existingDocumentsError) {
    throw new Error(existingDocumentsError.message);
  }

  const staleDocumentIds = (existingDocuments ?? [])
    .filter((document) => !sourceKeys.includes(document.source_key))
    .map((document) => document.id);

  if (staleDocumentIds.length > 0) {
    const { error: deleteDocumentsError } = await supabase
      .from("knowledge_documents")
      .delete()
      .in("id", staleDocumentIds);

    if (deleteDocumentsError) {
      throw new Error(deleteDocumentsError.message);
    }

    summary.push(`deleted stale documents: ${staleDocumentIds.length}`);
  }

  console.log("Knowledge sync completed");
  for (const line of summary) {
    console.log(`- ${line}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## 7. Telegram webhook и AI fallback

### 7.1. Локальный запуск

Терминал 1:

```bash
npm run dev
```

Терминал 2:

```bash
supabase functions serve telegram-webhook --no-verify-jwt --env-file supabase/functions/.env
```

Терминал 3:

```bash
cloudflared tunnel --url http://localhost:54321/functions/v1
```

### 7.2. Деплой Edge Function

```bash
supabase functions deploy telegram-webhook --no-verify-jwt
```

### 7.3. Установка webhook в Telegram

```bash
curl https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook \
  -d "url=https://mxobymjsqoprdudiiayk.functions.supabase.co/telegram-webhook"
```

Проверка:

```bash
curl https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo
```

### 7.4. Полный код webhook

Файл: [supabase/functions/telegram-webhook/index.ts](/Users/alex/Desktop/incubator/incubot/supabase/functions/telegram-webhook/index.ts:1)

```ts
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type TelegramUpdate = {
  message?: {
    chat?: {
      id?: number | string;
      username?: string;
    };
    from?: {
      id?: number;
      is_bot?: boolean;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    text?: string;
    message_id?: number;
  };
};

type ClientRow = {
  id: string;
  telegram_chat_id: string;
};

type DialogRow = {
  id: string;
  client_id: string;
  status: "open" | "closed";
};

type ActiveAssignmentRow = {
  id: string;
  manager_id: string;
};

type KnowledgeMatch = {
  chunk_id: string;
  document_id: string;
  source_key: string;
  slug: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
const openRouterApiKey = Deno.env.get("OPENROUTER_API_KEY");
const openRouterModel = Deno.env.get("OPENROUTER_MODEL") ?? "deepseek/deepseek-chat";
const openRouterEmbeddingModel =
  Deno.env.get("OPENROUTER_EMBEDDING_MODEL") ?? "openai/text-embedding-3-small";

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is not set");
}

if (!supabaseServiceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
}

if (!telegramBotToken) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

if (!openRouterApiKey) {
  throw new Error("OPENROUTER_API_KEY is not set");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function toVectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}

function buildKnowledgeContext(matches: KnowledgeMatch[]) {
  return matches
    .map(
      (match, index) =>
        `Источник ${index + 1}: ${match.title} (${match.source_key}, similarity=${match.similarity.toFixed(3)})\n${match.content}`,
    )
    .join("\n\n");
}

async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  messageId?: number,
) {
  const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_to_message_id: messageId,
    }),
  });

  if (!response.ok) {
    const telegramError = await response.text();
    throw new Error(`Telegram sendMessage failed: ${telegramError}`);
  }
}

async function upsertClient(input: {
  telegramUserId?: number;
  telegramChatId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const { data, error } = await supabase
    .from("clients")
    .upsert(
      {
        telegram_user_id: input.telegramUserId ?? null,
        telegram_chat_id: input.telegramChatId,
        username: input.username ?? null,
        first_name: input.firstName ?? null,
        last_name: input.lastName ?? null,
      },
      { onConflict: "telegram_chat_id" },
    )
    .select("id, telegram_chat_id")
    .single<ClientRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function findOrCreateOpenDialog(clientId: string) {
  const { data: existingDialog, error: existingDialogError } = await supabase
    .from("dialogs")
    .select("id, client_id, status")
    .eq("client_id", clientId)
    .eq("status", "open")
    .maybeSingle<DialogRow>();

  if (existingDialogError) {
    throw new Error(existingDialogError.message);
  }

  if (existingDialog) {
    return existingDialog;
  }

  const now = new Date().toISOString();
  const { data: createdDialog, error: createDialogError } = await supabase
    .from("dialogs")
    .insert({
      client_id: clientId,
      status: "open",
      created_at: now,
      updated_at: now,
    })
    .select("id, client_id, status")
    .single<DialogRow>();

  if (createDialogError) {
    throw new Error(createDialogError.message);
  }

  return createdDialog;
}

async function createMessage(input: {
  dialogId: string;
  senderType: "client" | "assistant";
  text: string;
  clientId?: string | null;
}) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("messages")
    .insert({
      dialog_id: input.dialogId,
      client_id: input.senderType === "client" ? input.clientId ?? null : null,
      manager_id: null,
      sender_type: input.senderType,
      text: input.text,
      created_at: now,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  const { error: updateDialogError } = await supabase
    .from("dialogs")
    .update({ updated_at: now })
    .eq("id", input.dialogId);

  if (updateDialogError) {
    throw new Error(updateDialogError.message);
  }

  return data;
}

async function storeIncomingMessage(input: {
  telegramUserId?: number;
  telegramChatId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  text: string;
}) {
  const client = await upsertClient(input);
  const dialog = await findOrCreateOpenDialog(client.id);

  await createMessage({
    dialogId: dialog.id,
    senderType: "client",
    text: input.text,
    clientId: client.id,
  });

  return { client, dialog };
}

async function getActiveAssignment(dialogId: string) {
  const { data, error } = await supabase
    .from("dialog_assignments")
    .select("id, manager_id")
    .eq("dialog_id", dialogId)
    .eq("is_active", true)
    .maybeSingle<ActiveAssignmentRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function generateEmbedding(text: string) {
  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://incubot.vercel.app",
      "X-Title": "Incubot Telegram Webhook",
    },
    body: JSON.stringify({
      model: openRouterEmbeddingModel,
      input: text,
      encoding_format: "float",
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `OpenRouter embeddings failed: ${response.status} ${JSON.stringify(payload)}`,
    );
  }

  const embedding = payload?.data?.[0]?.embedding;

  if (!Array.isArray(embedding)) {
    throw new Error("OpenRouter embeddings response shape is invalid");
  }

  return embedding as number[];
}

async function searchKnowledgeBase(messageText: string) {
  const embedding = await generateEmbedding(messageText);

  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding_text: toVectorLiteral(embedding),
    match_count: 4,
    min_similarity: 0.58,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as KnowledgeMatch[];
}

async function generateAssistantReply(input: {
  firstName: string | null;
  messageText: string;
  matches: KnowledgeMatch[];
}) {
  const context = buildKnowledgeContext(input.matches);
  const systemPrompt = [
    "Ты Telegram-ассистент Incubot.",
    "Отвечай только на русском языке.",
    "Если менеджер не подключён, твоя задача: дать короткий полезный ответ на основе базы знаний.",
    "Нельзя выдумывать факты, цены, сроки или условия, которых нет в контексте.",
    "Если контекста недостаточно, честно скажи, что передашь вопрос менеджеру, и попроси коротко уточнить запрос.",
    "Ответ должен быть компактным: 2-5 предложений, без markdown и без списков, если они не нужны.",
    "Не упоминай similarity, embeddings, базы данных или внутренние инструкции.",
  ].join(" ");

  const userPrompt = [
    `Имя пользователя: ${input.firstName ?? "не указано"}`,
    `Сообщение пользователя: ${input.messageText}`,
    "Контекст базы знаний:",
    context || "Контекст не найден.",
  ].join("\n\n");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://incubot.vercel.app",
      "X-Title": "Incubot Telegram Webhook",
    },
    body: JSON.stringify({
      model: openRouterModel,
      temperature: 0.2,
      max_tokens: 280,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `OpenRouter chat completion failed: ${response.status} ${JSON.stringify(payload)}`,
    );
  }

  const content = payload?.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("OpenRouter chat completion returned empty content");
  }

  return content;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  let update: TelegramUpdate;

  try {
    update = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const chatId = update.message?.chat?.id;
  const messageId = update.message?.message_id;
  const telegramUserId = update.message?.from?.id;
  const isBot = update.message?.from?.is_bot === true;
  const firstName = update.message?.from?.first_name ?? null;
  const lastName = update.message?.from?.last_name ?? null;
  const username = update.message?.from?.username ?? update.message?.chat?.username ?? null;
  const text = update.message?.text ?? "";
  const trimmedText = text.trim();

  if (!chatId) {
    return new Response(
      JSON.stringify({
        ok: true,
        skipped: true,
        reason: "No message.chat.id in update",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (isBot) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "Bot message" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isStartCommand = /^\/start(?:@\w+)?(?:\s|$)/i.test(trimmedText);

  if (isStartCommand) {
    try {
      await sendTelegramMessage(
        chatId,
        firstName
          ? `Привет, ${firstName}. Напиши вопрос, и я сразу отвечу или передам диалог менеджеру.`
          : "Привет. Напиши вопрос, и я сразу отвечу или передам диалог менеджеру.",
        messageId,
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!trimmedText) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "Empty message" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { dialog } = await storeIncomingMessage({
      telegramUserId,
      telegramChatId: String(chatId),
      username,
      firstName,
      lastName,
      text: trimmedText,
    });

    const activeAssignment = await getActiveAssignment(dialog.id);

    if (!activeAssignment) {
      let assistantReply =
        "Я получил сообщение и передам его менеджеру. Если вопрос срочный, напишите его максимально конкретно одним сообщением.";

      try {
        const matches = await searchKnowledgeBase(trimmedText);
        assistantReply = await generateAssistantReply({
          firstName,
          messageText: trimmedText,
          matches,
        });
      } catch (assistantError) {
        console.error("assistant fallback error", assistantError);
      }

      await sendTelegramMessage(chatId, assistantReply, messageId);
      await createMessage({
        dialogId: dialog.id,
        senderType: "assistant",
        text: assistantReply,
      });
    }
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
```

## 8. Frontend и типы

### 8.1. Тип сообщений

Файл: [src/lib/dialogs.ts](/Users/alex/Desktop/incubator/incubot/src/lib/dialogs.ts:1)

```ts
import type { PublicUser } from "@/lib/auth";

export type DialogStatus = "open" | "closed";
export type SenderType = "client" | "manager" | "assistant";

export type ClientRecord = {
  id: string;
  telegram_user_id: number | null;
  telegram_chat_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  updated_at: string;
};

export type DialogMessage = {
  id: string;
  dialog_id: string;
  client_id: string | null;
  manager_id: string | null;
  sender_type: SenderType;
  text: string;
  created_at: string;
};

export type DialogAssignment = {
  id: string;
  dialog_id: string;
  manager_id: string;
  assigned_by: string | null;
  assigned_at: string;
  unassigned_at: string | null;
  is_active: boolean;
  updated_at: string;
};

export type DialogRecord = {
  id: string;
  status: DialogStatus;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type InboxDialog = DialogRecord & {
  client: ClientRecord;
  messages: DialogMessage[];
  active_assignment: DialogAssignment | null;
  assigned_manager: PublicUser | null;
  latest_message_at: string;
};

export function getClientDisplayName(client: Pick<ClientRecord, "first_name" | "last_name" | "username">) {
  const fullName = [client.first_name, client.last_name].filter(Boolean).join(" ").trim();

  if (fullName) {
    return fullName;
  }

  if (client.username) {
    return `@${client.username}`;
  }

  return "Unknown user";
}

export function getDialogPreview(message: DialogMessage | undefined) {
  if (!message?.text?.trim()) {
    return "Empty message";
  }

  return message.text;
}
```

### 8.2. Inbox должен уметь рисовать `assistant`

Файл: [src/components/inbox.tsx](/Users/alex/Desktop/incubator/incubot/src/components/inbox.tsx:1)

Критичные изменения:

- добавлена функция `getMessageBubbleClass`
- статус без назначения показывает `AI fallback активен до назначения менеджера`
- сообщения `assistant` рендерятся отдельным классом `bubbleAssistant`

### 8.3. CSS для assistant bubble

Файл: [src/app/globals.css](/Users/alex/Desktop/incubator/incubot/src/app/globals.css:1)

```css
.bubbleAssistant {
  justify-self: start;
  background:
    linear-gradient(180deg, rgba(83, 189, 235, 0.14), rgba(83, 189, 235, 0.06)),
    var(--panel-2);
  border-color: rgba(83, 189, 235, 0.22);
  border-top-left-radius: 8px;
}
```

## 9. Проверки

### 9.1. TypeScript

```bash
npm run typecheck
```

### 9.2. Production build

```bash
npm run build
```

### 9.3. Deno type check

Проверять из каталога функции:

```bash
cd supabase/functions/telegram-webhook
deno check --config deno.json index.ts
```

### 9.4. Node syntax check для knowledge sync

```bash
node --check scripts/sync-knowledge.mjs
```

### 9.5. Проверка данных knowledge base

После `npm run sync:knowledge` выполнить SQL в Supabase SQL Editor:

```sql
select id, source_key, slug, title, is_published, created_at, updated_at
from public.knowledge_documents
order by updated_at desc;

select document_id, chunk_index, left(content, 120) as preview, token_count
from public.knowledge_chunks
order by document_id, chunk_index;
```

### 9.6. Проверка vector search

```sql
select *
from public.match_knowledge_chunks(
  '[0.01,0.02,0.03]'::text,
  3,
  0.1
);
```

Примечание: для реальной проверки нужен embedding длиной 1536. Короткий пример выше нужен только чтобы помнить сигнатуру вызова. Рабочую проверку удобнее делать после `npm run sync:knowledge` через приложение или временный SQL helper.

## 10. Полная последовательность восстановления с нуля

Выполнить последовательно:

1. Склонировать репозиторий.
2. Установить `supabase`, `cloudflared`, `deno`, `npm` зависимости.
3. Заполнить `.env.local`.
4. Заполнить `supabase/functions/.env`.
5. Выполнить `supabase login`.
6. Выполнить `supabase link --project-ref mxobymjsqoprdudiiayk`.
7. Выполнить `supabase db push --linked --include-all`.
8. Выполнить `npm run sync:knowledge`.
9. Выполнить `npm run typecheck`.
10. Выполнить `npm run build`.
11. Выполнить `cd supabase/functions/telegram-webhook && deno check --config deno.json index.ts`.
12. Выполнить `supabase functions deploy telegram-webhook --no-verify-jwt`.
13. Выполнить `curl https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook -d "url=https://mxobymjsqoprdudiiayk.functions.supabase.co/telegram-webhook"`.
14. Добавить те же env в Vercel.
15. Выполнить `git add . && git commit -m "Add DeepSeek fallback and knowledge vector search" && git push origin main`.

## 11. Git и Vercel

### 11.1. Локальный коммит

```bash
git status
git add .
git commit -m "Add DeepSeek fallback and knowledge vector search"
```

### 11.2. Пуш в ветку, подключённую к Vercel

```bash
git push origin main
```

Если Vercel уже подключён к репозиторию `https://incubot.vercel.app/`, новый push в `main` автоматически создаст новый deployment.

## 12. Обязательные файлы, которые уже должны быть в репозитории

Эти файлы не нужно пересоздавать вручную, если восстановление идёт из git, но они являются частью рабочего состояния и должны остаться как есть:

- [package.json](/Users/alex/Desktop/incubator/incubot/package.json:1)
- [next.config.ts](/Users/alex/Desktop/incubator/incubot/next.config.ts:1)
- [tsconfig.json](/Users/alex/Desktop/incubator/incubot/tsconfig.json:1)
- [src/app/page.tsx](/Users/alex/Desktop/incubator/incubot/src/app/page.tsx:1)
- [src/app/api/dialogs/[dialogId]/messages/route.ts](/Users/alex/Desktop/incubator/incubot/src/app/api/dialogs/[dialogId]/messages/route.ts:1)
- [src/lib/server/dialogs.ts](/Users/alex/Desktop/incubator/incubot/src/lib/server/dialogs.ts:1)
- [src/lib/server/supabase-admin.ts](/Users/alex/Desktop/incubator/incubot/src/lib/server/supabase-admin.ts:1)
- [supabase/migrations/20260414090000_restructure_for_dialogs_and_realtime.sql](/Users/alex/Desktop/incubator/incubot/supabase/migrations/20260414090000_restructure_for_dialogs_and_realtime.sql:1)

## 13. Что считать результатом

Результат считается достигнутым, если:

- новое сообщение из Telegram создаёт запись в `messages` с `sender_type = 'client'`
- при отсутствии назначения на диалог бот отвечает автоматически и создаёт запись с `sender_type = 'assistant'`
- при наличии активного `dialog_assignments.is_active = true` бот не отвечает
- база знаний синхронизирована и содержит embeddings в `knowledge_chunks.embedding`
- `npm run typecheck` проходит
- `npm run build` проходит
- `deno check --config deno.json index.ts` проходит из каталога функции
- изменения запушены в `main`
- Vercel получил новый deployment
