do $$
begin
  alter type public.enquiry_status add value if not exists 'quoted';
  alter type public.enquiry_status add value if not exists 'follow_up_needed';
  alter type public.enquiry_status add value if not exists 'not_interested';
  alter type public.enquiry_status add value if not exists 'invalid_spam';
exception when duplicate_object then null;
end $$;

alter table public.enquiries
  add column if not exists internal_note text,
  add column if not exists follow_up_date date,
  add column if not exists admin_remark text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'enquiries_internal_note_length_check'
  ) then
    alter table public.enquiries
      add constraint enquiries_internal_note_length_check
      check (internal_note is null or length(internal_note) <= 1200);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'enquiries_admin_remark_length_check'
  ) then
    alter table public.enquiries
      add constraint enquiries_admin_remark_length_check
      check (admin_remark is null or length(admin_remark) <= 800);
  end if;
end $$;

alter table public.user_profiles
  add column if not exists role public.app_role not null default 'staff';

alter table public.enquiries enable row level security;
alter table public.user_profiles enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where auth_user_id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "Users can view own profile" on public.user_profiles;
create policy "Users can view own profile"
  on public.user_profiles
  for select
  to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists "Admin users can view enquiries" on public.enquiries;
create policy "Admin users can view enquiries"
  on public.enquiries
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admin users can update enquiry follow-up fields" on public.enquiries;
create policy "Admin users can update enquiry follow-up fields"
  on public.enquiries
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke select, update, delete on public.enquiries from anon;
revoke select, update, delete on public.enquiries from authenticated;
grant select on public.enquiries to authenticated;
grant update (
  status,
  internal_note,
  follow_up_date,
  package_interest,
  admin_remark,
  updated_at
) on public.enquiries to authenticated;
grant select (auth_user_id, display_name, role) on public.user_profiles to authenticated;

create or replace function public.log_enquiry_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    insert into public.audit_logs (actor_type, actor_id, action, entity_type, entity_id, safe_details)
    values (
      'admin',
      auth.uid(),
      'enquiry_status_changed',
      'enquiry',
      new.id,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;

  if old.internal_note is distinct from new.internal_note then
    insert into public.audit_logs (actor_type, actor_id, action, entity_type, entity_id, safe_details)
    values (
      'admin',
      auth.uid(),
      'enquiry_internal_note_updated',
      'enquiry',
      new.id,
      jsonb_build_object('updated', true)
    );
  end if;

  if old.follow_up_date is distinct from new.follow_up_date then
    insert into public.audit_logs (actor_type, actor_id, action, entity_type, entity_id, safe_details)
    values (
      'admin',
      auth.uid(),
      'enquiry_follow_up_date_updated',
      'enquiry',
      new.id,
      jsonb_build_object('from', old.follow_up_date, 'to', new.follow_up_date)
    );
  end if;

  if old.package_interest is distinct from new.package_interest then
    insert into public.audit_logs (actor_type, actor_id, action, entity_type, entity_id, safe_details)
    values (
      'admin',
      auth.uid(),
      'enquiry_package_interest_updated',
      'enquiry',
      new.id,
      jsonb_build_object('from', old.package_interest, 'to', new.package_interest)
    );
  end if;

  if old.admin_remark is distinct from new.admin_remark then
    insert into public.audit_logs (actor_type, actor_id, action, entity_type, entity_id, safe_details)
    values (
      'admin',
      auth.uid(),
      'enquiry_admin_remark_updated',
      'enquiry',
      new.id,
      jsonb_build_object('updated', true)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists enquiries_admin_audit on public.enquiries;
create trigger enquiries_admin_audit
  after update of status, internal_note, follow_up_date, package_interest, admin_remark
  on public.enquiries
  for each row
  execute function public.log_enquiry_admin_change();
