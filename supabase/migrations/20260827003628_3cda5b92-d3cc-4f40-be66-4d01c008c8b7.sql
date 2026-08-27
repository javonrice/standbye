create table public.airports (
  iata text primary key,
  icao text,
  name text not null,
  city text,
  state text,
  tz text not null,
  lat numeric not null,
  lon numeric not null
);
grant all on public.airports to service_role;
alter table public.airports enable row level security;

create table public.curated_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  state text,
  lat numeric,
  lon numeric,
  venue text,
  starts_on date not null,
  ends_on date not null,
  demand_class text not null check (demand_class in ('major','moderate')),
  source text not null default 'curated',
  source_ref text,
  created_at timestamptz not null default now()
);
create index curated_events_place_dates on public.curated_events (state, city, starts_on, ends_on);
grant all on public.curated_events to service_role;
alter table public.curated_events enable row level security;

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  device_id text,
  marketing_carrier text not null default 'UA',
  flight_number text not null,
  flight_label text not null,
  travel_date date not null,
  origin_iata text not null references public.airports(iata),
  dest_iata text not null references public.airports(iata),
  sched_dep_utc timestamptz,
  sched_arr_utc timestamptz,
  dep_window_start timestamptz not null,
  dep_window_end timestamptz not null,
  arr_window_end timestamptz not null,
  flight_provider text not null default 'manual',
  provider_ref jsonb not null default '{}',
  share_token text unique not null default encode(gen_random_bytes(9), 'hex'),
  created_at timestamptz not null default now()
);
create index trips_device on public.trips (device_id, created_at desc);
grant all on public.trips to service_role;
alter table public.trips enable row level security;

create table public.briefings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  status text not null check (status in ('clear','watch','elevated','active_disruption','incomplete')),
  pressure_index smallint check (pressure_index between 0 and 100),
  headline text not null,
  why_summary text,
  dep_card_status text not null default 'incomplete' check (dep_card_status in ('clear','watch','elevated','active_disruption','incomplete')),
  arr_card_status text not null default 'incomplete' check (arr_card_status in ('clear','watch','elevated','active_disruption','incomplete')),
  chain_card_status text not null default 'incomplete',
  generated_at timestamptz not null default now(),
  source_freshness jsonb not null default '{}',
  unavailable_categories text[] not null default '{}'
);
create index briefings_trip on public.briefings (trip_id, generated_at desc);
grant all on public.briefings to service_role;
alter table public.briefings enable row level security;

create table public.signals (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references public.briefings(id) on delete cascade,
  location text not null check (location in ('departure','arrival','flight_chain')),
  category text not null,
  confidence text not null check (confidence in ('confirmed','strong','context')),
  severity smallint not null check (severity between 0 and 100),
  title text not null,
  summary text not null,
  why_it_matters text not null,
  evidence jsonb not null default '{}',
  source text not null,
  source_url text,
  retrieved_at timestamptz not null,
  active_from timestamptz,
  active_until timestamptz,
  fingerprint text not null,
  unique (briefing_id, fingerprint)
);
create index signals_briefing on public.signals (briefing_id);
grant all on public.signals to service_role;
alter table public.signals enable row level security;

create table public.watches (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid,
  device_id text,
  email text,
  email_verified boolean not null default false,
  state text not null default 'active' check (state in ('active','paused','ended')),
  next_check_at timestamptz,
  last_checked_at timestamptz,
  last_briefing_id uuid references public.briefings(id),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (trip_id, device_id)
);
create index watches_due on public.watches (state, next_check_at);
grant all on public.watches to service_role;
alter table public.watches enable row level security;

create table public.change_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  briefing_id uuid references public.briefings(id) on delete set null,
  occurred_at timestamptz not null default now(),
  change_type text not null,
  headline text not null,
  detail text,
  payload jsonb not null default '{}',
  seen boolean not null default false
);
create index change_events_trip on public.change_events (trip_id, occurred_at desc);
grant all on public.change_events to service_role;
alter table public.change_events enable row level security;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.watches(id) on delete cascade,
  fingerprint text not null,
  subject text not null,
  sent_at timestamptz,
  unique (watch_id, fingerprint)
);
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;

create table public.source_cache (
  cache_key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index source_cache_expires on public.source_cache (expires_at);
grant all on public.source_cache to service_role;
alter table public.source_cache enable row level security;