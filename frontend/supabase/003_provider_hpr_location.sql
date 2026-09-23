-- Add real provider identity + location fields.
-- No provider data is inserted here.

alter table public.provider_profiles
add column if not exists hpr_id text,
add column if not exists city text,
add column if not exists state text,
add column if not exists latitude double precision,
add column if not exists longitude double precision;

-- One HPR ID must not belong to multiple provider profiles.
create unique index if not exists provider_profiles_hpr_id_unique
on public.provider_profiles (lower(hpr_id))
where hpr_id is not null;

-- Faster location search.
create index if not exists provider_profiles_location_idx
on public.provider_profiles (state, city);

-- Faster doctor search.
create index if not exists provider_profiles_doctor_search_idx
on public.provider_profiles
(provider_type, verification_status, state, city);