begin;

create extension if not exists "pgcrypto";

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'messages'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'telegram_chat_id'
  )
  and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'messages_legacy'
  ) then
    alter table public.messages rename to messages_legacy;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'admin_users'
  )
  and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'admin_users_legacy'
  ) then
    alter table public.admin_users rename to admin_users_legacy;
  end if;
end
$$;

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create table if not exists public.auth_users (
  id uuid primary key default gen_random_uuid(),
  email varchar(255) not null,
  password_hash text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create unique index if not exists auth_users_email_lower_idx
  on public.auth_users (lower(email));

create table if not exists public.managers (
  user_id uuid primary key references public.auth_users(id) on delete cascade,
  full_name varchar(255),
  role text not null,
  is_approved boolean not null default false,
  approved_at timestamp with time zone,
  approved_by uuid,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint managers_role_check check (role in ('admin', 'manager'))
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint,
  telegram_chat_id text not null,
  username varchar(255),
  first_name varchar(255),
  last_name varchar(255),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create unique index if not exists clients_telegram_chat_id_idx
  on public.clients (telegram_chat_id);

create unique index if not exists clients_telegram_user_id_idx
  on public.clients (telegram_user_id)
  where telegram_user_id is not null;

create table if not exists public.dialogs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  status text not null default 'open',
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  closed_at timestamp with time zone,
  constraint dialogs_status_check check (status in ('open', 'closed'))
);

create unique index if not exists dialogs_one_open_per_client_idx
  on public.dialogs (client_id)
  where status = 'open';

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  dialog_id uuid not null references public.dialogs(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  manager_id uuid references public.managers(user_id) on delete set null,
  sender_type text not null,
  text text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint messages_sender_type_check check (sender_type in ('client', 'manager')),
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
);

create index if not exists messages_dialog_created_at_idx
  on public.messages (dialog_id, created_at);

create table if not exists public.dialog_assignments (
  id uuid primary key default gen_random_uuid(),
  dialog_id uuid not null references public.dialogs(id) on delete cascade,
  manager_id uuid not null references public.managers(user_id) on delete cascade,
  assigned_by uuid references public.managers(user_id) on delete set null,
  assigned_at timestamp with time zone not null default timezone('utc'::text, now()),
  unassigned_at timestamp with time zone,
  is_active boolean not null default true,
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create unique index if not exists dialog_assignments_one_active_per_dialog_idx
  on public.dialog_assignments (dialog_id)
  where is_active = true;

create index if not exists dialog_assignments_manager_id_idx
  on public.dialog_assignments (manager_id);

create table if not exists public.realtime_events (
  id bigint generated by default as identity primary key,
  entity_type text not null,
  entity_id uuid,
  dialog_id uuid,
  action text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint realtime_events_entity_type_check check (
    entity_type in ('dialog', 'message', 'dialog_assignment')
  ),
  constraint realtime_events_action_check check (
    action in ('insert', 'update', 'delete')
  )
);

create index if not exists realtime_events_created_at_idx
  on public.realtime_events (created_at desc);

drop trigger if exists set_auth_users_updated_at on public.auth_users;
create trigger set_auth_users_updated_at
before update on public.auth_users
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_managers_updated_at on public.managers;
create trigger set_managers_updated_at
before update on public.managers
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_clients_updated_at on public.clients;
create trigger set_clients_updated_at
before update on public.clients
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_dialogs_updated_at on public.dialogs;
create trigger set_dialogs_updated_at
before update on public.dialogs
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_dialog_assignments_updated_at on public.dialog_assignments;
create trigger set_dialog_assignments_updated_at
before update on public.dialog_assignments
for each row
execute function public.set_current_timestamp_updated_at();

create or replace function public.enqueue_realtime_event()
returns trigger
language plpgsql
as $$
declare
  payload_entity_id uuid;
  payload_dialog_id uuid;
begin
  if tg_table_name = 'messages' then
    if tg_op = 'DELETE' then
      payload_entity_id = old.id;
      payload_dialog_id = old.dialog_id;
    else
      payload_entity_id = new.id;
      payload_dialog_id = new.dialog_id;
    end if;
  elsif tg_table_name = 'dialogs' then
    if tg_op = 'DELETE' then
      payload_entity_id = old.id;
      payload_dialog_id = old.id;
    else
      payload_entity_id = new.id;
      payload_dialog_id = new.id;
    end if;
  elsif tg_table_name = 'dialog_assignments' then
    if tg_op = 'DELETE' then
      payload_entity_id = old.id;
      payload_dialog_id = old.dialog_id;
    else
      payload_entity_id = new.id;
      payload_dialog_id = new.dialog_id;
    end if;
  else
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  insert into public.realtime_events (entity_type, entity_id, dialog_id, action)
  values (
    case
      when tg_table_name = 'dialogs' then 'dialog'
      when tg_table_name = 'messages' then 'message'
      when tg_table_name = 'dialog_assignments' then 'dialog_assignment'
      else tg_table_name
    end,
    payload_entity_id,
    payload_dialog_id,
    lower(tg_op)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists dialogs_realtime_event_trigger on public.dialogs;
create trigger dialogs_realtime_event_trigger
after insert or update or delete on public.dialogs
for each row
execute function public.enqueue_realtime_event();

drop trigger if exists messages_realtime_event_trigger on public.messages;
create trigger messages_realtime_event_trigger
after insert or update or delete on public.messages
for each row
execute function public.enqueue_realtime_event();

drop trigger if exists dialog_assignments_realtime_event_trigger on public.dialog_assignments;
create trigger dialog_assignments_realtime_event_trigger
after insert or update or delete on public.dialog_assignments
for each row
execute function public.enqueue_realtime_event();

insert into public.auth_users (
  id,
  email,
  password_hash,
  created_at,
  updated_at
)
select
  legacy.id,
  lower(trim(legacy.email)),
  legacy.password_hash,
  coalesce(legacy.created_at, timezone('utc'::text, now())),
  coalesce(legacy.updated_at, coalesce(legacy.created_at, timezone('utc'::text, now())))
from public.admin_users_legacy legacy
on conflict (id) do update
set
  email = excluded.email,
  password_hash = excluded.password_hash,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

insert into public.managers (
  user_id,
  full_name,
  role,
  is_approved,
  approved_at,
  approved_by,
  last_login_at,
  created_at,
  updated_at
)
select
  legacy.id,
  legacy.full_name,
  legacy.role,
  legacy.is_approved,
  legacy.approved_at,
  legacy.approved_by,
  legacy.last_login_at,
  coalesce(legacy.created_at, timezone('utc'::text, now())),
  coalesce(legacy.updated_at, coalesce(legacy.created_at, timezone('utc'::text, now())))
from public.admin_users_legacy legacy
on conflict (user_id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_approved = excluded.is_approved,
  approved_at = excluded.approved_at,
  approved_by = excluded.approved_by,
  last_login_at = excluded.last_login_at,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'managers'
      and constraint_name = 'managers_approved_by_fkey'
  ) then
    alter table public.managers
      add constraint managers_approved_by_fkey
      foreign key (approved_by)
      references public.managers(user_id)
      on delete set null;
  end if;
end
$$;

with legacy_chat_stats as (
  select
    telegram_chat_id,
    min(created_at) as first_message_at,
    max(created_at) as last_message_at
  from public.messages_legacy
  group by telegram_chat_id
),
legacy_chat_profiles as (
  select distinct on (telegram_chat_id)
    telegram_chat_id,
    username,
    first_name,
    last_name
  from public.messages_legacy
  order by telegram_chat_id, created_at desc, id desc
)
insert into public.clients (
  telegram_chat_id,
  username,
  first_name,
  last_name,
  created_at,
  updated_at
)
select
  stats.telegram_chat_id,
  profiles.username,
  profiles.first_name,
  profiles.last_name,
  coalesce(stats.first_message_at, timezone('utc'::text, now())),
  coalesce(stats.last_message_at, coalesce(stats.first_message_at, timezone('utc'::text, now())))
from legacy_chat_stats stats
left join legacy_chat_profiles profiles
  on profiles.telegram_chat_id = stats.telegram_chat_id
on conflict (telegram_chat_id) do update
set
  username = excluded.username,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  updated_at = excluded.updated_at;

insert into public.dialogs (
  client_id,
  status,
  created_at,
  updated_at,
  closed_at
)
select
  clients.id,
  'open',
  min(legacy.created_at),
  max(legacy.created_at),
  null
from public.clients clients
join public.messages_legacy legacy
  on legacy.telegram_chat_id = clients.telegram_chat_id
group by clients.id
on conflict do nothing;

insert into public.messages (
  id,
  dialog_id,
  client_id,
  manager_id,
  sender_type,
  text,
  created_at
)
select
  legacy.id,
  dialogs.id,
  case
    when legacy.direction = 'incoming' then clients.id
    else null
  end,
  case
    when legacy.direction = 'outgoing' then (
      select coalesce(
        (
          select managers.user_id
          from public.managers managers
          where managers.role = 'admin'
          order by managers.created_at asc
          limit 1
        ),
        (
          select managers.user_id
          from public.managers managers
          order by managers.created_at asc
          limit 1
        )
      )
    )
    else null
  end,
  case
    when legacy.direction = 'outgoing' then 'manager'
    else 'client'
  end,
  coalesce(legacy.text, ''),
  legacy.created_at
from public.messages_legacy legacy
join public.clients clients
  on clients.telegram_chat_id = legacy.telegram_chat_id
join public.dialogs dialogs
  on dialogs.client_id = clients.id
  and dialogs.status = 'open'
on conflict (id) do nothing;

alter table public.auth_users enable row level security;
alter table public.managers enable row level security;
alter table public.clients enable row level security;
alter table public.dialogs enable row level security;
alter table public.messages enable row level security;
alter table public.dialog_assignments enable row level security;
alter table public.realtime_events enable row level security;

drop policy if exists "No direct access to auth_users" on public.auth_users;
create policy "No direct access to auth_users"
on public.auth_users
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No direct access to managers" on public.managers;
create policy "No direct access to managers"
on public.managers
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No direct access to clients" on public.clients;
create policy "No direct access to clients"
on public.clients
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No direct access to dialogs" on public.dialogs;
create policy "No direct access to dialogs"
on public.dialogs
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No direct access to messages" on public.messages;
create policy "No direct access to messages"
on public.messages
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No direct access to dialog_assignments" on public.dialog_assignments;
create policy "No direct access to dialog_assignments"
on public.dialog_assignments
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "Allow realtime subscription reads" on public.realtime_events;
create policy "Allow realtime subscription reads"
on public.realtime_events
for select
to anon, authenticated
using (true);

drop policy if exists "No direct writes to realtime_events" on public.realtime_events;
create policy "No direct writes to realtime_events"
on public.realtime_events
for all
to anon, authenticated
using (false)
with check (false);

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  )
  and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'realtime_events'
  ) then
    alter publication supabase_realtime add table public.realtime_events;
  end if;
end
$$;

commit;
