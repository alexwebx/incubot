create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email varchar(255) not null,
  full_name varchar(255),
  password_hash text not null,
  role text not null check (role in ('admin', 'manager')),
  is_approved boolean not null default false,
  approved_at timestamp with time zone,
  approved_by uuid references public.admin_users(id) on delete set null,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create unique index if not exists admin_users_email_lower_idx
  on public.admin_users (lower(email));

alter table public.admin_users enable row level security;

drop policy if exists "No direct access to admin_users" on public.admin_users;
create policy "No direct access to admin_users"
on public.admin_users
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "Allow select for all" on public.messages;

insert into public.admin_users (
  email,
  full_name,
  password_hash,
  role,
  is_approved
)
select
  'admin@webx.com',
  'Главный админ',
  'scrypt$13f831207843b2feb7b6088972f4cc45$3a0b22c6cf2e396a2bd1a6777026b06204f16105eb6ca11a6196048bd1c128c2888ccae50f092ebab66d86998cbb64d22e714f1b166ce18a208dde84ffed1c2c',
  'admin',
  true
where not exists (
  select 1 from public.admin_users where lower(email) = lower('admin@webx.com')
);

insert into public.admin_users (
  email,
  full_name,
  password_hash,
  role,
  is_approved
)
select
  'kuzyuberdin@gmail.com',
  'Менеджер',
  'scrypt$c7382928cbda72c1c6f15cf8c8680dac$f7b22bcff5f785a33ae87f0ea7be3465ffa6f185325a617918468677a6d1562ff5319d90bec1fb4d5b72679d5d97f0ea46ff6ef4c5a2ab36fd86280790f2b232',
  'manager',
  false
where not exists (
  select 1 from public.admin_users where lower(email) = lower('kuzyuberdin@gmail.com')
);
