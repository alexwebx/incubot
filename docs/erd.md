# Incubot ERD

Файл диаграммы: [erd.puml](/Users/alex/Desktop/incubator/incubot/docs/erd.puml:1)

## Что отражает схема

Это не абстрактная target-схема, а фактическая структура проекта после миграции от `2026-04-14`.

Сейчас в проекте:
- авторизация отделена от профиля менеджера
- Telegram-клиенты вынесены в отдельную таблицу
- сообщения живут внутри диалогов
- назначение менеджера хранится на уровне диалога
- обновление UI работает через realtime invalidation table
- старые таблицы сохранены как backup

## Основные таблицы

### `auth_users`

Хранит только данные авторизации:
- `id`
- `email`
- `password_hash`
- `created_at`
- `updated_at`

Источник истины для логина и пароля только здесь.

### `managers`

Хранит профиль внутреннего пользователя:
- `user_id`
- `full_name`
- `role`
- `is_approved`
- `approved_at`
- `approved_by`
- `last_login_at`
- `created_at`
- `updated_at`

Особенности:
- `user_id -> auth_users.id`
- `approved_by -> managers.user_id`
- роли ограничены `admin | manager`

### `clients`

Хранит Telegram-профиль клиента:
- `id`
- `telegram_user_id`
- `telegram_chat_id`
- `username`
- `first_name`
- `last_name`
- `created_at`
- `updated_at`

Особенности:
- `telegram_chat_id` уникален
- `telegram_user_id` уникален, если не `null`

### `dialogs`

Контейнер для переписки:
- `id`
- `client_id`
- `status`
- `created_at`
- `updated_at`
- `closed_at`

Особенности:
- `client_id -> clients.id`
- статус ограничен `open | closed`
- в текущей модели допускается только один открытый диалог на клиента

### `messages`

Хранит сообщения внутри диалога:
- `id`
- `dialog_id`
- `client_id`
- `manager_id`
- `sender_type`
- `text`
- `created_at`

Особенности:
- `dialog_id -> dialogs.id`
- `client_id -> clients.id`
- `manager_id -> managers.user_id`
- `sender_type` ограничен `client | manager`
- если `sender_type = client`, заполнен только `client_id`
- если `sender_type = manager`, заполнен только `manager_id`

### `dialog_assignments`

История назначений менеджеров на диалог:
- `id`
- `dialog_id`
- `manager_id`
- `assigned_by`
- `assigned_at`
- `unassigned_at`
- `is_active`
- `updated_at`

Особенности:
- `dialog_id -> dialogs.id`
- `manager_id -> managers.user_id`
- `assigned_by -> managers.user_id`
- на один диалог допускается только одно активное назначение

### `realtime_events`

Техническая таблица для realtime:
- `id`
- `entity_type`
- `entity_id`
- `dialog_id`
- `action`
- `created_at`

Назначение:
- не хранит бизнес-данные
- используется как безопасный websocket-сигнал
- клиент подписывается на новые записи и после этого забирает актуальный inbox через серверный API

Это решение позволило:
- убрать кнопку `Обновить`
- не открывать прямой realtime-доступ к `dialogs/messages`
- сохранить строгий RLS на основных бизнес-таблицах

## Legacy-таблицы

После миграции старые таблицы не удаляются:
- `admin_users_legacy`
- `messages_legacy`

Они нужны как backup текущих данных и как страховка на случай ручной проверки переноса.

## Цепочка данных

### 1. Логин

- приложение проверяет `auth_users.email`
- пароль сверяется по `password_hash`
- профиль и роль читаются из `managers`
- для менеджера дополнительно проверяется `is_approved`

### 2. Входящее сообщение из Telegram

- webhook получает update
- по `telegram_chat_id` ищется или обновляется `clients`
- для клиента ищется открытый `dialogs`
- если открытого нет, он создаётся
- входящее сообщение пишется в `messages` с:
- `sender_type = 'client'`
- `client_id != null`
- `manager_id = null`

### 3. Назначение диалога

- admin может назначить:
- себя
- любого согласованного менеджера
- manager может назначить:
- только себя
- старая активная запись в `dialog_assignments` закрывается
- новая создаётся с `is_active = true`

### 4. Исходящее сообщение менеджера

- UI вызывает серверный route по `dialog_id`
- сервер проверяет доступ к диалогу
- admin может писать в любой диалог
- manager может писать только в диалог, назначенный на него
- после успешной отправки в Telegram запись сохраняется в `messages` с:
- `sender_type = 'manager'`
- `manager_id != null`
- `client_id = null`

### 5. Автообновление интерфейса

- триггеры на `dialogs`, `messages`, `dialog_assignments` пишут событие в `realtime_events`
- фронт подписан на вставки в `realtime_events`
- при новом событии фронт заново запрашивает inbox через `/api/inbox`

## Почему назначение перенесено с клиента на диалог

Это ключевое изменение.

Если закреплять менеджера за клиентом:
- нельзя нормально разделить старые и новые обращения
- один и тот же клиент не сможет вести разные кейсы
- сложнее строить историю ответственности

Если закреплять менеджера за диалогом:
- один клиент может иметь несколько обращений
- у каждого обращения свой ответственный
- история смены ответственного хранится отдельно и прозрачно

## Что важно помнить о миграции

- исходные данные сохранены в legacy-таблицах
- `messages_legacy` были перенесены в новую `messages`
- legacy `outgoing` сообщения в новой схеме привязаны к дефолтному администратору, потому что старая модель не хранила автора исходящего сообщения

Это осознанный компромисс:
- данные не потеряны
- новая схема остаётся строгой
- история хотя бы не остаётся без автора

## Что можно развивать дальше

Следующие логичные сущности:
- `message_attachments`
- `message_deliveries`
- `dialog_tags`
- `client_notes`
- `audit_logs`

Но для текущего этапа ядро схемы уже нормализовано и готово к развитию проекта.
