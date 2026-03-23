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
