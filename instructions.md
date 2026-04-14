# Incubot Restore Instructions

## 1. Цель

Текущее состояние проекта:

- Telegram webhook на Supabase Edge Functions принимает входящие сообщения
- клиенты хранятся отдельно от менеджеров
- переписка хранится через `clients -> dialogs -> messages`
- назначение менеджера происходит на уровень диалога через `dialog_assignments`
- admin может назначить на диалог себя или любого согласованного менеджера
- manager может назначить на диалог только себя
- ручная кнопка `Обновить` удалена
- обновление интерфейса работает автоматически через Supabase Realtime
- RLS включён на всех бизнес-таблицах
- старые таблицы сохранены как backup:
  - `admin_users_legacy`
  - `messages_legacy`

Связанные документы:

- ERD: [docs/erd.puml](/Users/alex/Desktop/incubator/incubot/docs/erd.puml:1)
- описание схемы: [docs/erd.md](/Users/alex/Desktop/incubator/incubot/docs/erd.md:1)

## 2. Структура проекта

```text
incubot/
├── .env.example
├── .env.local
├── docs/
│   ├── erd.md
│   └── erd.puml
├── instructions.md
├── package.json
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
│   │       └── index.ts
│   ├── migrations/
│   │   ├── 20260323234000_create_messages.sql
│   │   ├── 20260323234100_enable_rls_and_policies.sql
│   │   ├── 20260323235500_alter_messages_add_names_and_varchar.sql
│   │   ├── 20260406110000_add_message_direction.sql
│   │   ├── 20260406170000_create_admin_users.sql
│   │   └── 20260414090000_restructure_for_dialogs_and_realtime.sql
│   └── seed.sql
└── tsconfig.json
```

## 3. ENV

### 3.1. Next.js `.env.local`

```env
TELEGRAM_BOT_TOKEN=replace_with_telegram_bot_token
NEXT_PUBLIC_SUPABASE_URL=https://mxobymjsqoprdudiiayk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace_with_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=replace_with_supabase_service_role_key
AUTH_SESSION_SECRET=replace_with_long_random_secret
```

### 3.2. Edge Functions `supabase/functions/.env`

```env
SUPABASE_URL=https://mxobymjsqoprdudiiayk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace_with_supabase_service_role_key
TELEGRAM_BOT_TOKEN=replace_with_telegram_bot_token
```

Важно:

- `SUPABASE_ANON_KEY` больше не используется в Edge Function
- webhook работает через `SUPABASE_SERVICE_ROLE_KEY`, потому что RLS на `clients/dialogs/messages` закрыт
- realtime на фронте использует `NEXT_PUBLIC_SUPABASE_ANON_KEY`, но читает только `realtime_events`

## 4. Команды

### 4.1. Установка

```bash
brew install supabase/tap/supabase
brew install cloudflared
curl -fsSL https://deno.land/install.sh | sh
npm install
```

### 4.2. Привязка проекта

```bash
supabase login
supabase link --project-ref mxobymjsqoprdudiiayk
```

### 4.3. Локальный запуск

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

### 4.4. Применение миграций

```bash
supabase db push --linked --include-all
```

### 4.5. Проверки

```bash
npx tsc --noEmit
npm run build
deno check supabase/functions/telegram-webhook/index.ts
supabase migration list --linked
```

### 4.6. Деплой Edge Function

```bash
supabase functions deploy telegram-webhook --no-verify-jwt
```

### 4.7. Установка webhook

```bash
curl https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook \
  -d "url=https://mxobymjsqoprdudiiayk.functions.supabase.co/telegram-webhook"
```

Проверка:

```bash
curl https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo
```

### 4.8. Git deploy

```bash
git status
git add .
git commit -m "Restructure dialogs schema and realtime inbox"
git push origin main
```

## 5. Миграции

### 5.1. Что делает последняя миграция

Файл: [supabase/migrations/20260414090000_restructure_for_dialogs_and_realtime.sql](/Users/alex/Desktop/incubator/incubot/supabase/migrations/20260414090000_restructure_for_dialogs_and_realtime.sql:1)

Она делает следующее:

1. Переименовывает старые таблицы:
- `messages -> messages_legacy`
- `admin_users -> admin_users_legacy`

2. Создаёт новые таблицы:
- `auth_users`
- `managers`
- `clients`
- `dialogs`
- `messages`
- `dialog_assignments`
- `realtime_events`

3. Создаёт:
- `updated_at` triggers
- realtime trigger function
- индексы
- partial unique indexes
- RLS policies
- realtime publication для `realtime_events`

4. Переносит данные:
- `admin_users_legacy -> auth_users + managers`
- `messages_legacy -> clients + dialogs + messages`

5. Сохраняет legacy backup-таблицы

### 5.2. Ключевые SQL-решения

#### Строгая модель автора сообщения

```sql
constraint messages_sender_integrity_check check (
  (
    sender_type = 'client'
    and client_id is not null
    and manager_id is null
  ) or (
    sender_type = 'manager'
    and manager_id is not null
    and client_id is null
  )
)
```

#### Один открытый диалог на клиента

```sql
create unique index if not exists dialogs_one_open_per_client_idx
  on public.dialogs (client_id)
  where status = 'open';
```

#### Одно активное назначение на диалог

```sql
create unique index if not exists dialog_assignments_one_active_per_dialog_idx
  on public.dialog_assignments (dialog_id)
  where is_active = true;
```

#### RLS на бизнес-таблицах

Пример:

```sql
alter table public.messages enable row level security;

create policy "No direct access to messages"
on public.messages
for all
to anon, authenticated
using (false)
with check (false);
```

#### Realtime без утечки бизнес-данных

```sql
create table if not exists public.realtime_events (
  id bigint generated by default as identity primary key,
  entity_type text not null,
  entity_id uuid,
  dialog_id uuid,
  action text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);
```

И открытый select только на неё:

```sql
create policy "Allow realtime subscription reads"
on public.realtime_events
for select
to anon, authenticated
using (true);
```

## 6. Бизнес-правила

### 6.1. Авторизация

- `auth_users` хранит email и password hash
- `managers` хранит профиль, роль и approval state
- `manager` без `is_approved = true` не пускается в кабинет

### 6.2. Диалоги

- каждый Telegram-клиент хранится в `clients`
- входящее сообщение ищет или создаёт открытый диалог
- сообщения всегда живут внутри `dialogs`

### 6.3. Назначение

- `admin` может назначить на любой диалог:
  - себя
  - любого согласованного менеджера
- `manager` может назначить на диалог только себя
- у диалога может быть только одно активное назначение
- история назначения не теряется

### 6.4. Доступ к диалогам

- `admin` видит все диалоги
- `manager` видит только диалоги, назначенные на него
- `manager` может отправить сообщение только в назначенный на него диалог

## 7. Realtime

### 7.1. Почему не подписка на `messages/dialogs`

Причина:

- фронт не использует Supabase Auth
- приложение авторизуется через собственную cookie-сессию
- открывать прямой realtime на бизнес-таблицы через `anon` было бы лишней утечкой данных

Поэтому используется отдельная таблица `realtime_events`.

### 7.2. Цепочка обновления

1. insert/update/delete в `dialogs/messages/dialog_assignments`
2. trigger пишет запись в `realtime_events`
3. React client подписан на `realtime_events`
4. при новом событии клиент вызывает `/api/inbox`
5. UI обновляется без кнопки `Обновить`

## 8. Deno Edge Function

Файл: [supabase/functions/telegram-webhook/index.ts](/Users/alex/Desktop/incubator/incubot/supabase/functions/telegram-webhook/index.ts:1)

Что делает:

- принимает Telegram update
- игнорирует `/start` как событие для БД
- обновляет или создаёт `clients`
- находит или создаёт открытый `dialogs`
- пишет входящее сообщение в `messages`
- отправляет Telegram reply

Ключевое отличие от старой версии:

- раньше функция писала напрямую в старую `messages`
- теперь функция работает через новую модель `clients/dialogs/messages`
- используется `SUPABASE_SERVICE_ROLE_KEY`

## 9. Основные файлы и код

### 9.1. Серверный auth-слой

Файл: [src/lib/server/auth.ts](/Users/alex/Desktop/incubator/incubot/src/lib/server/auth.ts:1)

Ключевые функции:
- `findUserByEmail`
- `findUserById`
- `loginUser`
- `registerManager`
- `approveManager`
- `setManagerPassword`
- `listManagers`
- `listAssignableUsers`

Смысл:
- auth читается из `auth_users`
- бизнес-профиль читается из `managers`

### 9.2. Серверный inbox/dialogs-слой

Файл: [src/lib/server/dialogs.ts](/Users/alex/Desktop/incubator/incubot/src/lib/server/dialogs.ts:1)

Ключевые функции:
- `loadInboxData`
- `ensureDialogAccess`
- `upsertTelegramClient`
- `findOrCreateOpenDialog`
- `createIncomingMessage`
- `createOutgoingMessage`
- `assignDialog`

### 9.3. Главная страница

Файл: [src/app/page.tsx](/Users/alex/Desktop/incubator/incubot/src/app/page.tsx:1)

Смысл:
- если нет сессии, рендерит `AuthShell`
- если сессия есть, грузит inbox через `loadInboxData`

### 9.4. Inbox UI

Файл: [src/components/inbox.tsx](/Users/alex/Desktop/incubator/incubot/src/components/inbox.tsx:1)

Что важно:
- кнопка `Обновить` удалена
- используется realtime subscription на `realtime_events`
- доступно назначение менеджера на диалог
- отправка ответа идёт через `/api/dialogs/[dialogId]/messages`

### 9.5. API routes

Новые маршруты:

- [src/app/api/inbox/route.ts](/Users/alex/Desktop/incubator/incubot/src/app/api/inbox/route.ts:1)
- [src/app/api/dialogs/[dialogId]/messages/route.ts](/Users/alex/Desktop/incubator/incubot/src/app/api/dialogs/[dialogId]/messages/route.ts:1)
- [src/app/api/dialogs/[dialogId]/assign/route.ts](/Users/alex/Desktop/incubator/incubot/src/app/api/dialogs/[dialogId]/assign/route.ts:1)

Старые маршруты `api/messages` удалены.

## 10. Проверки, выполненные после изменений

### 10.1. Локальная сборка

Успешно выполнено:

```bash
npx tsc --noEmit
npm run build
```

### 10.2. Проверка миграций

Успешно выполнено:

```bash
supabase migration list --linked
```

На linked project присутствует миграция:

```text
20260414090000_restructure_for_dialogs_and_realtime
```

### 10.3. Проверка фактической структуры после миграции

После применения миграции было проверено наличие таблиц и данных.

Фактический результат на remote:

```text
auth_users count=3
managers count=3
clients count=3
dialogs count=3
messages count=9
dialog_assignments count=0
realtime_events count=12
messages_legacy count=9
admin_users_legacy count=3
```

Это означает:

- новая схема создана
- legacy backup сохранён
- данные сообщений перенесены без потерь

## 11. Что ещё нужно сделать после pull на другой машине

1. Заполнить `.env.local`
2. Заполнить `supabase/functions/.env`
3. Проверить `supabase link --project-ref mxobymjsqoprdudiiayk`
4. Выполнить `npm install`
5. Выполнить `npm run build`
6. Выполнить `supabase functions deploy telegram-webhook --no-verify-jwt`
7. Проверить webhook через `getWebhookInfo`

## 12. Важные замечания

- `deno check` в sandbox может падать не из-за кода, а из-за запрета сети на загрузку JSR-зависимостей
- `supabase db dump` через CLI требует Docker daemon; если нужен dump до миграции, Docker Desktop должен быть запущен
- legacy `outgoing` сообщения были переназначены на дефолтного admin-пользователя, потому что старая схема не хранила автора исходящего сообщения

## 13. Итог

Текущее состояние проекта можно разворачивать без дополнительных вопросов:

- схема нормализована
- данные сохранены
- webhook переведён на новую модель
- RLS не пропущен
- realtime работает без кнопки ручного обновления
- ERD и restore-документация обновлены
