alter table public.enquiries
  add column if not exists package_interest text not null default 'not_sure',
  add column if not exists live_tracking_needed text not null default 'not_sure',
  add column if not exists notes text,
  add column if not exists consent_to_contact boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'enquiries_package_interest_check'
  ) then
    alter table public.enquiries
      add constraint enquiries_package_interest_check
      check (package_interest in ('basic', 'standard', 'premium', 'not_sure'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'enquiries_live_tracking_needed_check'
  ) then
    alter table public.enquiries
      add constraint enquiries_live_tracking_needed_check
      check (live_tracking_needed in ('yes', 'no', 'not_sure'));
  end if;
end $$;

alter table public.enquiries enable row level security;

drop policy if exists "Public website can insert enquiries" on public.enquiries;
create policy "Public website can insert enquiries"
  on public.enquiries
  for insert
  to anon
  with check (
    source = 'website'
    and status = 'new'
    and consent_to_contact is true
    and length(trim(customer_name)) > 0
    and length(trim(business_name)) > 0
    and length(trim(phone)) >= 7
    and length(trim(city)) > 0
    and length(trim(required_areas)) > 0
    and preferred_start_date is not null
    and number_of_days > 0
    and length(trim(message)) > 0
  );

grant insert (
  customer_name,
  business_name,
  phone,
  city,
  required_areas,
  preferred_start_date,
  number_of_days,
  source,
  status,
  message,
  package_interest,
  live_tracking_needed,
  notes,
  consent_to_contact
) on public.enquiries to anon;