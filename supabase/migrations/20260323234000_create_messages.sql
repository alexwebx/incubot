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
