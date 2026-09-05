-- FreshLink full Supabase schema
-- Paste this entire script into SQL Editor and run once.
-- Safe to re-run: uses IF NOT EXISTS and DROP POLICY IF EXISTS patterns.

create extension if not exists pgcrypto;

-- Keep updated_at in sync across mutable tables.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Auto-create a profile row for each new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();

  return new;
end;
$$;

-- SECURITY: central admin-role checker used by RLS and triggers.
create or replace function public.is_admin(_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = coalesce(_uid, auth.uid())
      and lower(coalesce(p.role, '')) = 'admin'
  );
$$;

-- SECURITY: prevent normal users from changing privileged profile fields.
create or replace function public.guard_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if auth.uid() = old.id and not public.is_admin(auth.uid()) then
    if coalesce(new.role, '') is distinct from coalesce(old.role, '')
      or coalesce(new.paid, false) is distinct from coalesce(old.paid, false)
      or coalesce(new.verified, false) is distinct from coalesce(old.verified, false) then
      raise exception 'Only admins can change role, paid, or verified fields';
    end if;
  end if;

  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  farm_name text,
  farm_category text,
  specialization text,
  avatar_url text,
  banner_url text,
  location text,
  bio text,
  paid boolean not null default false,
  subscription_tier text not null default 'free',
  subscription_status text not null default 'inactive',
  role text not null default 'farmer',
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('farmer', 'supplier', 'buyer', 'admin')),
  constraint profiles_subscription_tier_check check (subscription_tier in ('free', 'premium', 'premium_plus', 'vvip_premium')),
  constraint profiles_subscription_status_check check (subscription_status in ('inactive', 'active', 'cancelled'))
);

-- Backfill profile columns for older databases where public.profiles already existed
-- before these fields were introduced.
alter table public.profiles
  add column if not exists farm_name text,
  add column if not exists username text,
  add column if not exists farm_category text,
  add column if not exists specialization text,
  add column if not exists avatar_url text,
  add column if not exists banner_url text,
  add column if not exists location text,
  add column if not exists bio text,
  add column if not exists paid boolean not null default false,
  add column if not exists role text not null default 'farmer',
  add column if not exists verified boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles
  add column if not exists subscription_tier text not null default 'free';

alter table public.profiles
  add column if not exists subscription_status text not null default 'inactive';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_subscription_tier_check'
  ) then
    alter table public.profiles
      add constraint profiles_subscription_tier_check
      check (subscription_tier in ('free', 'premium', 'premium_plus', 'vvip_premium'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_subscription_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_subscription_status_check
      check (subscription_status in ('inactive', 'active', 'cancelled'));
  end if;
end $$;

create or replace function public.can_access_feature(_feature text, _uid uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _tier text;
begin
  select coalesce(subscription_tier, case when paid then 'premium' else 'free' end)
    into _tier
  from public.profiles
  where id = coalesce(_uid, auth.uid());

  _tier := lower(coalesce(_tier, 'free'));

  case lower(coalesce(_feature, ''))
    when 'live_market_prices' then
      return _tier in ('premium', 'premium_plus', 'vvip_premium');
    when 'order_tracking' then
      return _tier in ('premium_plus', 'vvip_premium');
    when 'verified_badge' then
      return _tier in ('premium_plus', 'vvip_premium');
    else
      return false;
  end case;
end;
$$;

create or replace function public.get_my_subscription()
returns table (
  subscription_tier text,
  subscription_status text,
  paid boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.subscription_tier,
    p.subscription_status,
    p.paid
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function public.get_profile_preview(_email text)
returns table (
  id uuid,
  email text,
  farm_name text,
  farm_category text,
  specialization text,
  avatar_url text,
  banner_url text,
  location text,
  bio text,
  subscription_tier text,
  verified boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.email,
    p.farm_name,
    p.farm_category,
    p.specialization,
    p.avatar_url,
    p.banner_url,
    p.location,
    p.bio,
    p.subscription_tier,
    p.verified
  from public.profiles p
  where lower(coalesce(p.email, '')) = lower(coalesce(_email, ''))
  limit 1;
$$;

create or replace function public.adjust_grow_video_metric(_video_id bigint, _metric text, _delta integer default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  case lower(coalesce(_metric, ''))
    when 'like_count' then
      update public.grow_videos
      set like_count = greatest(0, like_count + coalesce(_delta, 0))
      where id = _video_id;
    when 'comment_count' then
      update public.grow_videos
      set comment_count = greatest(0, comment_count + coalesce(_delta, 0))
      where id = _video_id;
    when 'save_count' then
      update public.grow_videos
      set save_count = greatest(0, save_count + coalesce(_delta, 0))
      where id = _video_id;
    when 'share_count' then
      update public.grow_videos
      set share_count = greatest(0, share_count + coalesce(_delta, 0))
      where id = _video_id;
    when 'view_count' then
      update public.grow_videos
      set view_count = greatest(0, view_count + coalesce(_delta, 0))
      where id = _video_id;
    else
      raise exception 'Unsupported metric';
  end case;
end;
$$;

create table if not exists public.posts (
  id bigserial primary key,
  owner_id uuid references auth.users(id) on delete set null default auth.uid(),
  owner_email text,
  title text not null,
  farm text,
  location text,
  amount text,
  unit_price numeric(12,2) not null default 0,
  price numeric(12,2) not null default 0,
  contact text,
  category text not null default 'produce',
  description text,
  image_url text,
  video_url text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_price_check check (price >= 0),
  constraint posts_unit_price_check check (unit_price >= 0)
);

create table if not exists public.messages (
  id bigserial primary key,
  sender_id uuid references auth.users(id) on delete set null default auth.uid(),
  sender_email text,
  receiver_id uuid references auth.users(id) on delete set null,
  receiver_email text,
  content text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_content_check check (length(trim(content)) > 0)
);

create table if not exists public.jobs (
  id bigserial primary key,
  title text not null,
  job_type text not null,
  location text not null,
  duration text,
  salary_min integer not null default 0,
  salary_max integer not null default 0,
  description text,
  requirements text,
  contact_whatsapp text,
  contact_email text,
  posted_by text,
  posted_by_type text,
  posted_by_id uuid references auth.users(id) on delete set null default auth.uid(),
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_salary_bounds_check check (salary_min >= 0 and salary_max >= 0 and salary_min <= salary_max),
  constraint jobs_status_check check (status in ('open', 'closed', 'filled'))
);

create table if not exists public.job_applications (
  id bigserial primary key,
  job_id bigint not null references public.jobs(id) on delete cascade,
  applicant_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  applicant_email text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_applications_status_check check (status in ('pending', 'approved', 'rejected')),
  constraint job_applications_unique unique (job_id, applicant_id)
);

-- Optional support tables for app modules that currently store data in localStorage.
create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references auth.users(id) on delete set null default auth.uid(),
  email text not null,
  farm_name text,
  role text not null default 'farmer/supplier',
  status text not null default 'pending',
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verification_requests_status_check check (status in ('pending', 'approved', 'rejected'))
);

create table if not exists public.delivery_drivers (
  id bigserial primary key,
  owner_id uuid references auth.users(id) on delete set null default auth.uid(),
  driver_name text not null,
  vehicle_type text not null,
  phone text not null,
  location text not null,
  service_area text not null,
  cost_per_100km numeric(10,2) not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_drivers_cost_check check (cost_per_100km > 0)
);

create table if not exists public.events (
  id bigserial primary key,
  title text not null,
  description text,
  event_date timestamptz,
  location text,
  ticket_price numeric(10,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_ticket_price_check check (ticket_price >= 0)
);

create table if not exists public.event_registrations (
  id bigserial primary key,
  event_id bigint references public.events(id) on delete cascade,
  event_name text not null default 'Big Farming Event',
  email text not null,
  phone text not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.seller_reviews (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  buyer_email text,
  seller_name text not null,
  seller_email text,
  order_ref text not null,
  rating integer not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_reviews_rating_check check (rating between 1 and 5),
  constraint seller_reviews_comment_length_check check (length(coalesce(comment, '')) <= 500)
);

create table if not exists public.escrow_plans (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  order_ref text not null,
  amount numeric(12,2) not null,
  deposit_amount numeric(12,2) not null,
  release_amount numeric(12,2) not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint escrow_plans_amount_check check (amount > 0),
  constraint escrow_plans_deposit_check check (deposit_amount >= 0),
  constraint escrow_plans_release_check check (release_amount >= 0),
  constraint escrow_plans_status_check check (status in ('draft', 'funded', 'released', 'disputed'))
);

create table if not exists public.dispute_tickets (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  escrow_plan_id uuid references public.escrow_plans(id) on delete set null,
  reason text not null,
  evidence_note text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dispute_tickets_reason_check check (length(trim(reason)) > 0),
  constraint dispute_tickets_status_check check (status in ('open', 'under_review', 'resolved', 'rejected'))
);

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_farm_category on public.profiles(farm_category);
create index if not exists idx_profiles_specialization on public.profiles(specialization);
create index if not exists idx_posts_created_at on public.posts(created_at desc);
create index if not exists idx_posts_category on public.posts(category);
create index if not exists idx_posts_owner_id on public.posts(owner_id);
create index if not exists idx_messages_created_at on public.messages(created_at desc);
create index if not exists idx_messages_sender_email on public.messages(sender_email);
create index if not exists idx_messages_receiver_email on public.messages(receiver_email);
create index if not exists idx_jobs_status on public.jobs(status);
create index if not exists idx_jobs_created_at on public.jobs(created_at desc);
create index if not exists idx_job_applications_job_id on public.job_applications(job_id);
create index if not exists idx_event_registrations_email on public.event_registrations(email);
create index if not exists idx_verification_requests_email on public.verification_requests(email);
create index if not exists idx_seller_reviews_seller_name on public.seller_reviews(seller_name);
create index if not exists idx_seller_reviews_seller_email on public.seller_reviews(seller_email);
create index if not exists idx_escrow_plans_created_by on public.escrow_plans(created_by);
create index if not exists idx_escrow_plans_status on public.escrow_plans(status);
create index if not exists idx_dispute_tickets_created_by on public.dispute_tickets(created_by);
create index if not exists idx_dispute_tickets_status on public.dispute_tickets(status);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_guard_sensitive_fields on public.profiles;
create trigger trg_profiles_guard_sensitive_fields
before update on public.profiles
for each row execute function public.guard_profile_sensitive_fields();

drop trigger if exists trg_posts_updated_at on public.posts;
create trigger trg_posts_updated_at
before update on public.posts 
for each row execute function public.set_updated_at();

drop trigger if exists trg_jobs_updated_at on public.jobs;
create trigger trg_jobs_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

drop trigger if exists trg_job_applications_updated_at on public.job_applications;
create trigger trg_job_applications_updated_at
before update on public.job_applications
for each row execute function public.set_updated_at();

drop trigger if exists trg_verification_requests_updated_at on public.verification_requests;
create trigger trg_verification_requests_updated_at
before update on public.verification_requests
for each row execute function public.set_updated_at();

drop trigger if exists trg_delivery_drivers_updated_at on public.delivery_drivers;
create trigger trg_delivery_drivers_updated_at
before update on public.delivery_drivers
for each row execute function public.set_updated_at();

drop trigger if exists trg_events_updated_at on public.events;
create trigger trg_events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists trg_seller_reviews_updated_at on public.seller_reviews;
create trigger trg_seller_reviews_updated_at
before update on public.seller_reviews
for each row execute function public.set_updated_at();

drop trigger if exists trg_escrow_plans_updated_at on public.escrow_plans;
create trigger trg_escrow_plans_updated_at
before update on public.escrow_plans
for each row execute function public.set_updated_at();

drop trigger if exists trg_dispute_tickets_updated_at on public.dispute_tickets;
create trigger trg_dispute_tickets_updated_at
before update on public.dispute_tickets
for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.messages enable row level security;
alter table public.jobs enable row level security;
alter table public.job_applications enable row level security;
alter table public.verification_requests enable row level security;
alter table public.delivery_drivers enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.seller_reviews enable row level security;
alter table public.escrow_plans enable row level security;
alter table public.dispute_tickets enable row level security;

alter table public.profiles force row level security;
alter table public.posts force row level security;
alter table public.messages force row level security;
alter table public.jobs force row level security;
alter table public.job_applications force row level security;
alter table public.verification_requests force row level security;
alter table public.delivery_drivers force row level security;
alter table public.events force row level security;
alter table public.event_registrations force row level security;
alter table public.seller_reviews force row level security;
alter table public.escrow_plans force row level security;
alter table public.dispute_tickets force row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin
on public.profiles for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists profiles_update_subscription_self_service on public.profiles;
create policy profiles_update_subscription_self_service
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and coalesce(role, 'farmer') = coalesce((select role from public.profiles where id = auth.uid()), 'farmer')
  and coalesce(verified, false) = coalesce((select verified from public.profiles where id = auth.uid()), false)
  and lower(coalesce(subscription_tier, 'free')) in ('free', 'premium', 'premium_plus', 'vvip_premium')
  and lower(coalesce(subscription_status, 'inactive')) in ('inactive', 'active', 'cancelled')
);

drop policy if exists posts_select_authenticated on public.posts;
create policy posts_select_authenticated
on public.posts for select
to authenticated
using (true);

drop policy if exists posts_insert_authenticated on public.posts;
create policy posts_insert_authenticated
on public.posts for insert
to authenticated
with check (coalesce(owner_id, auth.uid()) = auth.uid());

drop policy if exists posts_update_owner on public.posts;
create policy posts_update_owner
on public.posts for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists posts_delete_owner on public.posts;
create policy posts_delete_owner
on public.posts for delete
to authenticated
using (owner_id = auth.uid());

drop policy if exists messages_select_participant on public.messages;
create policy messages_select_participant
on public.messages for select
to authenticated
using (
  sender_id = auth.uid()
  or receiver_id = auth.uid()
  or lower(coalesce(receiver_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or lower(coalesce(sender_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists messages_insert_sender on public.messages;
create policy messages_insert_sender
on public.messages for insert
to authenticated
with check (
  coalesce(sender_id, auth.uid()) = auth.uid()
  and lower(coalesce(sender_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  and length(trim(coalesce(content, ''))) > 0
  and lower(coalesce(receiver_email, '')) <> ''
);

drop policy if exists messages_update_receiver on public.messages;
create policy messages_update_receiver
on public.messages for update
to authenticated
using (
  receiver_id = auth.uid()
  or lower(coalesce(receiver_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
with check (
  receiver_id = auth.uid()
  or lower(coalesce(receiver_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists jobs_select_authenticated on public.jobs;
create policy jobs_select_authenticated
on public.jobs for select
to authenticated
using (true);

drop policy if exists jobs_insert_authenticated on public.jobs;
create policy jobs_insert_authenticated
on public.jobs for insert
to authenticated
with check (coalesce(posted_by_id, auth.uid()) = auth.uid());

drop policy if exists jobs_update_owner on public.jobs;
create policy jobs_update_owner
on public.jobs for update
to authenticated
using (posted_by_id = auth.uid())
with check (posted_by_id = auth.uid());

drop policy if exists jobs_delete_owner on public.jobs;
create policy jobs_delete_owner
on public.jobs for delete
to authenticated
using (posted_by_id = auth.uid());

drop policy if exists job_applications_select_own on public.job_applications;
create policy job_applications_select_own
on public.job_applications for select
to authenticated
using (applicant_id = auth.uid());

drop policy if exists job_applications_insert_own on public.job_applications;
create policy job_applications_insert_own
on public.job_applications for insert
to authenticated
with check (coalesce(applicant_id, auth.uid()) = auth.uid());

drop policy if exists job_applications_update_own on public.job_applications;
create policy job_applications_update_own
on public.job_applications for update
to authenticated
using (applicant_id = auth.uid())
with check (applicant_id = auth.uid());

drop policy if exists verification_requests_select_own on public.verification_requests;
create policy verification_requests_select_own
on public.verification_requests for select
to authenticated
using (requester_id = auth.uid());

drop policy if exists verification_requests_insert_own on public.verification_requests;
create policy verification_requests_insert_own
on public.verification_requests for insert
to authenticated
with check (
  coalesce(requester_id, auth.uid()) = auth.uid()
  and lower(coalesce(status, 'pending')) = 'pending'
  and approved_by is null
  and approved_at is null
  and rejected_at is null
);

drop policy if exists verification_requests_update_own on public.verification_requests;
drop policy if exists verification_requests_update_admin on public.verification_requests;
create policy verification_requests_update_admin
on public.verification_requests for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists verification_requests_select_admin on public.verification_requests;
create policy verification_requests_select_admin
on public.verification_requests for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists delivery_drivers_select_authenticated on public.delivery_drivers;
create policy delivery_drivers_select_authenticated
on public.delivery_drivers for select
to authenticated
using (true);

drop policy if exists delivery_drivers_insert_authenticated on public.delivery_drivers;
create policy delivery_drivers_insert_authenticated
on public.delivery_drivers for insert
to authenticated
with check (coalesce(owner_id, auth.uid()) = auth.uid());

drop policy if exists delivery_drivers_update_owner on public.delivery_drivers;
create policy delivery_drivers_update_owner
on public.delivery_drivers for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists delivery_drivers_delete_owner on public.delivery_drivers;
create policy delivery_drivers_delete_owner
on public.delivery_drivers for delete
to authenticated
using (owner_id = auth.uid());

drop policy if exists events_select_authenticated on public.events;
create policy events_select_authenticated
on public.events for select
to authenticated
using (true);

drop policy if exists event_registrations_select_own on public.event_registrations;
create policy event_registrations_select_own
on public.event_registrations for select
to authenticated
using (created_by = auth.uid());

drop policy if exists event_registrations_insert_own on public.event_registrations;
create policy event_registrations_insert_own
on public.event_registrations for insert
to authenticated
with check (coalesce(created_by, auth.uid()) = auth.uid());

drop policy if exists seller_reviews_select_related on public.seller_reviews;
create policy seller_reviews_select_related
on public.seller_reviews for select
to authenticated
using (
  buyer_id = auth.uid()
  or public.is_admin(auth.uid())
  or lower(coalesce(seller_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists seller_reviews_insert_own on public.seller_reviews;
create policy seller_reviews_insert_own
on public.seller_reviews for insert
to authenticated
with check (
  coalesce(buyer_id, auth.uid()) = auth.uid()
  and rating between 1 and 5
  and length(coalesce(comment, '')) <= 500
);

drop policy if exists escrow_plans_select_related on public.escrow_plans;
create policy escrow_plans_select_related
on public.escrow_plans for select
to authenticated
using (created_by = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists escrow_plans_insert_own on public.escrow_plans;
create policy escrow_plans_insert_own
on public.escrow_plans for insert
to authenticated
with check (
  coalesce(created_by, auth.uid()) = auth.uid()
  and amount > 0
);

drop policy if exists escrow_plans_update_owner_admin on public.escrow_plans;
create policy escrow_plans_update_owner_admin
on public.escrow_plans for update
to authenticated
using (created_by = auth.uid() or public.is_admin(auth.uid()))
with check (created_by = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists dispute_tickets_select_related on public.dispute_tickets;
create policy dispute_tickets_select_related
on public.dispute_tickets for select
to authenticated
using (created_by = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists dispute_tickets_insert_own on public.dispute_tickets;
create policy dispute_tickets_insert_own
on public.dispute_tickets for insert
to authenticated
with check (
  coalesce(created_by, auth.uid()) = auth.uid()
  and length(trim(coalesce(reason, ''))) > 0
);

drop policy if exists dispute_tickets_update_owner_admin on public.dispute_tickets;
create policy dispute_tickets_update_owner_admin
on public.dispute_tickets for update
to authenticated
using (created_by = auth.uid() or public.is_admin(auth.uid()))
with check (created_by = auth.uid() or public.is_admin(auth.uid()));

-- Ensure realtime subscriptions can stream chat messages.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Create the storage bucket used by profile/upload pages.
insert into storage.buckets (id, name, public)
values ('farm-images', 'farm-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists storage_farm_images_public_read on storage.objects;
create policy storage_farm_images_public_read
on storage.objects for select
to public
using (bucket_id = 'farm-images');

drop policy if exists storage_farm_images_auth_insert on storage.objects;
create policy storage_farm_images_auth_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'farm-images'
  and owner = auth.uid()
);

drop policy if exists storage_farm_images_auth_update on storage.objects;
create policy storage_farm_images_auth_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'farm-images'
  and owner = auth.uid()
)
with check (
  bucket_id = 'farm-images'
  and owner = auth.uid()
);

drop policy if exists storage_farm_images_auth_delete on storage.objects;
create policy storage_farm_images_auth_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'farm-images'
  and owner = auth.uid()
);

create table if not exists public.grow_videos (
  id bigserial primary key,
  creator_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  creator_email text,
  creator_name text,
  creator_avatar_url text,
  caption text not null,
  hashtags text[] not null default '{}',
  location_text text,
  category text not null,
  thumbnail_url text,
  video_url text not null,
  duration_seconds integer not null default 0,
  attached_post_id bigint references public.posts(id) on delete set null,
  attached_title text,
  attached_category text,
  visibility text not null default 'public',
  moderation_status text not null default 'approved',
  like_count integer not null default 0,
  comment_count integer not null default 0,
  save_count integer not null default 0,
  share_count integer not null default 0,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grow_videos_caption_check check (length(trim(caption)) between 3 and 2000),
  constraint grow_videos_duration_check check (duration_seconds between 1 and 600),
  constraint grow_videos_visibility_check check (visibility in ('public', 'followers')),
  constraint grow_videos_moderation_status_check check (moderation_status in ('approved', 'pending', 'hidden', 'rejected')),
  constraint grow_videos_like_count_check check (like_count >= 0),
  constraint grow_videos_comment_count_check check (comment_count >= 0),
  constraint grow_videos_save_count_check check (save_count >= 0),
  constraint grow_videos_share_count_check check (share_count >= 0),
  constraint grow_videos_view_count_check check (view_count >= 0)
);

create table if not exists public.grow_video_likes (
  id bigserial primary key,
  video_id bigint not null references public.grow_videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  constraint grow_video_likes_unique unique (video_id, user_id)
);

create table if not exists public.grow_video_saves (
  id bigserial primary key,
  video_id bigint not null references public.grow_videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  constraint grow_video_saves_unique unique (video_id, user_id)
);

create table if not exists public.grow_video_comments (
  id bigserial primary key,
  video_id bigint not null references public.grow_videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  user_email text,
  user_name text,
  user_avatar_url text,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grow_video_comments_content_check check (length(trim(content)) between 1 and 500)
);

create table if not exists public.grow_follows (
  id bigserial primary key,
  follower_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint grow_follows_unique unique (follower_id, followee_id),
  constraint grow_follows_self_check check (follower_id <> followee_id)
);

create table if not exists public.grow_notifications (
  id bigserial primary key,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null default auth.uid(),
  actor_name text,
  actor_avatar_url text,
  video_id bigint references public.grow_videos(id) on delete cascade,
  comment_id bigint references public.grow_video_comments(id) on delete cascade,
  event_type text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grow_notifications_event_type_check check (event_type in ('like', 'comment', 'follow', 'mention', 'report_update', 'video_approved', 'video_hidden', 'market_interest')),
  constraint grow_notifications_message_check check (length(trim(message)) between 1 and 280)
);

create table if not exists public.grow_reports (
  id bigserial primary key,
  reporter_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  video_id bigint not null references public.grow_videos(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grow_reports_reason_check check (length(trim(reason)) between 3 and 120),
  constraint grow_reports_details_check check (length(coalesce(details, '')) <= 1000),
  constraint grow_reports_status_check check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  constraint grow_reports_unique unique (reporter_id, video_id)
);

create index if not exists idx_grow_videos_created_at on public.grow_videos(created_at desc);
create index if not exists idx_grow_videos_creator_id on public.grow_videos(creator_id);
create index if not exists idx_grow_videos_category on public.grow_videos(category);
create index if not exists idx_grow_videos_moderation_status on public.grow_videos(moderation_status);
create index if not exists idx_grow_video_likes_video_id on public.grow_video_likes(video_id);
create index if not exists idx_grow_video_likes_user_id on public.grow_video_likes(user_id);
create index if not exists idx_grow_video_saves_video_id on public.grow_video_saves(video_id);
create index if not exists idx_grow_video_saves_user_id on public.grow_video_saves(user_id);
create index if not exists idx_grow_video_comments_video_id on public.grow_video_comments(video_id);
create index if not exists idx_grow_video_comments_user_id on public.grow_video_comments(user_id);
create index if not exists idx_grow_follows_followee_id on public.grow_follows(followee_id);
create index if not exists idx_grow_follows_follower_id on public.grow_follows(follower_id);
create index if not exists idx_grow_notifications_recipient_id on public.grow_notifications(recipient_id);
create index if not exists idx_grow_notifications_created_at on public.grow_notifications(created_at desc);
create index if not exists idx_grow_reports_video_id on public.grow_reports(video_id);
create index if not exists idx_grow_reports_status on public.grow_reports(status);

drop trigger if exists trg_grow_videos_updated_at on public.grow_videos;
create trigger trg_grow_videos_updated_at
before update on public.grow_videos
for each row execute function public.set_updated_at();

drop trigger if exists trg_grow_video_comments_updated_at on public.grow_video_comments;
create trigger trg_grow_video_comments_updated_at
before update on public.grow_video_comments
for each row execute function public.set_updated_at();

drop trigger if exists trg_grow_notifications_updated_at on public.grow_notifications;
create trigger trg_grow_notifications_updated_at
before update on public.grow_notifications
for each row execute function public.set_updated_at();

drop trigger if exists trg_grow_reports_updated_at on public.grow_reports;
create trigger trg_grow_reports_updated_at
before update on public.grow_reports
for each row execute function public.set_updated_at();

alter table public.grow_videos enable row level security;
alter table public.grow_video_likes enable row level security;
alter table public.grow_video_saves enable row level security;
alter table public.grow_video_comments enable row level security;
alter table public.grow_follows enable row level security;
alter table public.grow_notifications enable row level security;
alter table public.grow_reports enable row level security;

alter table public.grow_videos force row level security;
alter table public.grow_video_likes force row level security;
alter table public.grow_video_saves force row level security;
alter table public.grow_video_comments force row level security;
alter table public.grow_follows force row level security;
alter table public.grow_notifications force row level security;
alter table public.grow_reports force row level security;

drop policy if exists grow_videos_select_visible on public.grow_videos;
create policy grow_videos_select_visible
on public.grow_videos for select
to authenticated
using (
  creator_id = auth.uid()
  or public.is_admin(auth.uid())
  or (
    moderation_status = 'approved'
    and (
      visibility = 'public'
      or exists (
        select 1
        from public.grow_follows gf
        where gf.followee_id = grow_videos.creator_id
          and gf.follower_id = auth.uid()
      )
    )
  )
);

drop policy if exists grow_videos_insert_own on public.grow_videos;
create policy grow_videos_insert_own
on public.grow_videos for insert
to authenticated
with check (
  coalesce(creator_id, auth.uid()) = auth.uid()
  and length(trim(coalesce(caption, ''))) between 3 and 2000
  and duration_seconds between 1 and 600
);

drop policy if exists grow_videos_update_owner_admin on public.grow_videos;
create policy grow_videos_update_owner_admin
on public.grow_videos for update
to authenticated
using (creator_id = auth.uid() or public.is_admin(auth.uid()))
with check (creator_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists grow_videos_delete_owner_admin on public.grow_videos;
create policy grow_videos_delete_owner_admin
on public.grow_videos for delete
to authenticated
using (creator_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists grow_video_likes_select_authenticated on public.grow_video_likes;
create policy grow_video_likes_select_authenticated
on public.grow_video_likes for select
to authenticated
using (true);

drop policy if exists grow_video_likes_insert_own on public.grow_video_likes;
create policy grow_video_likes_insert_own
on public.grow_video_likes for insert
to authenticated
with check (coalesce(user_id, auth.uid()) = auth.uid());

drop policy if exists grow_video_likes_delete_own on public.grow_video_likes;
create policy grow_video_likes_delete_own
on public.grow_video_likes for delete
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists grow_video_saves_select_own on public.grow_video_saves;
create policy grow_video_saves_select_own
on public.grow_video_saves for select
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists grow_video_saves_insert_own on public.grow_video_saves;
create policy grow_video_saves_insert_own
on public.grow_video_saves for insert
to authenticated
with check (coalesce(user_id, auth.uid()) = auth.uid());

drop policy if exists grow_video_saves_delete_own on public.grow_video_saves;
create policy grow_video_saves_delete_own
on public.grow_video_saves for delete
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists grow_video_comments_select_authenticated on public.grow_video_comments;
create policy grow_video_comments_select_authenticated
on public.grow_video_comments for select
to authenticated
using (true);

drop policy if exists grow_video_comments_insert_own on public.grow_video_comments;
create policy grow_video_comments_insert_own
on public.grow_video_comments for insert
to authenticated
with check (
  coalesce(user_id, auth.uid()) = auth.uid()
  and length(trim(coalesce(content, ''))) between 1 and 500
);

drop policy if exists grow_video_comments_update_own_admin on public.grow_video_comments;
create policy grow_video_comments_update_own_admin
on public.grow_video_comments for update
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()))
with check (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists grow_video_comments_delete_own_admin on public.grow_video_comments;
create policy grow_video_comments_delete_own_admin
on public.grow_video_comments for delete
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists grow_follows_select_authenticated on public.grow_follows;
create policy grow_follows_select_authenticated
on public.grow_follows for select
to authenticated
using (true);

drop policy if exists grow_follows_insert_own on public.grow_follows;
create policy grow_follows_insert_own
on public.grow_follows for insert
to authenticated
with check (
  coalesce(follower_id, auth.uid()) = auth.uid()
  and follower_id <> followee_id
);

drop policy if exists grow_follows_delete_own on public.grow_follows;
create policy grow_follows_delete_own
on public.grow_follows for delete
to authenticated
using (follower_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists grow_notifications_select_related on public.grow_notifications;
create policy grow_notifications_select_related
on public.grow_notifications for select
to authenticated
using (recipient_id = auth.uid() or actor_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists grow_notifications_insert_actor on public.grow_notifications;
create policy grow_notifications_insert_actor
on public.grow_notifications for insert
to authenticated
with check (coalesce(actor_id, auth.uid()) = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists grow_notifications_update_recipient_admin on public.grow_notifications;
create policy grow_notifications_update_recipient_admin
on public.grow_notifications for update
to authenticated
using (recipient_id = auth.uid() or public.is_admin(auth.uid()))
with check (recipient_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists grow_reports_select_related on public.grow_reports;
create policy grow_reports_select_related
on public.grow_reports for select
to authenticated
using (reporter_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists grow_reports_insert_own on public.grow_reports;
create policy grow_reports_insert_own
on public.grow_reports for insert
to authenticated
with check (
  coalesce(reporter_id, auth.uid()) = auth.uid()
  and length(trim(coalesce(reason, ''))) between 3 and 120
  and length(coalesce(details, '')) <= 1000
);

drop policy if exists grow_reports_update_admin on public.grow_reports;
create policy grow_reports_update_admin
on public.grow_reports for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'grow_videos'
  ) then
    alter publication supabase_realtime add table public.grow_videos;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'grow_video_comments'
  ) then
    alter publication supabase_realtime add table public.grow_video_comments;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'grow_notifications'
  ) then
    alter publication supabase_realtime add table public.grow_notifications;
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('grows-media', 'grows-media', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists storage_grows_media_public_read on storage.objects;
create policy storage_grows_media_public_read
on storage.objects for select
to public
using (bucket_id = 'grows-media');

drop policy if exists storage_grows_media_auth_insert on storage.objects;
create policy storage_grows_media_auth_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'grows-media'
  and owner = auth.uid()
);

drop policy if exists storage_grows_media_auth_update on storage.objects;
create policy storage_grows_media_auth_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'grows-media'
  and owner = auth.uid()
)
with check (
  bucket_id = 'grows-media'
  and owner = auth.uid()
);

drop policy if exists storage_grows_media_auth_delete on storage.objects;
create policy storage_grows_media_auth_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'grows-media'
  and owner = auth.uid()
);
