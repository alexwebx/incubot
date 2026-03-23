alter table public.messages
  alter column username type varchar(255),
  add column if not exists first_name varchar(255),
  add column if not exists last_name varchar(255);
