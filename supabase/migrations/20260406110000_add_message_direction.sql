alter table public.messages
  add column if not exists direction text not null default 'incoming';

update public.messages
set direction = 'incoming'
where direction is null;

alter table public.messages
  drop constraint if exists messages_direction_check;

alter table public.messages
  add constraint messages_direction_check
  check (direction in ('incoming', 'outgoing'));
