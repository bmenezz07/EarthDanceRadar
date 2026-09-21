create extension if not exists pgcrypto with schema extensions;

create table if not exists public.radar_participants (
  device_id uuid primary key,
  device_secret_hash text not null,
  event_code text not null default 'earthdance-rs-2026',
  name text not null check (char_length(name) between 1 and 40),
  ip_hint text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  accuracy double precision check (accuracy is null or accuracy between 0 and 10000),
  heading double precision,
  tent_lat double precision check (tent_lat between -90 and 90),
  tent_lng double precision check (tent_lng between -180 and 180),
  tent_accuracy double precision,
  tent_saved_at timestamptz,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists radar_participants_event_seen_idx on public.radar_participants (event_code, last_seen desc);
alter table public.radar_participants enable row level security;
revoke all on public.radar_participants from anon, authenticated;
grant select on public.radar_participants to anon, authenticated;

drop policy if exists "active event participants are visible" on public.radar_participants;
create policy "active event participants are visible" on public.radar_participants
for select to anon, authenticated using (last_seen > now() - interval '24 hours');

create or replace function public.radar_sync(
  p_device_id uuid, p_device_secret text, p_name text,
  p_event_code text default 'earthdance-rs-2026', p_ip_hint text default null,
  p_lat double precision default null, p_lng double precision default null,
  p_accuracy double precision default null, p_heading double precision default null,
  p_set_tent boolean default false, p_tent_lat double precision default null,
  p_tent_lng double precision default null, p_tent_accuracy double precision default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  existing_hash text;
  clean_name text := left(coalesce(nullif(trim(p_name), ''), 'Rave Explorer'), 40);
  clean_event text := left(coalesce(nullif(trim(p_event_code), ''), 'earthdance-rs-2026'), 64);
  result jsonb;
begin
  if p_device_secret is null or char_length(p_device_secret) < 20 then raise exception 'invalid device secret'; end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then raise exception 'invalid latitude'; end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then raise exception 'invalid longitude'; end if;

  select device_secret_hash into existing_hash from public.radar_participants where device_id = p_device_id;
  if existing_hash is not null and existing_hash <> encode(digest(p_device_secret, 'sha256'), 'hex') then
    raise exception 'device verification failed';
  end if;

  insert into public.radar_participants (
    device_id, device_secret_hash, event_code, name, ip_hint, lat, lng, accuracy, heading,
    tent_lat, tent_lng, tent_accuracy, tent_saved_at, last_seen
  ) values (
    p_device_id, encode(digest(p_device_secret, 'sha256'), 'hex'), clean_event, clean_name, left(p_ip_hint, 64),
    p_lat, p_lng, p_accuracy, p_heading,
    case when p_set_tent then p_tent_lat end, case when p_set_tent then p_tent_lng end,
    case when p_set_tent then p_tent_accuracy end, case when p_set_tent then now() end, now()
  ) on conflict (device_id) do update set
    event_code=excluded.event_code, name=excluded.name, ip_hint=coalesce(excluded.ip_hint,radar_participants.ip_hint),
    lat=coalesce(excluded.lat,radar_participants.lat), lng=coalesce(excluded.lng,radar_participants.lng),
    accuracy=coalesce(excluded.accuracy,radar_participants.accuracy), heading=coalesce(excluded.heading,radar_participants.heading),
    tent_lat=case when p_set_tent then p_tent_lat else radar_participants.tent_lat end,
    tent_lng=case when p_set_tent then p_tent_lng else radar_participants.tent_lng end,
    tent_accuracy=case when p_set_tent then p_tent_accuracy else radar_participants.tent_accuracy end,
    tent_saved_at=case when p_set_tent then now() else radar_participants.tent_saved_at end,
    last_seen=now();

  select jsonb_build_object(
    'me', jsonb_build_object('id',me.device_id,'name',me.name,'lat',me.lat,'lng',me.lng,'accuracy',me.accuracy,'heading',me.heading,
      'lastSeen',extract(epoch from me.last_seen)*1000,
      'tent',case when me.tent_lat is null then null else jsonb_build_object('lat',me.tent_lat,'lng',me.tent_lng,'accuracy',me.tent_accuracy,'savedAt',extract(epoch from me.tent_saved_at)*1000) end),
    'friends',coalesce((select jsonb_agg(jsonb_build_object('id',p.device_id,'name',p.name,'lat',p.lat,'lng',p.lng,'accuracy',p.accuracy,'heading',p.heading,
      'lastSeen',extract(epoch from p.last_seen)*1000,
      'tent',case when p.tent_lat is null then null else jsonb_build_object('lat',p.tent_lat,'lng',p.tent_lng,'accuracy',p.tent_accuracy,'savedAt',extract(epoch from p.tent_saved_at)*1000) end) order by p.last_seen desc)
      from public.radar_participants p where p.event_code=clean_event and p.device_id<>p_device_id and p.last_seen>now()-interval '30 minutes' and p.lat is not null and p.lng is not null),'[]'::jsonb)
  ) into result from public.radar_participants me where me.device_id=p_device_id;
  return result;
end;
$$;

revoke all on function public.radar_sync(uuid,text,text,text,text,double precision,double precision,double precision,double precision,boolean,double precision,double precision,double precision) from public;
grant execute on function public.radar_sync(uuid,text,text,text,text,double precision,double precision,double precision,double precision,boolean,double precision,double precision,double precision) to anon;
