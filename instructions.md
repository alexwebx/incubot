# Incubot Restore Instructions

## 1. Цель

Итог проекта:

- Telegram бот принимает сообщения и отправляет автоответ
- Команда `/start` не записывается в таблицу `messages`
- Supabase хранит сообщения в таблице `public.messages`
- Supabase Edge Function `telegram-webhook` принимает webhook от Telegram
- RLS включен и настроен через policy
- Next.js админка показывает сообщения и имя пользователя

## 2. Структура проекта

```text
incubot/
├── .env.example
├── .env.local
├── .gitignore
├── eslint.config.mjs
├── instructions.md
├── next-env.d.ts
├── next.config.ts
├── package.json
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── lib/
│       └── supabase.ts
├── supabase/
│   ├── config.toml
│   ├── functions/
│   │   ├── .env.example
│   │   └── telegram-webhook/
│   │       ├── deno.json
│   │       └── index.ts
│   ├── migrations/
│   │   ├── 20260323234000_create_messages.sql
│   │   └── 20260323234100_enable_rls_and_policies.sql
│   │   └── 20260323235500_alter_messages_add_names_and_varchar.sql
│   └── seed.sql
└── tsconfig.json
```

## 3. Команды восстановления с нуля

### 3.1. Подготовка

```bash
brew install supabase/tap/supabase
brew install cloudflared
curl -fsSL https://deno.land/install.sh | sh
git init
supabase login
supabase init
supabase link --project-ref mxobymjsqoprdudiiayk
npm install
```

### 3.2. ENV для Next.js

Создать `.env.local`:

```env
TELEGRAM_BOT_TOKEN=replace_with_telegram_bot_token
NEXT_PUBLIC_SUPABASE_URL=https://mxobymjsqoprdudiiayk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace_with_supabase_anon_key
```

### 3.3. ENV для локального запуска Edge Function

```bash
cp supabase/functions/.env.example supabase/functions/.env
```

Заполнить `supabase/functions/.env`:

```env
SUPABASE_URL=https://mxobymjsqoprdudiiayk.supabase.co
SUPABASE_ANON_KEY=replace_with_supabase_anon_key
TELEGRAM_BOT_TOKEN=replace_with_telegram_bot_token
```

### 3.4. Применение миграций

```bash
supabase db push
```

### 3.5. Локальный запуск приложения

Терминал 1:

```bash
npm run dev
```

Терминал 2:

```bash
supabase functions serve telegram-webhook --no-verify-jwt --env-file supabase/functions/.env
```

Терминал 3, новый tunnel для локального webhook:

```bash
cloudflared tunnel --url http://localhost:54321/functions/v1
```

Webhook URL для tunnel из команды выше:

```text
https://<cloudflare-subdomain>.trycloudflare.com/telegram-webhook
```

Если используется уже созданный tunnel:

```text
https://ceo-supposed-labs-transmit.trycloudflare.com/telegram-webhook
```

### 3.6. Деплой Edge Function

```bash
supabase functions deploy telegram-webhook --no-verify-jwt
```

Продакшен URL функции:

```text
https://mxobymjsqoprdudiiayk.functions.supabase.co/telegram-webhook
```

### 3.7. Установка webhook Telegram

Для Cloudflare tunnel:

```bash
curl https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook \
  -d "url=https://ceo-supposed-labs-transmit.trycloudflare.com/telegram-webhook"
```

Для продакшена Supabase Functions:

```bash
curl https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook \
  -d "url=https://mxobymjsqoprdudiiayk.functions.supabase.co/telegram-webhook"
```

Проверка webhook:

```bash
curl https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo
```

### 3.8. Деплой админки на Vercel

Что нужно:

- репозиторий с этим проектом в GitHub/GitLab/Bitbucket
- проект, импортированный в Vercel
- environment variables в Vercel:
  - `NEXT_PUBLIC_SUPABASE_URL=https://mxobymjsqoprdudiiayk.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>`
- `TELEGRAM_BOT_TOKEN` в Vercel не нужен, потому что webhook работает в Supabase Edge Function

CLI-вариант:

```bash
npm install -g vercel
vercel
vercel --prod
```

Через UI Vercel:

```text
1. Add New Project
2. Import Git Repository
3. Framework Preset: Next.js
4. Root Directory: ./
5. Add Environment Variables:
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
6. Deploy
```

После деплоя:

- открыть production URL Vercel
- убедиться, что админка читает `messages`
- при необходимости привязать custom domain в Vercel

## 4. SQL и миграции

### 4.1. `supabase/migrations/20260323234000_create_messages.sql`

```sql
create extension if not exists "pgcrypto";

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id text not null,
  username varchar(255),
  first_name varchar(255),
  last_name varchar(255),
  text text,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);
```

### 4.3. `supabase/migrations/20260323235500_alter_messages_add_names_and_varchar.sql`

```sql
alter table public.messages
  alter column username type varchar(255),
  add column if not exists first_name varchar(255),
  add column if not exists last_name varchar(255);
```

### 4.2. `supabase/migrations/20260323234100_enable_rls_and_policies.sql`

```sql
alter table public.messages enable row level security;

drop policy if exists "Allow insert for all" on public.messages;
create policy "Allow insert for all"
on public.messages
for insert
to anon, authenticated
with check (true);

drop policy if exists "Allow select for all" on public.messages;
create policy "Allow select for all"
on public.messages
for select
to anon, authenticated
using (true);
```

## 5. Все файлы проекта

### 5.1. `.env.example`

```env
TELEGRAM_BOT_TOKEN=replace_with_telegram_bot_token
NEXT_PUBLIC_SUPABASE_URL=https://mxobymjsqoprdudiiayk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace_with_supabase_anon_key
```

### 5.2. `.gitignore`

```gitignore
.idea

.env
.env.local
.env.*.local
supabase/functions/.env

supabase/.temp/

node_modules/
.next/
out/
coverage/

.DS_Store
```

### 5.3. `package.json`

```json
{
  "name": "incubot",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@supabase/supabase-js": "2.49.4",
    "next": "15.2.8",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  },
  "devDependencies": {
    "@types/node": "22.13.10",
    "@types/react": "19.0.10",
    "@types/react-dom": "19.0.4",
    "eslint": "8.57.1",
    "eslint-config-next": "15.2.8",
    "typescript": "5.8.2"
  }
}
```

### 5.4. `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "supabase/functions/**/*"]
}
```

### 5.5. `next.config.ts`

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
```

### 5.6. `next-env.d.ts`

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// This file is auto-generated by Next.js.
```

### 5.7. `eslint.config.mjs`

```js
import nextPlugin from "eslint-config-next";

export default [
  ...nextPlugin,
  {
    ignores: [".next/**", "node_modules/**"],
  },
];
```

### 5.8. `src/lib/supabase.ts`

```ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
}

if (!supabaseAnonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is required");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
```

### 5.9. `src/app/layout.tsx`

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Incubot Admin",
  description: "Telegram message monitor backed by Supabase",
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
```

### 5.10. `src/app/page.tsx`

```tsx
import { supabase } from "@/lib/supabase";

type Message = {
  id: string;
  telegram_chat_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  text: string | null;
  created_at: string;
};

export const dynamic = "force-dynamic";

async function getMessages(): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, telegram_chat_id, username, first_name, last_name, text, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export default async function HomePage() {
  const messages = await getMessages();

  return (
    <main className="page">
      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Incubot</p>
            <h1>Telegram Messages</h1>
          </div>
          <p className="counter">{messages.length} records</p>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>telegram_chat_id</th>
                <th>username</th>
                <th>first_name</th>
                <th>last_name</th>
                <th>text</th>
                <th>created_at</th>
              </tr>
            </thead>
            <tbody>
              {messages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    No messages yet
                  </td>
                </tr>
              ) : (
                messages.map((message) => (
                  <tr key={message.id}>
                    <td>{message.telegram_chat_id}</td>
                    <td>{message.username || "-"}</td>
                    <td>{message.first_name || "-"}</td>
                    <td>{message.last_name || "-"}</td>
                    <td>{message.text || "-"}</td>
                    <td>{new Date(message.created_at).toLocaleString("ru-RU")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
```

### 5.11. `src/app/globals.css`

```css
:root {
  color-scheme: light;
  --bg: #f3efe6;
  --panel: rgba(255, 252, 246, 0.92);
  --border: rgba(48, 36, 24, 0.12);
  --text: #1c140d;
  --muted: #6d5c4a;
  --accent: #b95c1e;
  --shadow: 0 24px 80px rgba(78, 52, 27, 0.14);
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-height: 100%;
  background:
    radial-gradient(circle at top left, rgba(255, 208, 163, 0.9), transparent 30%),
    linear-gradient(135deg, #f5e7d0 0%, #efe9df 46%, #d7e3df 100%);
  color: var(--text);
  font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
}

body {
  min-height: 100vh;
}

table {
  width: 100%;
  border-collapse: collapse;
}

.page {
  padding: 48px 20px;
}

.panel {
  max-width: 1200px;
  margin: 0 auto;
  padding: 28px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 28px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(16px);
}

.panelHeader {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  margin-bottom: 24px;
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 12px;
  font-weight: 700;
}

h1 {
  margin: 0;
  font-size: clamp(2rem, 5vw, 4rem);
  line-height: 0.95;
}

.counter {
  margin: 0;
  white-space: nowrap;
  color: var(--muted);
  font-size: 14px;
}

.tableWrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 20px;
}

th,
td {
  padding: 16px 18px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--border);
}

th {
  background: rgba(185, 92, 30, 0.08);
  font-size: 13px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

tbody tr:last-child td {
  border-bottom: 0;
}

.empty {
  text-align: center;
  color: var(--muted);
}

@media (max-width: 768px) {
  .page {
    padding: 24px 12px;
  }

  .panel {
    padding: 18px;
    border-radius: 20px;
  }

  .panelHeader {
    flex-direction: column;
  }

  th,
  td {
    padding: 14px 12px;
  }
}
```

### 5.12. `supabase/functions/.env.example`

```env
SUPABASE_URL=https://mxobymjsqoprdudiiayk.supabase.co
SUPABASE_ANON_KEY=replace_with_supabase_anon_key
TELEGRAM_BOT_TOKEN=replace_with_telegram_bot_token
```

### 5.13. `supabase/functions/telegram-webhook/deno.json`

```json
{
  "imports": {
    "@supabase/functions-js": "jsr:@supabase/functions-js@^2",
    "@supabase/supabase-js": "jsr:@supabase/supabase-js@^2"
  }
}
```

### 5.14. `supabase/functions/telegram-webhook/index.ts`

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
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    text?: string;
    message_id?: number;
  };
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is not set");
}

if (!supabaseAnonKey) {
  throw new Error("SUPABASE_ANON_KEY is not set");
}

if (!telegramBotToken) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

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
  const firstName = update.message?.from?.first_name ?? null;
  const lastName = update.message?.from?.last_name ?? null;
  const username =
    update.message?.from?.username ?? update.message?.chat?.username ?? null;
  const text = update.message?.text ?? null;
  const trimmedText = text?.trim() ?? "";

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

  const isStartCommand = /^\/start(?:@\w+)?(?:\s|$)/i.test(trimmedText);

  if (isStartCommand) {
    try {
      await sendTelegramMessage(
        chatId,
        firstName
          ? `Привет, ${firstName}. Отправь сообщение, и я сохраню его в базу.`
          : "Привет. Отправь сообщение, и я сохраню его в базу.",
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

  const { error } = await supabase.from("messages").insert({
    telegram_chat_id: String(chatId),
    username,
    first_name: firstName,
    last_name: lastName,
    text,
  });

  if (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const replyText = firstName
    ? `Принято, ${firstName}. Сообщение сохранено.`
    : "Принято. Сообщение сохранено.";

  const telegramResponse = await fetch(
    `https://api.telegram.org/bot${telegramBotToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: replyText,
        reply_to_message_id: messageId,
      }),
    },
  );

  if (!telegramResponse.ok) {
    const telegramError = await telegramResponse.text();

    return new Response(
      JSON.stringify({
        ok: false,
        error: `Telegram sendMessage failed: ${telegramError}`,
      }),
      {
        status: 502,
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

### 5.15. `supabase/seed.sql`

```sql
-- Intentionally empty.
```

## 6. Команды проверки

### 6.1. Проверка таблицы и RLS

```bash
supabase db push
```

Проверить в Supabase SQL Editor:

```sql
select * from public.messages order by created_at desc;
```

### 6.2. Тестовый запрос в локальную функцию

```bash
curl -i http://127.0.0.1:54321/functions/v1/telegram-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "chat": { "id": 123456789, "username": "local_test" },
      "from": { "username": "local_test" },
      "text": "hello from curl"
    }
  }'
```

### 6.3. Проверка админки

Открыть:

```text
http://localhost:3000
```

## 7. Чек-лист готовности

- [ ] `npm install` выполнен без ошибок
- [ ] `.env.local` заполнен
- [ ] `supabase/functions/.env` заполнен
- [ ] `supabase db push` применил обе миграции
- [ ] таблица `public.messages` существует
- [ ] RLS включен на `public.messages`
- [ ] policy на `INSERT` создана
- [ ] policy на `SELECT` создана
- [ ] `supabase functions deploy telegram-webhook --no-verify-jwt` выполнен
- [ ] webhook Telegram установлен
- [ ] бот принимает сообщения
- [ ] бот отправляет автоответ
- [ ] команда `/start` не записывается в БД
- [ ] сообщения записываются в БД
- [ ] админка показывает `telegram_chat_id`, `username`, `first_name`, `last_name`, `text`, `created_at`
- [ ] админка задеплоена на Vercel

## 8. Команды рабочего цикла

```bash
npm install
npm run dev
supabase db push
supabase functions serve telegram-webhook --no-verify-jwt --env-file supabase/functions/.env
supabase functions deploy telegram-webhook --no-verify-jwt
curl https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook -d "url=https://mxobymjsqoprdudiiayk.functions.supabase.co/telegram-webhook"
```
